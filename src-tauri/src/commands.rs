//! Tauri commands and the state they share. Blocking I/O runs on the blocking thread pool,
//! because synchronous Tauri commands run on the main thread and would freeze the window.

use crate::link::list_serial_ports;
use crate::master::{Master, MasterConfig, Operation, Outcome};
use crate::poller::{PollDefinition, PollResult, Poller, ResultSink, SharedMaster};
use crate::slave::{Table, UnitStore};
use crate::slave_server::{SlaveConfig, SlaveServer};
use crate::traffic::{self, Origin, TrafficEvent, TrafficSink};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime, State};

pub const TRAFFIC_EVENT: &str = "traffic";
pub const POLL_EVENT: &str = "poll-result";
const BATCH_PERIOD: Duration = Duration::from_millis(100);

pub struct AppState {
    master: SharedMaster,
    polls: Mutex<HashMap<String, Poller>>,
    slave: Mutex<Option<SlaveServer>>,
    store: Arc<UnitStore>,
    traffic: TrafficSink,
    results: ResultSink,
}

/// Forwards items to the UI in batches, so a busy bus does not flood the webview with events.
fn batch_to_ui<R: Runtime, T: Serialize + Clone + Send + 'static>(
    app: AppHandle<R>,
    event: &'static str,
    rx: Receiver<T>,
) {
    thread::spawn(move || loop {
        let Ok(first) = rx.recv() else { return };
        thread::sleep(BATCH_PERIOD);
        let mut batch = vec![first];
        batch.extend(rx.try_iter());
        if app.emit(event, batch).is_err() {
            return;
        }
    });
}

impl AppState {
    pub fn new<R: Runtime>(app: &AppHandle<R>) -> Self {
        let (traffic_tx, traffic_rx) = mpsc::channel::<TrafficEvent>();
        let (results_tx, results_rx) = mpsc::channel::<PollResult>();
        batch_to_ui(app.clone(), TRAFFIC_EVENT, traffic_rx);
        batch_to_ui(app.clone(), POLL_EVENT, results_rx);
        let traffic_tx = Mutex::new(traffic_tx);
        let results_tx = Mutex::new(results_tx);
        Self {
            master: Arc::new(Mutex::new(None)),
            polls: Mutex::new(HashMap::new()),
            slave: Mutex::new(None),
            store: Arc::new(UnitStore::default()),
            traffic: Arc::new(move |e| drop(traffic_tx.lock().unwrap().send(e))),
            results: Arc::new(move |r| drop(results_tx.lock().unwrap().send(r))),
        }
    }
}

async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn serial_ports() -> Vec<String> {
    list_serial_ports()
}

#[tauri::command]
pub async fn master_connect(
    state: State<'_, AppState>,
    config: MasterConfig,
) -> Result<String, String> {
    let shared = state.master.clone();
    let sink = state.traffic.clone();
    blocking(move || {
        let master = Master::connect(config).map_err(|e| e.to_string())?;
        let endpoint = master.endpoint();
        *shared.lock().unwrap() = Some(master);
        traffic::info(
            &sink,
            Origin::Master,
            &endpoint,
            format!("Connected to {endpoint}"),
        );
        Ok(endpoint)
    })
    .await
}

#[tauri::command]
pub fn master_disconnect(state: State<'_, AppState>) {
    state.polls.lock().unwrap().clear();
    if let Some(master) = state.master.lock().unwrap().take() {
        let endpoint = master.endpoint();
        traffic::info(&state.traffic, Origin::Master, &endpoint, "Disconnected");
    }
}

#[tauri::command]
pub async fn master_execute(
    state: State<'_, AppState>,
    unit: u8,
    operation: Operation,
) -> Result<Outcome, String> {
    let shared = state.master.clone();
    let sink = state.traffic.clone();
    blocking(move || match shared.lock().unwrap().as_mut() {
        Some(master) => master
            .execute(unit, &operation, &sink)
            .map_err(|e| e.to_string()),
        None => Err("Not connected".into()),
    })
    .await
}

#[tauri::command]
pub fn poll_start(state: State<'_, AppState>, definition: PollDefinition) {
    let id = definition.id.clone();
    let poller = Poller::start(
        definition,
        state.master.clone(),
        state.traffic.clone(),
        state.results.clone(),
    );
    // Replacing an existing poll drops (and stops) the old one.
    state.polls.lock().unwrap().insert(id, poller);
}

#[tauri::command]
pub fn poll_stop(state: State<'_, AppState>, id: String) {
    state.polls.lock().unwrap().remove(&id);
}

#[tauri::command]
pub async fn slave_start(
    state: State<'_, AppState>,
    config: SlaveConfig,
) -> Result<String, String> {
    let endpoint = config.link.describe();
    let store = state.store.clone();
    let sink = state.traffic.clone();
    let server =
        blocking(move || SlaveServer::start(&config, store, sink).map_err(|e| e.to_string()))
            .await?;
    *state.slave.lock().unwrap() = Some(server);
    Ok(endpoint)
}

#[tauri::command]
pub async fn slave_stop(state: State<'_, AppState>) -> Result<(), String> {
    let server = state.slave.lock().unwrap().take();
    if server.is_some() {
        traffic::info(&state.traffic, Origin::Slave, "slave", "Stopped");
    }
    // Joining the listener threads can take up to one poll period.
    blocking(move || {
        drop(server);
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn slave_set_units(state: State<'_, AppState>, units: Vec<u8>) {
    state.store.set_units(&units);
}

#[tauri::command]
pub fn slave_read(
    state: State<'_, AppState>,
    unit: u8,
    table: Table,
    address: u16,
    count: usize,
) -> Result<Vec<u16>, String> {
    state.store.read(unit, table, address, count)
}

#[tauri::command]
pub fn slave_write(
    state: State<'_, AppState>,
    unit: u8,
    table: Table,
    address: u16,
    values: Vec<u16>,
) -> Result<(), String> {
    state.store.write(unit, table, address, &values)
}

#[cfg(test)]
#[path = "commands_tests.rs"]
mod tests;
