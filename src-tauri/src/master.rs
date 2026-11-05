//! Master connection: one request/response transaction at a time, with retries and timeout.

use crate::describe::exception_name;
use crate::frame_io::{
    binary_to_wire, unit_offset, wire_to_binary, ByteStream, FrameError, FrameKind, FrameReader,
};
use crate::link::{invalid, LinkConfig};
use crate::slave::BROADCAST_UNIT;
use crate::traffic::{self, Direction, Origin, TrafficSink};
use rmodbus::client::ModbusRequest;
use rmodbus::ModbusProto;
use serde::{Deserialize, Serialize};
use serialport::{ClearBuffer, SerialPort};
use std::fmt;
use std::io::{self, Write};
use std::net::{TcpStream, ToSocketAddrs, UdpSocket};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasterConfig {
    pub link: LinkConfig,
    pub timeout_ms: u64,
    pub retries: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Operation {
    ReadCoils { address: u16, quantity: u16 },
    ReadDiscreteInputs { address: u16, quantity: u16 },
    ReadHoldingRegisters { address: u16, quantity: u16 },
    ReadInputRegisters { address: u16, quantity: u16 },
    WriteSingleCoil { address: u16, value: bool },
    WriteSingleRegister { address: u16, value: u16 },
    WriteMultipleCoils { address: u16, values: Vec<bool> },
    WriteMultipleRegisters { address: u16, values: Vec<u16> },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    /// Read values; bits are 0/1. Empty for writes.
    pub values: Vec<u16>,
    pub elapsed_ms: f64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MasterError {
    Exception(u8),
    Timeout,
    NotConnected,
    Invalid(String),
    Io(String),
}

impl fmt::Display for MasterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MasterError::Exception(code) => {
                write!(f, "Exception {code:#04x}: {}", exception_name(*code))
            }
            MasterError::Timeout => write!(f, "Timeout: no response"),
            MasterError::NotConnected => write!(f, "Not connected"),
            MasterError::Invalid(e) => write!(f, "{e}"),
            MasterError::Io(e) => write!(f, "I/O error: {e}"),
        }
    }
}

impl From<FrameError> for MasterError {
    fn from(e: FrameError) -> Self {
        match e {
            FrameError::Timeout => MasterError::Timeout,
            FrameError::Io(e) => MasterError::Io(e.to_string()),
            other => MasterError::Invalid(other.to_string()),
        }
    }
}

impl From<io::Error> for MasterError {
    fn from(e: io::Error) -> Self {
        FrameError::from(e).into()
    }
}

/// Protocol limits (Modbus Application Protocol v1.1b3 §6), plus the measured rmodbus cap of
/// 255-byte frames that limits TCP/UDP reads to 123 registers.
fn check_limits(proto: ModbusProto, operation: &Operation) -> Result<(), MasterError> {
    let register_read_max = if proto == ModbusProto::TcpUdp {
        123
    } else {
        125
    };
    let (address, count, max) = match operation {
        Operation::ReadCoils { address, quantity }
        | Operation::ReadDiscreteInputs { address, quantity } => {
            (*address, usize::from(*quantity), 2000)
        }
        Operation::ReadHoldingRegisters { address, quantity }
        | Operation::ReadInputRegisters { address, quantity } => {
            (*address, usize::from(*quantity), register_read_max)
        }
        Operation::WriteSingleCoil { address, .. }
        | Operation::WriteSingleRegister { address, .. } => (*address, 1, 1),
        Operation::WriteMultipleCoils { address, values } => (*address, values.len(), 1968),
        Operation::WriteMultipleRegisters { address, values } => (*address, values.len(), 123),
    };
    if count == 0 || count > max {
        return Err(MasterError::Invalid(format!(
            "quantity must be 1..={max}, got {count}"
        )));
    }
    if usize::from(address) + count > 0x1_0000 {
        return Err(MasterError::Invalid("address range exceeds 65535".into()));
    }
    Ok(())
}

impl Operation {
    fn is_write(&self) -> bool {
        !matches!(
            self,
            Operation::ReadCoils { .. }
                | Operation::ReadDiscreteInputs { .. }
                | Operation::ReadHoldingRegisters { .. }
                | Operation::ReadInputRegisters { .. }
        )
    }

    fn generate(
        &self,
        req: &mut ModbusRequest,
        frame: &mut Vec<u8>,
    ) -> Result<(), rmodbus::ErrorKind> {
        match self {
            Operation::ReadCoils { address, quantity } => {
                req.generate_get_coils(*address, *quantity, frame)
            }
            Operation::ReadDiscreteInputs { address, quantity } => {
                req.generate_get_discretes(*address, *quantity, frame)
            }
            Operation::ReadHoldingRegisters { address, quantity } => {
                req.generate_get_holdings(*address, *quantity, frame)
            }
            Operation::ReadInputRegisters { address, quantity } => {
                req.generate_get_inputs(*address, *quantity, frame)
            }
            Operation::WriteSingleCoil { address, value } => {
                req.generate_set_coil(*address, *value, frame)
            }
            Operation::WriteSingleRegister { address, value } => {
                req.generate_set_holding(*address, *value, frame)
            }
            Operation::WriteMultipleCoils { address, values } => {
                req.generate_set_coils_bulk(*address, values, frame)
            }
            Operation::WriteMultipleRegisters { address, values } => {
                req.generate_set_holdings_bulk(*address, values, frame)
            }
        }
    }

    fn parse(&self, req: &ModbusRequest, response: &[u8]) -> Result<Vec<u16>, rmodbus::ErrorKind> {
        let mut values = Vec::new();
        match self {
            Operation::ReadCoils { .. } | Operation::ReadDiscreteInputs { .. } => {
                let mut bits = Vec::new();
                req.parse_bool(response, &mut bits)?;
                values.extend(bits.into_iter().map(u16::from));
            }
            Operation::ReadHoldingRegisters { .. } | Operation::ReadInputRegisters { .. } => {
                req.parse_u16(response, &mut values)?;
            }
            _ => req.parse_ok(response)?,
        }
        Ok(values)
    }
}

trait StreamLink: ByteStream + Write + Send {
    fn discard_input(&mut self) {}
}

impl StreamLink for TcpStream {}

impl StreamLink for Box<dyn SerialPort> {
    fn discard_input(&mut self) {
        let _ = self.clear(ClearBuffer::Input);
    }
}

enum Transport {
    Stream(Box<dyn StreamLink>, FrameReader),
    Datagram(UdpSocket),
}

pub struct Master {
    config: MasterConfig,
    proto: ModbusProto,
    transport: Transport,
    next_transaction: u16,
}

fn resolve(host: &str, port: u16) -> io::Result<std::net::SocketAddr> {
    (host, port)
        .to_socket_addrs()?
        .next()
        .ok_or_else(|| invalid(format!("cannot resolve {host}")))
}

impl Master {
    pub fn connect(config: MasterConfig) -> io::Result<Self> {
        let timeout = Duration::from_millis(config.timeout_ms.max(1));
        let proto = config.link.proto();
        let stream_reader = || FrameReader::new(proto, FrameKind::Response);
        let transport = match &config.link {
            LinkConfig::Tcp { host, port } | LinkConfig::RtuOverTcp { host, port } => {
                let stream = TcpStream::connect_timeout(&resolve(host, *port)?, timeout)?;
                stream.set_nodelay(true)?;
                Transport::Stream(Box::new(stream), stream_reader())
            }
            LinkConfig::Udp { host, port } => {
                let socket = UdpSocket::bind(("0.0.0.0", 0))?;
                socket.connect(resolve(host, *port)?)?;
                Transport::Datagram(socket)
            }
            LinkConfig::Rtu { serial } | LinkConfig::Ascii { serial } => {
                Transport::Stream(Box::new(serial.open(timeout)?), stream_reader())
            }
        };
        Ok(Self {
            config,
            proto,
            transport,
            next_transaction: 1,
        })
    }

    pub fn endpoint(&self) -> String {
        self.config.link.describe()
    }

    pub fn execute(
        &mut self,
        unit: u8,
        operation: &Operation,
        sink: &TrafficSink,
    ) -> Result<Outcome, MasterError> {
        check_limits(self.proto, operation)?;
        if unit == BROADCAST_UNIT && !operation.is_write() {
            return Err(MasterError::Invalid(
                "unit 0 is broadcast: only writes are allowed".into(),
            ));
        }
        let started = Instant::now();
        let mut attempt = 0;
        loop {
            match self.transact(unit, operation, sink) {
                Err(MasterError::Timeout) if attempt < self.config.retries => {
                    attempt += 1;
                    traffic::info(
                        sink,
                        Origin::Master,
                        &self.endpoint(),
                        format!("Timeout, retry {attempt}"),
                    );
                }
                result => {
                    return result.map(|values| Outcome {
                        values,
                        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                    })
                }
            }
        }
    }

    fn transact(
        &mut self,
        unit: u8,
        operation: &Operation,
        sink: &TrafficSink,
    ) -> Result<Vec<u16>, MasterError> {
        let mut req = ModbusRequest::new(unit, self.proto);
        req.tr_id = self.next_transaction;
        self.next_transaction = self.next_transaction.wrapping_add(1);
        let mut request = Vec::new();
        operation
            .generate(&mut req, &mut request)
            .map_err(|e| MasterError::Invalid(format!("{e:?}")))?;
        let wire = binary_to_wire(self.proto, &request)?;
        let peer = self.endpoint();
        self.send(&wire)?;
        traffic::frame(
            sink,
            Origin::Master,
            Direction::Tx,
            &peer,
            self.proto,
            &wire,
            FrameKind::Request,
        );
        if unit == BROADCAST_UNIT {
            return Ok(Vec::new());
        }
        let deadline = Instant::now() + Duration::from_millis(self.config.timeout_ms);
        loop {
            let wire = self.receive(deadline)?;
            traffic::frame(
                sink,
                Origin::Master,
                Direction::Rx,
                &peer,
                self.proto,
                &wire,
                FrameKind::Response,
            );
            let response = wire_to_binary(self.proto, &wire)?;
            if self.proto == ModbusProto::TcpUdp
                && response.get(..2) != Some(&req.tr_id.to_be_bytes()[..])
            {
                traffic::info(
                    sink,
                    Origin::Master,
                    &peer,
                    "Discarded response with a stale transaction id",
                );
                continue;
            }
            let function = response
                .get(unit_offset(self.proto) + 1)
                .copied()
                .unwrap_or(0);
            if function & 0x80 != 0 {
                let code = response
                    .get(unit_offset(self.proto) + 2)
                    .copied()
                    .unwrap_or(0);
                return Err(MasterError::Exception(code));
            }
            return operation
                .parse(&req, &response)
                .map_err(|e| MasterError::Invalid(format!("Invalid response: {e:?}")));
        }
    }

    fn send(&mut self, wire: &[u8]) -> Result<(), MasterError> {
        match &mut self.transport {
            Transport::Stream(stream, reader) => {
                // Without transaction ids (RTU, ASCII) a late answer to a timed-out request
                // would be taken as this one's response; TCP uses the transaction id instead.
                if self.proto != ModbusProto::TcpUdp {
                    reader.clear();
                    stream.discard_input();
                }
                stream.write_all(wire)?;
            }
            Transport::Datagram(socket) => {
                socket.send(wire)?;
            }
        }
        Ok(())
    }

    fn receive(&mut self, deadline: Instant) -> Result<Vec<u8>, MasterError> {
        match &mut self.transport {
            Transport::Stream(stream, reader) => Ok(reader.next_frame(stream.as_mut(), deadline)?),
            Transport::Datagram(socket) => {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    return Err(MasterError::Timeout);
                }
                socket.set_read_timeout(Some(remaining))?;
                let mut buf = [0u8; 512];
                let len = socket.recv(&mut buf)?;
                Ok(buf[..len].to_vec())
            }
        }
    }
}

#[cfg(test)]
#[path = "master_tests.rs"]
mod tests;
