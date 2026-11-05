//! Human readable frame summaries for the traffic monitor.

use crate::frame_io::{unit_offset, FrameKind};
use rmodbus::server::ModbusFrame;
use rmodbus::{consts::ModbusErrorCode, ModbusProto};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameSummary {
    pub unit: Option<u8>,
    pub function: Option<u8>,
    pub exception: Option<u8>,
    pub text: String,
}

pub fn function_name(code: u8) -> &'static str {
    match code & 0x7F {
        0x01 => "Read Coils",
        0x02 => "Read Discrete Inputs",
        0x03 => "Read Holding Registers",
        0x04 => "Read Input Registers",
        0x05 => "Write Single Coil",
        0x06 => "Write Single Register",
        0x0F => "Write Multiple Coils",
        0x10 => "Write Multiple Registers",
        0x16 => "Mask Write Register",
        0x17 => "Read/Write Multiple Registers",
        0x2B => "Encapsulated Interface Transport",
        _ => "Unknown function",
    }
}

/// Modbus Application Protocol v1.1b3 §7. Not taken from rmodbus, whose gateway codes are
/// shifted (see docs/superpowers/specs/2026-11-05-tauri-rewrite-design.md, D6).
pub fn exception_name(code: u8) -> &'static str {
    match code {
        0x01 => "Illegal function",
        0x02 => "Illegal data address",
        0x03 => "Illegal data value",
        0x04 => "Server device failure",
        0x05 => "Acknowledge",
        0x06 => "Server device busy",
        0x08 => "Memory parity error",
        0x0A => "Gateway path unavailable",
        0x0B => "Gateway target device failed to respond",
        _ => "Unknown exception",
    }
}

/// `binary` is the frame in rmodbus binary form (ASCII already decoded, MBAP header included).
pub fn describe(proto: ModbusProto, binary: &[u8], kind: FrameKind) -> FrameSummary {
    let start = unit_offset(proto);
    let (Some(&unit), Some(&function)) = (binary.get(start), binary.get(start + 1)) else {
        return FrameSummary {
            unit: None,
            function: None,
            exception: None,
            text: "Truncated frame".into(),
        };
    };
    let name = function_name(function);
    let mut summary = FrameSummary {
        unit: Some(unit),
        function: Some(function & 0x7F),
        exception: None,
        text: String::new(),
    };
    if function & 0x80 != 0 {
        let code = binary.get(start + 2).copied().unwrap_or(0);
        summary.exception = Some(code);
        summary.text = format!("{name} · exception {code:#04x} {}", exception_name(code));
        return summary;
    }
    summary.text = match kind {
        FrameKind::Request => describe_request(proto, binary, unit, name),
        FrameKind::Response => describe_response(binary, start, function, name),
    };
    summary
}

fn describe_request(proto: ModbusProto, binary: &[u8], unit: u8, name: &str) -> String {
    let mut response = Vec::new();
    let mut frame = ModbusFrame::new(unit, binary, proto, &mut response);
    match frame.parse() {
        Ok(()) if frame.error == Some(ModbusErrorCode::IllegalFunction) => name.to_string(),
        Ok(()) if frame.processing_required || frame.error.is_some() => {
            format!("{name} · addr {} · qty {}", frame.reg, frame.count)
        }
        Ok(()) => name.to_string(),
        Err(e) => format!("{name} · malformed ({e:?})"),
    }
}

fn describe_response(binary: &[u8], start: usize, function: u8, name: &str) -> String {
    let field = |at: usize| {
        binary
            .get(start + at..start + at + 2)
            .map(|b| u16::from_be_bytes([b[0], b[1]]))
    };
    match function {
        0x01..=0x04 => {
            let bytes = binary.get(start + 2).copied().unwrap_or(0);
            format!("{name} · {bytes} data bytes")
        }
        0x05 | 0x06 | 0x0F | 0x10 => match (field(2), field(4)) {
            (Some(addr), Some(value)) => format!("{name} · addr {addr} · ack {value}"),
            _ => format!("{name} · truncated"),
        },
        _ => name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tcp_request() {
        let frame = [0, 1, 0, 0, 0, 6, 0x11, 0x03, 0x00, 0x6B, 0x00, 0x03];
        let s = describe(ModbusProto::TcpUdp, &frame, FrameKind::Request);
        assert_eq!(s.unit, Some(0x11));
        assert_eq!(s.function, Some(3));
        assert_eq!(s.text, "Read Holding Registers · addr 107 · qty 3");
    }

    #[test]
    fn rtu_exception_response() {
        let s = describe(
            ModbusProto::Rtu,
            &[0x01, 0x83, 0x02, 0xC0, 0xF1],
            FrameKind::Response,
        );
        assert_eq!(s.exception, Some(2));
        assert_eq!(
            s.text,
            "Read Holding Registers · exception 0x02 Illegal data address"
        );
    }

    #[test]
    fn gateway_exceptions_use_spec_codes() {
        assert_eq!(exception_name(0x0A), "Gateway path unavailable");
        assert_eq!(
            exception_name(0x0B),
            "Gateway target device failed to respond"
        );
    }

    #[test]
    fn responses() {
        let read = [0x01, 0x03, 0x04, 0, 1, 0, 2, 0x2A, 0x32];
        assert_eq!(
            describe(ModbusProto::Rtu, &read, FrameKind::Response).text,
            "Read Holding Registers · 4 data bytes"
        );
        let ack = [0x01, 0x06, 0x00, 0x05, 0x12, 0x34, 0, 0];
        assert_eq!(
            describe(ModbusProto::Rtu, &ack, FrameKind::Response).text,
            "Write Single Register · addr 5 · ack 4660"
        );
    }

    #[test]
    fn malformed_and_truncated() {
        let bad_crc = [0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00];
        assert!(describe(ModbusProto::Rtu, &bad_crc, FrameKind::Request)
            .text
            .contains("malformed"));
        assert_eq!(
            describe(ModbusProto::Rtu, &[0x01], FrameKind::Request).text,
            "Truncated frame"
        );
        assert_eq!(
            describe(ModbusProto::Rtu, &[0x01, 0x2B, 0x0E], FrameKind::Request).text,
            "Encapsulated Interface Transport"
        );
    }
}
