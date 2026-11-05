use super::*;
use crate::slave::{Table, UnitStore};
use crate::slave_server::{SlaveConfig, SlaveServer};
use crate::traffic::testing::recorder;
use std::io::Read;
use std::net::TcpListener;
use std::sync::Arc;
use std::thread;

fn slave(link: LinkConfig, unit: u8) -> (SlaveServer, Arc<UnitStore>) {
    let store = Arc::new(UnitStore::default());
    store.set_units(&[unit]);
    let server = SlaveServer::start(
        &SlaveConfig { link, delay_ms: 0 },
        store.clone(),
        recorder().0,
    )
    .unwrap();
    (server, store)
}

fn master(link: LinkConfig, retries: u8) -> Master {
    Master::connect(MasterConfig {
        link,
        timeout_ms: 300,
        retries,
    })
    .unwrap()
}

fn local(kind: fn(String, u16) -> LinkConfig, port: u16) -> LinkConfig {
    kind("127.0.0.1".into(), port)
}

fn tcp(host: String, port: u16) -> LinkConfig {
    LinkConfig::Tcp { host, port }
}

fn udp(host: String, port: u16) -> LinkConfig {
    LinkConfig::Udp { host, port }
}

fn rtu_over_tcp(host: String, port: u16) -> LinkConfig {
    LinkConfig::RtuOverTcp { host, port }
}

fn every_operation(master: &mut Master, store: &UnitStore, unit: u8) {
    let sink = recorder().0;
    let write = |m: &mut Master, op: Operation| m.execute(unit, &op, &sink).unwrap();
    write(
        master,
        Operation::WriteMultipleRegisters {
            address: 100,
            values: vec![1, 2, 65535],
        },
    );
    write(
        master,
        Operation::WriteSingleRegister {
            address: 103,
            value: 0x1234,
        },
    );
    write(
        master,
        Operation::WriteMultipleCoils {
            address: 5,
            values: vec![true, false, true],
        },
    );
    write(
        master,
        Operation::WriteSingleCoil {
            address: 8,
            value: true,
        },
    );
    store.write(unit, Table::InputRegisters, 7, &[42]).unwrap();
    store.write(unit, Table::DiscreteInputs, 3, &[1]).unwrap();

    let read = |m: &mut Master, op: Operation| m.execute(unit, &op, &sink).unwrap().values;
    assert_eq!(
        read(
            master,
            Operation::ReadHoldingRegisters {
                address: 100,
                quantity: 4
            }
        ),
        [1, 2, 65535, 0x1234]
    );
    assert_eq!(
        read(
            master,
            Operation::ReadCoils {
                address: 5,
                quantity: 4
            }
        ),
        [1, 0, 1, 1]
    );
    assert_eq!(
        read(
            master,
            Operation::ReadInputRegisters {
                address: 7,
                quantity: 1
            }
        ),
        [42]
    );
    assert_eq!(
        read(
            master,
            Operation::ReadDiscreteInputs {
                address: 2,
                quantity: 3
            }
        ),
        [0, 1, 0]
    );
}

#[test]
fn all_operations_over_tcp_udp_and_rtu_over_tcp() {
    for kind in [tcp, udp, rtu_over_tcp] {
        let (server, store) = slave(local(kind, 0), 4);
        let mut m = master(local(kind, server.local_addr.unwrap().port()), 0);
        every_operation(&mut m, &store, 4);
    }
}

#[cfg(unix)]
#[test]
fn all_operations_over_serial_rtu_and_ascii() {
    use crate::link::{Parity, SerialConfig};
    for ascii in [false, true] {
        let (client, server_end) = serialport::TTYPort::pair().unwrap();
        let serial = SerialConfig {
            port: server_end.name().unwrap(),
            baud_rate: 19200,
            data_bits: 8,
            parity: Parity::None,
            stop_bits: 1,
        };
        let link = if ascii {
            LinkConfig::Ascii { serial }
        } else {
            LinkConfig::Rtu { serial }
        };
        let store = Arc::new(UnitStore::default());
        store.set_units(&[9]);
        let config = SlaveConfig {
            link: link.clone(),
            delay_ms: 0,
        };
        let _server = SlaveServer::start(&config, store.clone(), recorder().0).unwrap();
        let mut m = Master {
            config: MasterConfig {
                link,
                timeout_ms: 500,
                retries: 0,
            },
            proto: if ascii {
                ModbusProto::Ascii
            } else {
                ModbusProto::Rtu
            },
            transport: Transport::Stream(
                Box::new(Box::new(client) as Box<dyn SerialPort>),
                FrameReader::new(
                    if ascii {
                        ModbusProto::Ascii
                    } else {
                        ModbusProto::Rtu
                    },
                    FrameKind::Response,
                ),
            ),
            next_transaction: 1,
        };
        every_operation(&mut m, &store, 9);
        drop(server_end);
    }
}

#[test]
fn timeouts_are_retried_then_reported() {
    let (server, _store) = slave(local(tcp, 0), 1);
    let mut m = master(local(tcp, server.local_addr.unwrap().port()), 2);
    let (sink, events) = recorder();
    let op = Operation::ReadCoils {
        address: 0,
        quantity: 1,
    };
    assert_eq!(m.execute(5, &op, &sink), Err(MasterError::Timeout));
    let sent = events
        .lock()
        .unwrap()
        .iter()
        .filter(|e| e.direction == Direction::Tx)
        .count();
    assert_eq!(sent, 3);
}

/// Fake TCP server answering every request with `reply(request)`.
fn fake_server(reply: fn(&[u8]) -> Vec<u8>) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 260];
        while let Ok(n) = stream.read(&mut buf) {
            if n == 0 || stream.write_all(&reply(&buf[..n])).is_err() {
                return;
            }
        }
    });
    port
}

#[test]
fn exception_codes_use_spec_names() {
    let port = fake_server(|req| vec![req[0], req[1], 0, 0, 0, 3, req[6], req[7] | 0x80, 0x0B]);
    let mut m = master(local(tcp, port), 0);
    let err = m
        .execute(
            1,
            &Operation::ReadHoldingRegisters {
                address: 0,
                quantity: 1,
            },
            &recorder().0,
        )
        .unwrap_err();
    assert_eq!(err, MasterError::Exception(0x0B));
    assert_eq!(
        err.to_string(),
        "Exception 0x0b: Gateway target device failed to respond"
    );
}

#[test]
fn stale_transaction_ids_are_skipped() {
    let port = fake_server(|req| {
        let mut stale = vec![0xAA, 0xAA, 0, 0, 0, 5, req[6], 3, 2, 0, 1];
        stale.extend_from_slice(&[req[0], req[1], 0, 0, 0, 5, req[6], 3, 2, 0, 7]);
        stale
    });
    let mut m = master(local(tcp, port), 0);
    let (sink, events) = recorder();
    let outcome = m
        .execute(
            1,
            &Operation::ReadHoldingRegisters {
                address: 0,
                quantity: 1,
            },
            &sink,
        )
        .unwrap();
    assert_eq!(outcome.values, [7]);
    let skipped =
        events.lock().unwrap().iter().any(|e| {
            e.message.as_deref() == Some("Discarded response with a stale transaction id")
        });
    assert!(skipped);
}

#[test]
fn limits_and_broadcast_rules() {
    let (server, _store) = slave(local(tcp, 0), 1);
    let mut m = master(local(tcp, server.local_addr.unwrap().port()), 0);
    let sink = recorder().0;
    let read = |quantity| Operation::ReadHoldingRegisters {
        address: 0,
        quantity,
    };
    assert!(m.execute(1, &read(123), &sink).is_ok());
    assert!(matches!(
        m.execute(1, &read(124), &sink),
        Err(MasterError::Invalid(_))
    ));
    let tail = Operation::ReadCoils {
        address: 65535,
        quantity: 2,
    };
    assert!(matches!(
        m.execute(1, &tail, &sink),
        Err(MasterError::Invalid(_))
    ));
    assert!(matches!(
        m.execute(0, &read(1), &sink),
        Err(MasterError::Invalid(_))
    ));
    let broadcast = Operation::WriteSingleRegister {
        address: 1,
        value: 2,
    };
    assert_eq!(
        m.execute(0, &broadcast, &sink).unwrap().values,
        Vec::<u16>::new()
    );
}

#[test]
fn connect_errors_are_reported() {
    let closed_port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let config = MasterConfig {
        link: local(tcp, closed_port),
        timeout_ms: 200,
        retries: 0,
    };
    assert!(Master::connect(config).is_err());
    let unresolvable = MasterConfig {
        link: LinkConfig::Tcp {
            host: "no-such-host.invalid".into(),
            port: 502,
        },
        timeout_ms: 200,
        retries: 0,
    };
    assert!(Master::connect(unresolvable).is_err());
}
