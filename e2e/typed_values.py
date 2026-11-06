"""Independent oracle for the data types: the registers each typed value occupies, per byte order.

Prints a JSON list of groups, one per (type, order): the values, their registers in wire order
and what the grid must show. Registers come from pymodbus (convert_to_registers, word order
"big" = ABCD, "little" = CDAB); BADC and DCBA swap the two bytes of every register of those,
which is what the B-before-A orders mean. Nothing here shares code with src/lib/datatypes.ts.
"""

import json
import struct

from pymodbus.client.mixin import ModbusClientMixin

DT = ModbusClientMixin.DATATYPE

VALUES = {
    "uint32": (DT.UINT32, [0, 1, 123456789, 4294967295]),
    "int32": (DT.INT32, [-2147483648, -1, 0, 2147483647]),
    # 33.35503 is the user's report of 2026-11-06 (slave 4205 6B8C).
    "float32": (DT.FLOAT32, [33.35503, -1.5, 0.001, 3.0e38]),
    "uint64": (DT.UINT64, [0, 1, 1234567890123456789, 18446744073709551615]),
    "int64": (DT.INT64, [-9223372036854775808, -1, 0, 9223372036854775807]),
    "float64": (DT.FLOAT64, [3.141592653589793, -2.5e-300, 0.1, 1.7976931348623157e308]),
}
LABELS = {
    "uint16": "UInt16",
    "int16": "Int16",
    "hex": "Hex",
    "binary": "Binary",
    "ascii": "ASCII",
    "uint32": "UInt32",
    "int32": "Int32",
    "float32": "Float32",
    "uint64": "UInt64",
    "int64": "Int64",
    "float64": "Float64",
}
ORDERS = ["ABCD", "CDAB", "BADC", "DCBA"]


def swap_bytes(registers):
    return [((r & 0xFF) << 8) | (r >> 8) for r in registers]


def wire(value, datatype, order):
    word_order = "little" if order in ("CDAB", "DCBA") else "big"
    registers = ModbusClientMixin.convert_to_registers(value, datatype, word_order=word_order)
    return swap_bytes(registers) if order in ("BADC", "DCBA") else registers


def multi_register(type_id, datatype, values, order):
    cases = []
    for value in values:
        registers = wire(value, datatype, order)
        if type_id == "float32":
            # The value a float32 actually holds, and its shortest text: what a user types.
            exact = struct.unpack(">f", struct.pack(">f", value))[0]
            expect = {"kind": "float", "value": exact, "rel": 1e-6}
            text = repr(value)
        elif type_id == "float64":
            expect = {"kind": "float", "value": value, "rel": 1e-14}
            text = repr(value)
        else:
            expect = {"kind": "text", "text": str(value)}
            text = str(value)
        cases.append({"registers": registers, "expect": expect, "input": text})
    return cases


def single_register():
    # Order does not apply to one register (src/lib/datatypes.ts decodes these before reordering).
    def uint16(v):
        return {"registers": [v], "expect": {"kind": "text", "text": str(v)}, "input": str(v)}

    def int16(v):
        return {"registers": [v & 0xFFFF], "expect": {"kind": "text", "text": str(v)}, "input": str(v)}

    def hex16(v):
        text = f"0x{v:04X}"
        return {"registers": [v], "expect": {"kind": "text", "text": text}, "input": text}

    def binary(v):
        bits = format(v, "016b")
        text = " ".join(bits[i : i + 4] for i in range(0, 16, 4))
        return {"registers": [v], "expect": {"kind": "text", "text": text}, "input": text}

    def ascii2(s):
        high, low = s.encode("ascii")
        return {"registers": [(high << 8) | low], "expect": {"kind": "text", "text": s}, "input": s}

    return {
        "uint16": [uint16(v) for v in (0, 1, 4242, 65535)],
        "int16": [int16(v) for v in (-32768, -1, 0, 32767)],
        "hex": [hex16(v) for v in (0x0000, 0x00FF, 0xBEEF, 0xFFFF)],
        "binary": [binary(v) for v in (0x0000, 0xA0F5, 0x8001, 0xFFFF)],
        # No edge spaces: WebDriver getText trims them (the unit tests cover the space).
        "ascii": [ascii2(s) for s in ("AB", "z!", "09", "~}")],
    }


def main():
    groups = []
    for type_id, cases in single_register().items():
        groups.append({"type": LABELS[type_id], "order": "ABCD", "width": 1, "cases": cases})
    for type_id, (datatype, values) in VALUES.items():
        width = len(wire(values[0], datatype, "ABCD"))
        for order in ORDERS:
            cases = multi_register(type_id, datatype, values, order)
            groups.append({"type": LABELS[type_id], "order": order, "width": width, "cases": cases})
    print(json.dumps(groups))


main()
