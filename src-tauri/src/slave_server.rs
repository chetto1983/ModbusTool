//! Slave transports: TCP, RTU over TCP, UDP and serial (RTU, ASCII) listeners.

use crate::frame_io::{
    binary_to_wire, wire_to_binary, ByteStream, FrameError, FrameKind, FrameReader,
};
use crate::link::LinkConfig;
use crate::slave::{unit_of, UnitStore, BROADCAST_UNIT};
use crate::traffic::{self, Direction, Origin, TrafficSink};
use rmodbus::ModbusProto;
use serde::{Deserialize, Serialize};
use std::io::{self, Write};
use std::net::{SocketAddr, TcpListener, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

/// How often blocked loops wake up to check for a stop request.
const POLL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlaveConfig {
    pub link: LinkConfig,
    pub delay_ms: u64,
}

#[derive(Clone)]
struct Ctx {
    store: Arc<UnitStore>,
    sink: TrafficSink,
    stop: Arc<AtomicBool>,
    delay: Duration,
    proto: ModbusProto,
}

impl Ctx {
    fn stopped(&self) -> bool {
        self.stop.load(Ordering::Relaxed)
    }

    fn info(&self, peer: &str, message: impl Into<String>) {
        traffic::info(&self.sink, Origin::Slave, peer, message);
    }
}

/// A running slave. Dropping it stops every listener and connection thread.
pub struct SlaveServer {
    stop: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
    pub local_addr: Option<SocketAddr>,
}

impl SlaveServer {
    pub fn start(
        config: &SlaveConfig,
        store: Arc<UnitStore>,
        sink: TrafficSink,
    ) -> io::Result<Self> {
        let ctx = Ctx {
            store,
            sink,
            stop: Arc::new(AtomicBool::new(false)),
            delay: Duration::from_millis(config.delay_ms),
            proto: config.link.proto(),
        };
        let endpoint = config.link.describe();
        let (thread, local_addr) = match &config.link {
            LinkConfig::Tcp { host, port } | LinkConfig::RtuOverTcp { host, port } => {
                let listener = TcpListener::bind((host.as_str(), *port))?;
                listener.set_nonblocking(true)?;
                let addr = listener.local_addr()?;
                let ctx = ctx.clone();
                (
                    thread::spawn(move || accept_loop(listener, ctx)),
                    Some(addr),
                )
            }
            LinkConfig::Udp { host, port } => {
                let socket = UdpSocket::bind((host.as_str(), *port))?;
                socket.set_read_timeout(Some(POLL))?;
                let addr = socket.local_addr()?;
                let ctx = ctx.clone();
                (thread::spawn(move || udp_loop(socket, ctx)), Some(addr))
            }
            LinkConfig::Rtu { serial } | LinkConfig::Ascii { serial } => {
                let port = serial.open(POLL)?;
                let ctx = ctx.clone();
                let name = serial.port.clone();
                (thread::spawn(move || serve_stream(port, name, ctx)), None)
            }
        };
        ctx.info(&endpoint, format!("Listening on {endpoint}"));
        Ok(Self {
            stop: ctx.stop,
            threads: vec![thread],
            local_addr,
        })
    }

    /// Serves an already opened serial port (used for pseudo-terminal tests).
    #[cfg(test)]
    fn start_on_port(
        port: Box<dyn serialport::SerialPort>,
        proto: ModbusProto,
        store: Arc<UnitStore>,
        sink: TrafficSink,
    ) -> Self {
        let ctx = Ctx {
            store,
            sink,
            stop: Arc::new(AtomicBool::new(false)),
            delay: Duration::ZERO,
            proto,
        };
        let stop = ctx.stop.clone();
        let thread = thread::spawn(move || serve_stream(port, "pty".into(), ctx));
        Self {
            stop,
            threads: vec![thread],
            local_addr: None,
        }
    }
}

impl Drop for SlaveServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
    }
}

fn accept_loop(listener: TcpListener, ctx: Ctx) {
    let mut connections = Vec::new();
    while !ctx.stopped() {
        match listener.accept() {
            Ok((stream, peer)) => {
                let peer = peer.to_string();
                if let Err(e) = stream.set_nonblocking(false) {
                    ctx.info(&peer, format!("Connection rejected: {e}"));
                    continue;
                }
                ctx.info(&peer, "Client connected");
                let ctx = ctx.clone();
                connections.push(thread::spawn(move || serve_stream(stream, peer, ctx)));
            }
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => thread::sleep(POLL),
            Err(e) => {
                ctx.info("listener", format!("Accept failed: {e}"));
                thread::sleep(POLL);
            }
        }
        prune_finished(&mut connections);
    }
    for connection in connections {
        let _ = connection.join();
    }
}

/// Drops the handles of connection threads that already ended, so a long-running listener
/// does not accumulate one handle per past client.
fn prune_finished(connections: &mut Vec<JoinHandle<()>>) {
    connections.retain(|c| !c.is_finished());
}

fn serve_stream<S: ByteStream + Write>(mut stream: S, peer: String, ctx: Ctx) {
    let mut reader = FrameReader::new(ctx.proto, FrameKind::Request);
    while !ctx.stopped() {
        match reader.next_frame(&mut stream, Instant::now() + POLL) {
            Ok(wire) => {
                if let Some(response) = respond(&ctx, &peer, &wire) {
                    if let Err(e) = stream.write_all(&response) {
                        ctx.info(&peer, format!("Send failed: {e}"));
                        return;
                    }
                    traffic::frame(
                        &ctx.sink,
                        Origin::Slave,
                        Direction::Tx,
                        &peer,
                        ctx.proto,
                        &response,
                        FrameKind::Response,
                    );
                }
            }
            Err(FrameError::Timeout) => {}
            Err(FrameError::Closed) => {
                ctx.info(&peer, "Client disconnected");
                return;
            }
            Err(e @ FrameError::Broken(_)) => ctx.info(&peer, format!("Discarded {e}")),
            Err(FrameError::Io(e)) => {
                ctx.info(&peer, format!("Connection error: {e}"));
                return;
            }
        }
    }
}

fn udp_loop(socket: UdpSocket, ctx: Ctx) {
    let mut buf = [0u8; 512];
    while !ctx.stopped() {
        match socket.recv_from(&mut buf) {
            Ok((len, peer)) => {
                let peer_name = peer.to_string();
                if let Some(response) = respond(&ctx, &peer_name, &buf[..len]) {
                    if let Err(e) = socket.send_to(&response, peer) {
                        ctx.info(&peer_name, format!("Send failed: {e}"));
                        continue;
                    }
                    traffic::frame(
                        &ctx.sink,
                        Origin::Slave,
                        Direction::Tx,
                        &peer_name,
                        ctx.proto,
                        &response,
                        FrameKind::Response,
                    );
                }
            }
            Err(e) if crate::frame_io::is_timeout(&e) => {}
            Err(e) => {
                ctx.info("udp", format!("Receive failed: {e}"));
                thread::sleep(POLL);
            }
        }
    }
}

/// Logs the request, processes it and returns the response in wire form, after the delay.
fn respond(ctx: &Ctx, peer: &str, wire: &[u8]) -> Option<Vec<u8>> {
    traffic::frame(
        &ctx.sink,
        Origin::Slave,
        Direction::Rx,
        peer,
        ctx.proto,
        wire,
        FrameKind::Request,
    );
    let binary = match wire_to_binary(ctx.proto, wire) {
        Ok(binary) => binary,
        Err(e) => {
            ctx.info(peer, format!("Discarded {e}"));
            return None;
        }
    };
    let Some(response) = ctx.store.handle(ctx.proto, &binary) else {
        if let Some(unit) = unit_of(ctx.proto, &binary).filter(|&u| u != BROADCAST_UNIT) {
            if !ctx.store.unit_ids().contains(&unit) {
                ctx.info(
                    peer,
                    format!("Ignored request for unit {unit}: not configured"),
                );
            }
        }
        return None;
    };
    sleep_unless_stopped(ctx, ctx.delay);
    match binary_to_wire(ctx.proto, &response) {
        Ok(wire) => Some(wire),
        Err(e) => {
            ctx.info(peer, format!("Could not encode response: {e}"));
            None
        }
    }
}

fn sleep_unless_stopped(ctx: &Ctx, total: Duration) {
    let end = Instant::now() + total;
    while !ctx.stopped() {
        let now = Instant::now();
        if now >= end {
            return;
        }
        thread::sleep((end - now).min(POLL));
    }
}

#[cfg(test)]
#[path = "slave_server_tests.rs"]
mod tests;
