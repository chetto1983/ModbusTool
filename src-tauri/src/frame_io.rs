//! Reads complete Modbus frames from byte streams (TCP sockets, serial ports).
//! Frame lengths come from rmodbus `guess_*_frame_len`; ASCII frames end with CRLF.

use rmodbus::{
    generate_ascii_frame, guess_request_frame_len, guess_response_frame_len, parse_ascii_frame,
    ErrorKind, ModbusFrameBuf, ModbusProto,
};
use serialport::SerialPort;
use std::fmt;
use std::io::{self, Read};
use std::net::TcpStream;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameKind {
    Request,
    Response,
}

#[derive(Debug)]
pub enum FrameError {
    Timeout,
    Closed,
    Broken(String),
    Io(io::Error),
}

impl fmt::Display for FrameError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FrameError::Timeout => write!(f, "timeout"),
            FrameError::Closed => write!(f, "connection closed by peer"),
            FrameError::Broken(e) => write!(f, "malformed frame: {e}"),
            FrameError::Io(e) => write!(f, "I/O error: {e}"),
        }
    }
}

impl From<io::Error> for FrameError {
    fn from(e: io::Error) -> Self {
        if is_timeout(&e) {
            FrameError::Timeout
        } else {
            FrameError::Io(e)
        }
    }
}

pub fn is_timeout(e: &io::Error) -> bool {
    matches!(
        e.kind(),
        io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock
    )
}

pub fn broken(e: ErrorKind) -> FrameError {
    FrameError::Broken(format!("{e:?}"))
}

pub trait ByteStream {
    fn read_chunk(&mut self, buf: &mut [u8], timeout: Duration) -> io::Result<usize>;
}

// A zero timeout means "block forever" for both sockets and serial ports.
fn at_least_1ms(timeout: Duration) -> Duration {
    timeout.max(Duration::from_millis(1))
}

impl ByteStream for TcpStream {
    fn read_chunk(&mut self, buf: &mut [u8], timeout: Duration) -> io::Result<usize> {
        self.set_read_timeout(Some(at_least_1ms(timeout)))?;
        self.read(buf)
    }
}

impl ByteStream for Box<dyn SerialPort> {
    fn read_chunk(&mut self, buf: &mut [u8], timeout: Duration) -> io::Result<usize> {
        self.set_timeout(at_least_1ms(timeout))?;
        match self.read(buf) {
            // A serial port never reaches end of stream: zero bytes is an expired timeout.
            Ok(0) => Err(io::ErrorKind::TimedOut.into()),
            other => other,
        }
    }
}

/// Accumulates bytes from a stream and splits them into frames. Bytes after a complete frame
/// are kept for the next call, so back-to-back frames in one read are not lost.
pub struct FrameReader {
    proto: ModbusProto,
    kind: FrameKind,
    buf: Vec<u8>,
}

impl FrameReader {
    pub fn new(proto: ModbusProto, kind: FrameKind) -> Self {
        Self {
            proto,
            kind,
            buf: Vec::new(),
        }
    }

    pub fn clear(&mut self) {
        self.buf.clear();
    }

    /// Returns the next frame as it appeared on the wire (ASCII frames stay in text form).
    pub fn next_frame<S: ByteStream + ?Sized>(
        &mut self,
        stream: &mut S,
        deadline: Instant,
    ) -> Result<Vec<u8>, FrameError> {
        loop {
            if let Some(len) = self.complete_len()? {
                return Ok(self.buf.drain(..len).collect());
            }
            let now = Instant::now();
            if now >= deadline {
                return Err(FrameError::Timeout);
            }
            let mut chunk = [0u8; 512];
            match stream.read_chunk(&mut chunk, deadline - now) {
                Ok(0) => return Err(FrameError::Closed),
                Ok(n) => self.buf.extend_from_slice(&chunk[..n]),
                Err(e) if is_timeout(&e) => {}
                Err(e) => return Err(FrameError::Io(e)),
            }
        }
    }

    fn complete_len(&mut self) -> Result<Option<usize>, FrameError> {
        if self.proto == ModbusProto::Ascii {
            return Ok(self.ascii_complete_len());
        }
        let guess = match self.kind {
            FrameKind::Request => guess_request_frame_len(&self.buf, self.proto),
            FrameKind::Response => guess_response_frame_len(&self.buf, self.proto),
        };
        match guess {
            Ok(len) => Ok((self.buf.len() >= usize::from(len)).then_some(usize::from(len))),
            Err(ErrorKind::OOB) => Ok(None),
            Err(e) => {
                self.buf.clear();
                Err(broken(e))
            }
        }
    }

    fn ascii_complete_len(&mut self) -> Option<usize> {
        match self.buf.iter().position(|&b| b == b':') {
            Some(start) => drop(self.buf.drain(..start)),
            None => {
                self.buf.clear();
                return None;
            }
        }
        self.buf.iter().position(|&b| b == b'\n').map(|end| end + 1)
    }
}

/// Converts a frame from its wire form to the binary form rmodbus parses
/// (for ASCII: unit + PDU + LRC; other protocols are already binary).
pub fn wire_to_binary(proto: ModbusProto, wire: &[u8]) -> Result<Vec<u8>, FrameError> {
    if proto != ModbusProto::Ascii {
        return Ok(wire.to_vec());
    }
    let mut buf: ModbusFrameBuf = [0; 256];
    let len = parse_ascii_frame(wire, wire.len(), &mut buf, 0).map_err(broken)?;
    Ok(buf[..usize::from(len)].to_vec())
}

/// Converts a binary frame produced by rmodbus to its wire form.
pub fn binary_to_wire(proto: ModbusProto, binary: &[u8]) -> Result<Vec<u8>, FrameError> {
    if proto != ModbusProto::Ascii {
        return Ok(binary.to_vec());
    }
    let mut wire = Vec::new();
    generate_ascii_frame(binary, &mut wire).map_err(broken)?;
    Ok(wire)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    /// Scripted stream: each entry is one read result; `None` simulates an expired timeout.
    struct Script(VecDeque<Option<Vec<u8>>>);

    impl ByteStream for Script {
        fn read_chunk(&mut self, buf: &mut [u8], _timeout: Duration) -> io::Result<usize> {
            match self.0.pop_front() {
                Some(Some(bytes)) => {
                    buf[..bytes.len()].copy_from_slice(&bytes);
                    Ok(bytes.len())
                }
                Some(None) | None => Err(io::ErrorKind::TimedOut.into()),
            }
        }
    }

    fn script(chunks: &[&[u8]]) -> Script {
        Script(chunks.iter().map(|c| Some(c.to_vec())).collect())
    }

    fn soon() -> Instant {
        Instant::now() + Duration::from_millis(200)
    }

    // Modbus Messaging on TCP/IP v1.0b: read holding registers 0x006B x3, unit 0x11
    const TCP_REQUEST: [u8; 12] = [0, 1, 0, 0, 0, 6, 0x11, 0x03, 0x00, 0x6B, 0x00, 0x03];
    // Modbus over Serial Line v1.02 example: unit 1 read holding 0 x2 with CRC
    const RTU_REQUEST: [u8; 8] = [0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xC4, 0x0B];

    #[test]
    fn tcp_frame_split_across_reads() {
        let mut reader = FrameReader::new(ModbusProto::TcpUdp, FrameKind::Request);
        let mut stream = script(&[&TCP_REQUEST[..4], &TCP_REQUEST[4..9], &TCP_REQUEST[9..]]);
        assert_eq!(reader.next_frame(&mut stream, soon()).unwrap(), TCP_REQUEST);
    }

    #[test]
    fn back_to_back_frames_in_one_read_are_kept() {
        let mut both = TCP_REQUEST.to_vec();
        both.extend_from_slice(&TCP_REQUEST);
        let mut reader = FrameReader::new(ModbusProto::TcpUdp, FrameKind::Request);
        let mut stream = script(&[&both]);
        assert_eq!(reader.next_frame(&mut stream, soon()).unwrap(), TCP_REQUEST);
        assert_eq!(reader.next_frame(&mut stream, soon()).unwrap(), TCP_REQUEST);
    }

    #[test]
    fn rtu_request_and_exception_response_lengths() {
        let mut reader = FrameReader::new(ModbusProto::Rtu, FrameKind::Request);
        let mut stream = script(&[&RTU_REQUEST[..1], &RTU_REQUEST[1..]]);
        assert_eq!(reader.next_frame(&mut stream, soon()).unwrap(), RTU_REQUEST);

        let exception = [0x01, 0x83, 0x02, 0xC0, 0xF1];
        let mut reader = FrameReader::new(ModbusProto::Rtu, FrameKind::Response);
        let mut stream = script(&[&exception[..2], &exception[2..]]);
        assert_eq!(reader.next_frame(&mut stream, soon()).unwrap(), exception);
    }

    #[test]
    fn rtu_write_multiple_waits_for_byte_count() {
        // FC16 unit 1, addr 1, 2 registers, 4 bytes, values 0x000A 0x0102, CRC 0x3092
        let frame = [
            0x01, 0x10, 0x00, 0x01, 0x00, 0x02, 0x04, 0x00, 0x0A, 0x01, 0x02, 0x92, 0x30,
        ];
        let mut reader = FrameReader::new(ModbusProto::Rtu, FrameKind::Request);
        let mut stream = script(&[&frame[..6], &frame[6..9], &frame[9..]]);
        assert_eq!(reader.next_frame(&mut stream, soon()).unwrap(), frame);
    }

    #[test]
    fn ascii_skips_noise_and_ends_at_crlf() {
        let wire = b":010300000002FA\r\n";
        let mut reader = FrameReader::new(ModbusProto::Ascii, FrameKind::Request);
        let mut stream = script(&[b"\x00\xFFjunk", &wire[..5], &wire[5..]]);
        let frame = reader.next_frame(&mut stream, soon()).unwrap();
        assert_eq!(frame, wire);
        let binary = wire_to_binary(ModbusProto::Ascii, &frame).unwrap();
        assert_eq!(binary, [0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xFA]);
        assert_eq!(binary_to_wire(ModbusProto::Ascii, &binary).unwrap(), wire);
    }

    #[test]
    fn timeout_keeps_partial_frame_for_the_next_call() {
        let mut reader = FrameReader::new(ModbusProto::TcpUdp, FrameKind::Request);
        let mut first = Script(VecDeque::from([Some(TCP_REQUEST[..5].to_vec())]));
        let past = Instant::now() + Duration::from_millis(5);
        assert!(matches!(
            reader.next_frame(&mut first, past),
            Err(FrameError::Timeout)
        ));
        let mut rest = script(&[&TCP_REQUEST[5..]]);
        assert_eq!(reader.next_frame(&mut rest, soon()).unwrap(), TCP_REQUEST);
    }

    #[test]
    fn closed_stream_is_reported() {
        let mut reader = FrameReader::new(ModbusProto::TcpUdp, FrameKind::Request);
        let mut stream = script(&[&[]]);
        assert!(matches!(
            reader.next_frame(&mut stream, soon()),
            Err(FrameError::Closed)
        ));
    }

    #[test]
    fn non_modbus_tcp_protocol_id_is_rejected_and_dropped() {
        let mut bad = TCP_REQUEST;
        bad[3] = 1;
        let mut reader = FrameReader::new(ModbusProto::TcpUdp, FrameKind::Request);
        let mut stream = script(&[&bad, &TCP_REQUEST]);
        assert!(matches!(
            reader.next_frame(&mut stream, soon()),
            Err(FrameError::Broken(_))
        ));
        assert_eq!(reader.next_frame(&mut stream, soon()).unwrap(), TCP_REQUEST);
    }

    /// Measured limit of rmodbus 0.13: frames are capped at 255 bytes, so a TCP response with
    /// 124+ registers (MBAP length 251+, 257+ bytes on the wire) is reported as broken.
    #[test]
    fn rmodbus_tcp_frame_length_cap() {
        let header_123 = [0, 1, 0, 0, 0, 3 + 246, 1, 3];
        assert_eq!(
            guess_response_frame_len(&header_123, ModbusProto::TcpUdp),
            Ok(255)
        );
        let header_124 = [0, 1, 0, 0, 0, 3 + 248, 1, 3];
        assert_eq!(
            guess_response_frame_len(&header_124, ModbusProto::TcpUdp),
            Err(ErrorKind::FrameBroken)
        );
    }
}
