"""Independent reference: pymodbus servers the app's master talks to during E2E.

Usage: python3 reference_servers.py <tcp_port> <udp_port> <rtu_over_tcp_port> [serial_device]
Without a serial device (Windows has no socat ptys) only the network servers run.
Unit 1: holding register n = 111 * (n + 1), input register n = 1000 + n, even coils ON.
pymodbus data blocks start at 1 for protocol address 0.
"""

import asyncio
import sys

from pymodbus import FramerType
from pymodbus.datastore import ModbusDeviceContext, ModbusSequentialDataBlock, ModbusServerContext
from pymodbus.server import StartAsyncSerialServer, StartAsyncTcpServer, StartAsyncUdpServer


def context() -> ModbusServerContext:
    device = ModbusDeviceContext(
        hr=ModbusSequentialDataBlock(1, [111 * (i + 1) for i in range(100)]),
        ir=ModbusSequentialDataBlock(1, [1000 + i for i in range(100)]),
        co=ModbusSequentialDataBlock(1, [i % 2 == 0 for i in range(100)]),
        di=ModbusSequentialDataBlock(1, [False] * 100),
    )
    return ModbusServerContext(devices={1: device}, single=False)


async def main() -> None:
    tcp, udp, rtu_over_tcp = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
    shared = context()
    servers = [
        StartAsyncTcpServer(shared, address=("127.0.0.1", tcp)),
        StartAsyncUdpServer(shared, address=("127.0.0.1", udp)),
        StartAsyncTcpServer(shared, address=("127.0.0.1", rtu_over_tcp), framer=FramerType.RTU),
    ]
    if len(sys.argv) > 4:
        servers.append(StartAsyncSerialServer(shared, port=sys.argv[4], framer=FramerType.ASCII, baudrate=19200))
    await asyncio.gather(*servers)


asyncio.run(main())
