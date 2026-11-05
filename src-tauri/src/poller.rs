//! Periodic reads, one thread per poll definition, sharing the master connection.

use crate::master::{Master, MasterError, Operation};
use crate::traffic::{now_ms, TrafficSink};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const STOP_CHECK: Duration = Duration::from_millis(50);

pub type SharedMaster = Arc<Mutex<Option<Master>>>;
pub type ResultSink = Arc<dyn Fn(PollResult) + Send + Sync>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollDefinition {
    pub id: String,
    pub unit: u8,
    pub operation: Operation,
    pub interval_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollResult {
    pub id: String,
    pub timestamp_ms: u64,
    pub values: Option<Vec<u16>>,
    pub error: Option<String>,
    pub timeout: bool,
    pub elapsed_ms: f64,
}

/// A running poll. Dropping it stops the thread.
pub struct Poller {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Poller {
    pub fn start(
        definition: PollDefinition,
        master: SharedMaster,
        traffic: TrafficSink,
        results: ResultSink,
    ) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let thread = thread::spawn(move || {
            let interval = Duration::from_millis(definition.interval_ms.max(10));
            while !flag.load(Ordering::Relaxed) {
                let started = Instant::now();
                let outcome = match master.lock().unwrap().as_mut() {
                    Some(m) => m.execute(definition.unit, &definition.operation, &traffic),
                    None => Err(MasterError::NotConnected),
                };
                results(to_result(&definition.id, outcome));
                while !flag.load(Ordering::Relaxed) && started.elapsed() < interval {
                    thread::sleep(STOP_CHECK.min(interval.saturating_sub(started.elapsed())));
                }
            }
        });
        Self {
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for Poller {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn to_result(id: &str, outcome: Result<crate::master::Outcome, MasterError>) -> PollResult {
    let (values, error, elapsed_ms) = match outcome {
        Ok(o) => (Some(o.values), None, o.elapsed_ms),
        Err(e) => (None, Some(e), 0.0),
    };
    PollResult {
        id: id.to_string(),
        timestamp_ms: now_ms(),
        values,
        timeout: error == Some(MasterError::Timeout),
        error: error.map(|e| e.to_string()),
        elapsed_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::link::LinkConfig;
    use crate::master::MasterConfig;
    use crate::slave::{Table, UnitStore};
    use crate::slave_server::{SlaveConfig, SlaveServer};
    use crate::traffic::testing::recorder;
    use std::sync::mpsc;

    fn definition(unit: u8) -> PollDefinition {
        PollDefinition {
            id: "p1".into(),
            unit,
            operation: Operation::ReadHoldingRegisters {
                address: 10,
                quantity: 2,
            },
            interval_ms: 50,
        }
    }

    fn channel_sink() -> (ResultSink, mpsc::Receiver<PollResult>) {
        let (tx, rx) = mpsc::channel();
        let tx = Mutex::new(tx);
        (Arc::new(move |r| drop(tx.lock().unwrap().send(r))), rx)
    }

    #[test]
    fn polls_repeatedly_and_stops_on_drop() {
        let store = Arc::new(UnitStore::default());
        store.set_units(&[1]);
        store
            .write(1, Table::HoldingRegisters, 10, &[5, 6])
            .unwrap();
        let link = LinkConfig::Tcp {
            host: "127.0.0.1".into(),
            port: 0,
        };
        let server =
            SlaveServer::start(&SlaveConfig { link, delay_ms: 0 }, store, recorder().0).unwrap();
        let link = LinkConfig::Tcp {
            host: "127.0.0.1".into(),
            port: server.local_addr.unwrap().port(),
        };
        let master = Master::connect(MasterConfig {
            link,
            timeout_ms: 300,
            retries: 0,
        })
        .unwrap();
        let shared: SharedMaster = Arc::new(Mutex::new(Some(master)));
        let (sink, rx) = channel_sink();
        let poller = Poller::start(definition(1), shared, recorder().0, sink);
        for _ in 0..3 {
            let result = rx.recv_timeout(Duration::from_secs(2)).unwrap();
            assert_eq!(result.values, Some(vec![5, 6]));
        }
        let started = Instant::now();
        drop(poller);
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn reports_not_connected() {
        let (sink, rx) = channel_sink();
        let _poller = Poller::start(
            definition(1),
            Arc::new(Mutex::new(None)),
            recorder().0,
            sink,
        );
        let result = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(result.error.as_deref(), Some("Not connected"));
        assert!(!result.timeout);
    }
}
