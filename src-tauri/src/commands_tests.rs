use super::*;
use crate::link::LinkConfig;
use std::net::TcpListener;
use std::sync::mpsc::Receiver;
use tauri::async_runtime::block_on;
use tauri::test::{mock_app, MockRuntime};
use tauri::{App, Listener, Manager};

fn app() -> App<MockRuntime> {
    let app = mock_app();
    let state = AppState::new(app.handle());
    app.manage(state);
    app
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

/// Collects the payloads of one event name.
fn events(app: &App<MockRuntime>, name: &'static str) -> Receiver<String> {
    let (tx, rx) = mpsc::channel();
    let tx = Mutex::new(tx);
    app.listen_any(name, move |e| {
        drop(tx.lock().unwrap().send(e.payload().to_string()))
    });
    rx
}

#[test]
fn slave_store_commands() {
    let app = app();
    slave_set_units(app.state(), vec![1, 2]);
    slave_write(app.state(), 2, Table::HoldingRegisters, 10, vec![4, 5]).unwrap();
    assert_eq!(
        slave_read(app.state(), 2, Table::HoldingRegisters, 10, 2).unwrap(),
        [4, 5]
    );
    assert!(slave_read(app.state(), 9, Table::Coils, 0, 1).is_err());
    assert!(slave_write(app.state(), 9, Table::Coils, 0, vec![1]).is_err());
    let _ = serial_ports();
}

#[test]
fn master_and_slave_round_trip_with_batched_events() {
    let app = app();
    let traffic = events(&app, TRAFFIC_EVENT);
    let results = events(&app, POLL_EVENT);
    let port = free_port();
    slave_set_units(app.state(), vec![1]);
    slave_write(app.state(), 1, Table::InputRegisters, 0, vec![42]).unwrap();
    let link = |host: &str| LinkConfig::Tcp {
        host: host.into(),
        port,
    };
    let endpoint = block_on(slave_start(
        app.state(),
        SlaveConfig {
            link: link("127.0.0.1"),
            delay_ms: 0,
        },
    ))
    .unwrap();
    assert_eq!(endpoint, format!("TCP 127.0.0.1:{port}"));

    let config = MasterConfig {
        link: link("127.0.0.1"),
        timeout_ms: 500,
        retries: 0,
    };
    block_on(master_connect(app.state(), config)).unwrap();
    let read = Operation::ReadInputRegisters {
        address: 0,
        quantity: 1,
    };
    let outcome = block_on(master_execute(app.state(), 1, read.clone())).unwrap();
    assert_eq!(outcome.values, [42]);

    poll_start(
        app.state(),
        PollDefinition {
            id: "p".into(),
            unit: 1,
            operation: read.clone(),
            interval_ms: 50,
        },
    );
    let batch = results.recv_timeout(Duration::from_secs(3)).unwrap();
    assert!(
        batch.contains(r#""id":"p""#) && batch.contains("[42]"),
        "{batch}"
    );
    poll_stop(app.state(), "p".into());

    let frames = traffic.recv_timeout(Duration::from_secs(3)).unwrap();
    assert!(frames.contains("Read Input Registers"), "{frames}");

    master_disconnect(app.state());
    let err = block_on(master_execute(app.state(), 1, read)).unwrap_err();
    assert_eq!(err, "Not connected");
    block_on(slave_stop(app.state())).unwrap();
    block_on(slave_stop(app.state())).unwrap();
}

#[test]
fn start_errors_are_returned_as_text() {
    let app = app();
    let busy = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = busy.local_addr().unwrap().port();
    let link = LinkConfig::Tcp {
        host: "127.0.0.1".into(),
        port,
    };
    assert!(block_on(slave_start(
        app.state(),
        SlaveConfig {
            link: link.clone(),
            delay_ms: 0
        }
    ))
    .is_err());
    drop(busy);
    let config = MasterConfig {
        link,
        timeout_ms: 200,
        retries: 0,
    };
    assert!(block_on(master_connect(app.state(), config)).is_err());
}
