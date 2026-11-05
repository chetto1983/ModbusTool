use rmodbus::ModbusProto;
use serde::{Deserialize, Serialize};
use serialport::SerialPort;
use std::io;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LinkConfig {
    Tcp { host: String, port: u16 },
    Udp { host: String, port: u16 },
    RtuOverTcp { host: String, port: u16 },
    Rtu { serial: SerialConfig },
    Ascii { serial: SerialConfig },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Parity {
    None,
    Even,
    Odd,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialConfig {
    pub port: String,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub parity: Parity,
    pub stop_bits: u8,
}

impl LinkConfig {
    pub fn proto(&self) -> ModbusProto {
        match self {
            LinkConfig::Tcp { .. } | LinkConfig::Udp { .. } => ModbusProto::TcpUdp,
            LinkConfig::RtuOverTcp { .. } | LinkConfig::Rtu { .. } => ModbusProto::Rtu,
            LinkConfig::Ascii { .. } => ModbusProto::Ascii,
        }
    }

    pub fn describe(&self) -> String {
        match self {
            LinkConfig::Tcp { host, port } => format!("TCP {host}:{port}"),
            LinkConfig::Udp { host, port } => format!("UDP {host}:{port}"),
            LinkConfig::RtuOverTcp { host, port } => format!("RTU over TCP {host}:{port}"),
            LinkConfig::Rtu { serial } => format!("RTU {}", serial.describe()),
            LinkConfig::Ascii { serial } => format!("ASCII {}", serial.describe()),
        }
    }
}

impl SerialConfig {
    pub fn describe(&self) -> String {
        let parity = match self.parity {
            Parity::None => 'N',
            Parity::Even => 'E',
            Parity::Odd => 'O',
        };
        format!(
            "{} {} {}{}{}",
            self.port, self.baud_rate, self.data_bits, parity, self.stop_bits
        )
    }

    pub fn open(&self, timeout: Duration) -> io::Result<Box<dyn SerialPort>> {
        let data_bits = match self.data_bits {
            7 => serialport::DataBits::Seven,
            8 => serialport::DataBits::Eight,
            other => return Err(invalid(format!("unsupported data bits: {other}"))),
        };
        let stop_bits = match self.stop_bits {
            1 => serialport::StopBits::One,
            2 => serialport::StopBits::Two,
            other => return Err(invalid(format!("unsupported stop bits: {other}"))),
        };
        let parity = match self.parity {
            Parity::None => serialport::Parity::None,
            Parity::Even => serialport::Parity::Even,
            Parity::Odd => serialport::Parity::Odd,
        };
        serialport::new(&self.port, self.baud_rate)
            .data_bits(data_bits)
            .stop_bits(stop_bits)
            .parity(parity)
            .flow_control(serialport::FlowControl::None)
            .timeout(timeout)
            .open()
            .map_err(io::Error::from)
    }
}

pub fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}

pub fn list_serial_ports() -> Vec<String> {
    serialport::available_ports()
        .map(|ports| ports.into_iter().map(|p| p.port_name).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn serial(baud_rate: u32, parity: Parity) -> SerialConfig {
        SerialConfig {
            port: "COM1".into(),
            baud_rate,
            data_bits: 8,
            parity,
            stop_bits: 1,
        }
    }

    #[test]
    fn proto_per_link() {
        let tcp = LinkConfig::Tcp {
            host: "127.0.0.1".into(),
            port: 502,
        };
        assert_eq!(tcp.proto(), ModbusProto::TcpUdp);
        let rtu = LinkConfig::RtuOverTcp {
            host: "h".into(),
            port: 1,
        };
        assert_eq!(rtu.proto(), ModbusProto::Rtu);
        assert_eq!(
            LinkConfig::Ascii {
                serial: serial(9600, Parity::None)
            }
            .proto(),
            ModbusProto::Ascii
        );
    }

    #[test]
    fn serde_shape_matches_frontend() {
        let json = r#"{"kind":"rtu","serial":{"port":"/dev/ttyUSB0","baudRate":19200,"dataBits":8,"parity":"even","stopBits":1}}"#;
        let link: LinkConfig = serde_json::from_str(json).unwrap();
        assert_eq!(link.describe(), "RTU /dev/ttyUSB0 19200 8E1");
        let rot: LinkConfig =
            serde_json::from_str(r#"{"kind":"rtuOverTcp","host":"10.0.0.2","port":4001}"#).unwrap();
        assert_eq!(rot.describe(), "RTU over TCP 10.0.0.2:4001");
    }

    #[test]
    fn rejects_unsupported_serial_settings() {
        let mut cfg = serial(9600, Parity::None);
        cfg.data_bits = 6;
        assert_eq!(
            cfg.open(Duration::from_millis(10)).unwrap_err().kind(),
            io::ErrorKind::InvalidInput
        );
    }
}
