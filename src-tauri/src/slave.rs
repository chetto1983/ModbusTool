//! Slave data model: one rmodbus storage per unit id, and request processing.

use crate::frame_io::unit_offset;
use rmodbus::server::storage::ModbusStorage;
use rmodbus::server::ModbusFrame;
use rmodbus::ModbusProto;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::RwLock;

pub const TABLE_SIZE: usize = 0x1_0000;
pub type Storage = ModbusStorage<TABLE_SIZE, TABLE_SIZE, TABLE_SIZE, TABLE_SIZE>;

/// Unit 0 is the broadcast address (Modbus over Serial Line v1.02 §2.2).
pub const BROADCAST_UNIT: u8 = 0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Table {
    Coils,
    DiscreteInputs,
    HoldingRegisters,
    InputRegisters,
}

/// Unit id of a frame in rmodbus binary form.
pub fn unit_of(proto: ModbusProto, binary: &[u8]) -> Option<u8> {
    binary.get(unit_offset(proto)).copied()
}

#[derive(Default)]
pub struct UnitStore {
    units: RwLock<BTreeMap<u8, Box<Storage>>>,
}

fn range(address: u16, count: usize) -> Result<std::ops::Range<usize>, String> {
    let start = usize::from(address);
    let end = start + count;
    if end > TABLE_SIZE {
        return Err(format!("range {start}..{end} exceeds 65536"));
    }
    Ok(start..end)
}

impl UnitStore {
    /// Keeps the data of units that stay, creates new units zeroed, drops the others.
    pub fn set_units(&self, ids: &[u8]) {
        let mut units = self.units.write().unwrap();
        units.retain(|id, _| ids.contains(id));
        for &id in ids {
            if id != BROADCAST_UNIT {
                units.entry(id).or_default();
            }
        }
    }

    pub fn unit_ids(&self) -> Vec<u8> {
        self.units.read().unwrap().keys().copied().collect()
    }

    /// Values of bit tables are returned as 0/1.
    pub fn read(
        &self,
        unit: u8,
        table: Table,
        address: u16,
        count: usize,
    ) -> Result<Vec<u16>, String> {
        let units = self.units.read().unwrap();
        let storage = units
            .get(&unit)
            .ok_or_else(|| format!("unit {unit} is not configured"))?;
        let r = range(address, count)?;
        Ok(match table {
            Table::Coils => storage.coils[r].iter().map(|&b| u16::from(b)).collect(),
            Table::DiscreteInputs => storage.discretes[r].iter().map(|&b| u16::from(b)).collect(),
            Table::HoldingRegisters => storage.holdings[r].to_vec(),
            Table::InputRegisters => storage.inputs[r].to_vec(),
        })
    }

    /// For bit tables any non-zero value is ON.
    pub fn write(
        &self,
        unit: u8,
        table: Table,
        address: u16,
        values: &[u16],
    ) -> Result<(), String> {
        let mut units = self.units.write().unwrap();
        let storage = units
            .get_mut(&unit)
            .ok_or_else(|| format!("unit {unit} is not configured"))?;
        let r = range(address, values.len())?;
        let bits = values.iter().map(|&v| v != 0);
        match table {
            Table::Coils => storage.coils[r]
                .iter_mut()
                .zip(bits)
                .for_each(|(d, s)| *d = s),
            Table::DiscreteInputs => storage.discretes[r]
                .iter_mut()
                .zip(bits)
                .for_each(|(d, s)| *d = s),
            Table::HoldingRegisters => storage.holdings[r].copy_from_slice(values),
            Table::InputRegisters => storage.inputs[r].copy_from_slice(values),
        }
        Ok(())
    }

    /// Processes one request frame (rmodbus binary form). Returns the response frame, or
    /// `None` when no response is due: unit not served, broadcast, broken frame or bad CRC.
    pub fn handle(&self, proto: ModbusProto, request: &[u8]) -> Option<Vec<u8>> {
        let unit = unit_of(proto, request)?;
        if unit == BROADCAST_UNIT {
            self.handle_broadcast(proto, request);
            return None;
        }
        let mut units = self.units.write().unwrap();
        let storage = units.get_mut(&unit)?;
        let mut response = Vec::new();
        let mut frame = ModbusFrame::new(unit, request, proto, &mut response);
        frame.parse().ok()?;
        if frame.processing_required {
            let processed = if frame.readonly {
                frame.process_read(&**storage)
            } else {
                frame.process_write(&mut **storage)
            };
            processed.ok()?;
        }
        if !frame.response_required {
            return None;
        }
        frame.finalize_response().ok()?;
        Some(response)
    }

    fn handle_broadcast(&self, proto: ModbusProto, request: &[u8]) {
        let mut units = self.units.write().unwrap();
        for storage in units.values_mut() {
            let mut response = Vec::new();
            let mut frame = ModbusFrame::new(BROADCAST_UNIT, request, proto, &mut response);
            if frame.parse().is_ok() && frame.processing_required && !frame.readonly {
                let _ = frame.process_write(&mut **storage);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmodbus::client::ModbusRequest;

    fn store(units: &[u8]) -> UnitStore {
        let store = UnitStore::default();
        store.set_units(units);
        store
    }

    #[test]
    fn units_are_isolated_and_kept_across_reconfiguration() {
        let s = store(&[1, 2]);
        s.write(1, Table::HoldingRegisters, 10, &[7, 8]).unwrap();
        assert_eq!(s.read(2, Table::HoldingRegisters, 10, 2).unwrap(), [0, 0]);
        s.set_units(&[1, 3, BROADCAST_UNIT]);
        assert_eq!(s.unit_ids(), [1, 3]);
        assert_eq!(s.read(1, Table::HoldingRegisters, 10, 2).unwrap(), [7, 8]);
        assert!(s.read(2, Table::HoldingRegisters, 0, 1).is_err());
    }

    #[test]
    fn table_bounds_and_bits() {
        let s = store(&[1]);
        s.write(1, Table::Coils, 65534, &[5, 0]).unwrap();
        assert_eq!(s.read(1, Table::Coils, 65534, 2).unwrap(), [1, 0]);
        assert!(s.write(1, Table::InputRegisters, 65535, &[1, 2]).is_err());
        s.write(1, Table::DiscreteInputs, 0, &[1]).unwrap();
        s.write(1, Table::InputRegisters, 0, &[9]).unwrap();
        assert_eq!(s.read(1, Table::DiscreteInputs, 0, 1).unwrap(), [1]);
        assert_eq!(s.read(1, Table::InputRegisters, 0, 1).unwrap(), [9]);
    }

    #[test]
    fn read_request_is_answered_from_the_unit_storage() {
        let s = store(&[5]);
        s.write(5, Table::HoldingRegisters, 4100, &[0x04c8, 0x07e2])
            .unwrap();
        let mut req = ModbusRequest::new(5, ModbusProto::Rtu);
        let mut frame = Vec::new();
        req.generate_get_holdings(4100, 2, &mut frame).unwrap();
        let response = s.handle(ModbusProto::Rtu, &frame).unwrap();
        let mut values = Vec::new();
        req.parse_u16(&response, &mut values).unwrap();
        assert_eq!(values, [0x04c8, 0x07e2]);
    }

    #[test]
    fn unknown_unit_gets_no_response() {
        let s = store(&[1]);
        let mut frame = Vec::new();
        ModbusRequest::new(9, ModbusProto::TcpUdp)
            .generate_get_coils(0, 1, &mut frame)
            .unwrap();
        assert_eq!(s.handle(ModbusProto::TcpUdp, &frame), None);
    }

    #[test]
    fn broadcast_write_reaches_every_unit_without_response() {
        let s = store(&[1, 2]);
        let mut frame = Vec::new();
        ModbusRequest::new(BROADCAST_UNIT, ModbusProto::Rtu)
            .generate_set_holdings_bulk(3, &[11, 12], &mut frame)
            .unwrap();
        assert_eq!(s.handle(ModbusProto::Rtu, &frame), None);
        assert_eq!(s.read(1, Table::HoldingRegisters, 3, 2).unwrap(), [11, 12]);
        assert_eq!(s.read(2, Table::HoldingRegisters, 3, 2).unwrap(), [11, 12]);
    }

    #[test]
    fn unsupported_function_gets_illegal_function_exception() {
        let s = store(&[1]);
        // FC22 mask write register, MBAP length 8
        let request = [0, 7, 0, 0, 0, 8, 1, 0x16, 0, 4, 0, 0xF2, 0, 0x25];
        let response = s.handle(ModbusProto::TcpUdp, &request).unwrap();
        assert_eq!(response, [0, 7, 0, 0, 0, 3, 1, 0x96, 0x01]);
    }

    /// Measured rmodbus 0.13 behaviour: TCP frames with MBAP length < 6 are rejected as broken,
    /// so a Read Device Identification request (length 5) gets no response at all.
    #[test]
    fn short_tcp_request_gets_no_response() {
        let s = store(&[1]);
        let request = [0, 7, 0, 0, 0, 5, 1, 0x2B, 0x0E, 0x01, 0x00];
        assert_eq!(s.handle(ModbusProto::TcpUdp, &request), None);
    }

    #[test]
    fn corrupted_crc_is_ignored() {
        let s = store(&[1]);
        assert_eq!(s.handle(ModbusProto::Rtu, &[1, 3, 0, 0, 0, 1, 0, 0]), None);
    }
}
