"""Independent reference: pymodbus client used to check the app (both as master and slave).

Prints one JSON object. Commands:
  read  <transport> <target> <table> <address> <count>
  write <transport> <target> <table> <address> <v1,v2,...>
transport: tcp | udp | rtuovertcp | rtu | ascii ; target: host:port or serial device.
"""

import json
import sys

from pymodbus import FramerType
from pymodbus.client import ModbusSerialClient, ModbusTcpClient, ModbusUdpClient


def client(transport: str, target: str):
    if transport in ("rtu", "ascii"):
        framer = FramerType.ASCII if transport == "ascii" else FramerType.RTU
        # Linux pseudo-terminals only accept 8N1, so ASCII is exercised as 8N1 too.
        return ModbusSerialClient(target, framer=framer, baudrate=19200, timeout=2, retries=0)
    host, port = target.rsplit(":", 1)
    if transport == "udp":
        return ModbusUdpClient(host, port=int(port), timeout=2, retries=0)
    framer = FramerType.RTU if transport == "rtuovertcp" else FramerType.SOCKET
    return ModbusTcpClient(host, port=int(port), framer=framer, timeout=2, retries=0)


def main() -> None:
    command, transport, target, table, address = sys.argv[1:6]
    c = client(transport, target)
    if not c.connect():
        print(json.dumps({"error": "connect failed"}))
        return
    address = int(address)
    try:
        if command == "read":
            count = int(sys.argv[6])
            call = {
                "holding": c.read_holding_registers,
                "input": c.read_input_registers,
                "coils": c.read_coils,
                "discrete": c.read_discrete_inputs,
            }[table]
            r = call(address, count=count, device_id=1)
            if r.isError():
                print(json.dumps({"error": str(r)}))
                return
            values = r.registers if table in ("holding", "input") else [int(b) for b in r.bits[:count]]
            print(json.dumps({"values": values}))
        else:
            values = [int(v) for v in sys.argv[6].split(",")]
            if table == "holding":
                r = c.write_registers(address, values, device_id=1)
            else:
                r = c.write_coils(address, [bool(v) for v in values], device_id=1)
            print(json.dumps({"error": str(r)} if r.isError() else {"ok": True}))
    finally:
        c.close()


main()
