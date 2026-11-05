//! Traffic monitor events, produced by master and slave and forwarded to the UI.

use crate::describe::{describe, FrameSummary};
use crate::frame_io::{wire_to_binary, FrameKind};
use rmodbus::ModbusProto;
use serde::Serialize;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Origin {
    Master,
    Slave,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Direction {
    Tx,
    Rx,
    Info,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrafficEvent {
    pub timestamp_ms: u64,
    pub origin: Origin,
    pub direction: Direction,
    pub peer: String,
    pub bytes: Vec<u8>,
    pub summary: Option<FrameSummary>,
    pub message: Option<String>,
}

pub type TrafficSink = Arc<dyn Fn(TrafficEvent) + Send + Sync>;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Emits one frame. `wire` is the frame as sent/received; the summary is derived from it.
pub fn frame(
    sink: &TrafficSink,
    origin: Origin,
    direction: Direction,
    peer: &str,
    proto: ModbusProto,
    wire: &[u8],
    kind: FrameKind,
) {
    let summary = match wire_to_binary(proto, wire) {
        Ok(binary) => describe(proto, &binary, kind),
        Err(e) => FrameSummary {
            unit: None,
            function: None,
            exception: None,
            text: e.to_string(),
        },
    };
    sink(TrafficEvent {
        timestamp_ms: now_ms(),
        origin,
        direction,
        peer: peer.to_string(),
        bytes: wire.to_vec(),
        summary: Some(summary),
        message: None,
    });
}

/// Emits a status line (connection opened, error, timeout...).
pub fn info(sink: &TrafficSink, origin: Origin, peer: &str, message: impl Into<String>) {
    sink(TrafficEvent {
        timestamp_ms: now_ms(),
        origin,
        direction: Direction::Info,
        peer: peer.to_string(),
        bytes: Vec::new(),
        summary: None,
        message: Some(message.into()),
    });
}

#[cfg(test)]
pub mod testing {
    use super::*;
    use std::sync::Mutex;

    /// Sink that stores events for assertions.
    pub fn recorder() -> (TrafficSink, Arc<Mutex<Vec<TrafficEvent>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let store = events.clone();
        let sink: TrafficSink = Arc::new(move |e| store.lock().unwrap().push(e));
        (sink, events)
    }

    #[test]
    fn ascii_frames_are_described_from_their_binary_form() {
        let (sink, events) = recorder();
        frame(
            &sink,
            Origin::Slave,
            Direction::Rx,
            "COM1",
            ModbusProto::Ascii,
            b":010300000002FA\r\n",
            FrameKind::Request,
        );
        info(&sink, Origin::Slave, "COM1", "listening");
        let events = events.lock().unwrap();
        let summary = events[0].summary.as_ref().unwrap();
        assert_eq!(summary.text, "Read Holding Registers · addr 0 · qty 2");
        assert_eq!(events[1].direction, Direction::Info);
        assert_eq!(events[1].message.as_deref(), Some("listening"));
    }

    #[test]
    fn undecodable_frame_reports_the_error_as_text() {
        let (sink, events) = recorder();
        frame(
            &sink,
            Origin::Master,
            Direction::Rx,
            "p",
            ModbusProto::Ascii,
            b":0G\r\n",
            FrameKind::Response,
        );
        let text = events.lock().unwrap()[0].summary.clone().unwrap().text;
        assert!(text.starts_with("malformed frame"), "{text}");
    }
}
