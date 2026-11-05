use super::*;
use crate::link::SerialConfig;
use crate::slave::Table;
use crate::traffic::testing::recorder;
use rmodbus::client::ModbusRequest;
use serialport::SerialPort;
use std::net::TcpStream;

fn store_with(unit: u8) -> Arc<UnitStore> {
    let store = Arc::new(UnitStore::default());
    store.set_units(&[unit]);
    store
}

fn tcp_config(link: fn(String, u16) -> LinkConfig, delay_ms: u64) -> SlaveConfig {
    SlaveConfig {
        link: link("127.0.0.1".into(), 0),
        delay_ms,
    }
}

fn tcp(host: String, port: u16) -> LinkConfig {
    LinkConfig::Tcp { host, port }
}

fn rtu_over_tcp(host: String, port: u16) -> LinkConfig {
    LinkConfig::RtuOverTcp { host, port }
}

fn udp(host: String, port: u16) -> LinkConfig {
    LinkConfig::Udp { host, port }
}

/// Sends `request` (binary form) and returns the response in binary form.
fn exchange<S: ByteStream + Write>(
    stream: &mut S,
    proto: ModbusProto,
    request: &[u8],
) -> Result<Vec<u8>, FrameError> {
    stream.write_all(&binary_to_wire(proto, request)?)?;
    let mut reader = FrameReader::new(proto, FrameKind::Response);
    let wire = reader.next_frame(stream, Instant::now() + Duration::from_secs(2))?;
    wire_to_binary(proto, &wire)
}

fn write_then_read<S: ByteStream + Write>(stream: &mut S, proto: ModbusProto, unit: u8) {
    let mut req = ModbusRequest::new(unit, proto);
    let mut frame = Vec::new();
    req.generate_set_holdings_bulk(4100, &[0x04c8, 0x07e2, 0xffff], &mut frame)
        .unwrap();
    let response = exchange(stream, proto, &frame).unwrap();
    req.parse_ok(&response).unwrap();

    req.generate_get_holdings(4100, 3, &mut frame).unwrap();
    let response = exchange(stream, proto, &frame).unwrap();
    let mut values = Vec::new();
    req.parse_u16(&response, &mut values).unwrap();
    assert_eq!(values, [0x04c8, 0x07e2, 0xffff]);
}

#[test]
fn tcp_write_then_read() {
    let store = store_with(1);
    let (sink, events) = recorder();
    let server = SlaveServer::start(&tcp_config(tcp, 0), store.clone(), sink).unwrap();
    let mut client = TcpStream::connect(server.local_addr.unwrap()).unwrap();
    write_then_read(&mut client, ModbusProto::TcpUdp, 1);
    assert_eq!(
        store.read(1, Table::HoldingRegisters, 4100, 1).unwrap(),
        [0x04c8]
    );
    drop(server);
    let events = events.lock().unwrap();
    assert!(events
        .iter()
        .any(|e| e.message.as_deref() == Some("Client connected")));
    let frames = events
        .iter()
        .filter(|e| e.direction != Direction::Info)
        .count();
    assert_eq!(frames, 4);
}

#[test]
fn tcp_pipelined_requests_get_two_responses() {
    let server = SlaveServer::start(&tcp_config(tcp, 0), store_with(1), recorder().0).unwrap();
    let mut client = TcpStream::connect(server.local_addr.unwrap()).unwrap();
    let mut req = ModbusRequest::new(1, ModbusProto::TcpUdp);
    let mut frame = Vec::new();
    req.generate_get_coils(0, 8, &mut frame).unwrap();
    let mut both = frame.clone();
    both.extend_from_slice(&frame);
    client.write_all(&both).unwrap();
    let mut reader = FrameReader::new(ModbusProto::TcpUdp, FrameKind::Response);
    for _ in 0..2 {
        let deadline = Instant::now() + Duration::from_secs(2);
        let response = reader.next_frame(&mut client, deadline).unwrap();
        req.parse_ok(&response).unwrap();
    }
}

#[test]
fn rtu_over_tcp_write_then_read() {
    let server =
        SlaveServer::start(&tcp_config(rtu_over_tcp, 0), store_with(7), recorder().0).unwrap();
    let mut client = TcpStream::connect(server.local_addr.unwrap()).unwrap();
    write_then_read(&mut client, ModbusProto::Rtu, 7);
}

#[test]
fn udp_write_then_read() {
    let store = store_with(3);
    let server = SlaveServer::start(&tcp_config(udp, 0), store.clone(), recorder().0).unwrap();
    let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
    socket.connect(server.local_addr.unwrap()).unwrap();
    socket
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut req = ModbusRequest::new(3, ModbusProto::TcpUdp);
    let mut frame = Vec::new();
    req.generate_set_coils_bulk(10, &[true, false, true], &mut frame)
        .unwrap();
    socket.send(&frame).unwrap();
    let mut buf = [0u8; 512];
    let len = socket.recv(&mut buf).unwrap();
    req.parse_ok(&buf[..len]).unwrap();
    assert_eq!(store.read(3, Table::Coils, 10, 3).unwrap(), [1, 0, 1]);
}

#[cfg(unix)]
#[test]
fn serial_rtu_and_ascii_over_pseudo_terminals() {
    for proto in [ModbusProto::Rtu, ModbusProto::Ascii] {
        let (client, server_end) = serialport::TTYPort::pair().unwrap();
        let server =
            SlaveServer::start_on_port(Box::new(server_end), proto, store_with(2), recorder().0);
        let mut client: Box<dyn SerialPort> = Box::new(client);
        write_then_read(&mut client, proto, 2);
        drop(server);
    }
}

#[test]
fn unconfigured_unit_is_logged_and_not_answered() {
    let (sink, events) = recorder();
    let server = SlaveServer::start(&tcp_config(tcp, 0), store_with(1), sink).unwrap();
    let mut client = TcpStream::connect(server.local_addr.unwrap()).unwrap();
    let mut frame = Vec::new();
    ModbusRequest::new(9, ModbusProto::TcpUdp)
        .generate_get_coils(0, 1, &mut frame)
        .unwrap();
    client.write_all(&frame).unwrap();
    let mut reader = FrameReader::new(ModbusProto::TcpUdp, FrameKind::Response);
    let deadline = Instant::now() + Duration::from_millis(300);
    assert!(matches!(
        reader.next_frame(&mut client, deadline),
        Err(FrameError::Timeout)
    ));
    drop(server);
    let logged = events
        .lock()
        .unwrap()
        .iter()
        .any(|e| e.message.as_deref() == Some("Ignored request for unit 9: not configured"));
    assert!(logged);
}

#[test]
fn response_delay_is_applied() {
    let server = SlaveServer::start(&tcp_config(tcp, 250), store_with(1), recorder().0).unwrap();
    let mut client = TcpStream::connect(server.local_addr.unwrap()).unwrap();
    let mut frame = Vec::new();
    ModbusRequest::new(1, ModbusProto::TcpUdp)
        .generate_get_inputs(0, 1, &mut frame)
        .unwrap();
    let started = Instant::now();
    exchange(&mut client, ModbusProto::TcpUdp, &frame).unwrap();
    assert!(started.elapsed() >= Duration::from_millis(250));
}

#[test]
fn stop_closes_connections_and_frees_the_port() {
    let server = SlaveServer::start(&tcp_config(tcp, 0), store_with(1), recorder().0).unwrap();
    let addr = server.local_addr.unwrap();
    let _client = TcpStream::connect(addr).unwrap();
    let started = Instant::now();
    drop(server);
    assert!(started.elapsed() < Duration::from_secs(1));
    let config = SlaveConfig {
        link: LinkConfig::Tcp {
            host: "127.0.0.1".into(),
            port: addr.port(),
        },
        delay_ms: 0,
    };
    SlaveServer::start(&config, store_with(1), recorder().0).unwrap();
}

#[test]
fn missing_serial_port_fails_to_start() {
    let config = SlaveConfig {
        link: LinkConfig::Rtu {
            serial: SerialConfig {
                port: "/dev/does-not-exist".into(),
                baud_rate: 9600,
                data_bits: 8,
                parity: crate::link::Parity::None,
                stop_bits: 1,
            },
        },
        delay_ms: 0,
    };
    assert!(SlaveServer::start(&config, store_with(1), recorder().0).is_err());
}
