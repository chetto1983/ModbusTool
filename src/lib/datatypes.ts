// Conversions between 16-bit Modbus registers and typed values.
// Multi-register byte order follows the usual naming: for a 32-bit value with big-endian
// bytes A B C D, "ABCD" sends registers [AB, CD], "CDAB" swaps the words, "BADC" swaps the
// bytes inside each word, "DCBA" is fully little-endian. 64-bit values extend the same rule.

export type DataType =
  | "bit"
  | "uint16"
  | "int16"
  | "hex"
  | "binary"
  | "uint32"
  | "int32"
  | "float32"
  | "uint64"
  | "int64"
  | "float64"
  | "ascii";

export type ByteOrder = "ABCD" | "CDAB" | "BADC" | "DCBA";

export const DATA_TYPES: { id: DataType; label: string; registers: number }[] = [
  { id: "uint16", label: "UInt16", registers: 1 },
  { id: "int16", label: "Int16", registers: 1 },
  { id: "hex", label: "Hex", registers: 1 },
  { id: "binary", label: "Binary", registers: 1 },
  { id: "uint32", label: "UInt32", registers: 2 },
  { id: "int32", label: "Int32", registers: 2 },
  { id: "float32", label: "Float32", registers: 2 },
  { id: "uint64", label: "UInt64", registers: 4 },
  { id: "int64", label: "Int64", registers: 4 },
  { id: "float64", label: "Float64", registers: 4 },
  { id: "ascii", label: "ASCII", registers: 1 },
];

export const BYTE_ORDERS: ByteOrder[] = ["ABCD", "CDAB", "BADC", "DCBA"];

export function registerCount(type: DataType): number {
  return DATA_TYPES.find((t) => t.id === type)?.registers ?? 1;
}

const swapsWords = (order: ByteOrder) => order === "CDAB" || order === "DCBA";
const swapsBytes = (order: ByteOrder) => order === "BADC" || order === "DCBA";

/** Registers in wire order -> big-endian bytes. */
function toBytes(registers: number[], order: ByteOrder): DataView {
  const words = swapsWords(order) ? [...registers].reverse() : registers;
  const view = new DataView(new ArrayBuffer(words.length * 2));
  words.forEach((w, i) => view.setUint16(i * 2, w, swapsBytes(order)));
  return view;
}

/** Big-endian bytes -> registers in wire order. */
function fromBytes(view: DataView, order: ByteOrder): number[] {
  const words: number[] = [];
  for (let i = 0; i < view.byteLength; i += 2) words.push(view.getUint16(i, swapsBytes(order)));
  return swapsWords(order) ? words.reverse() : words;
}

function formatFloat(value: number, significant: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toPrecision(significant)));
}

function asciiChar(code: number): string {
  return code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : "·";
}

/** Formats the registers of one value. `registers.length` must equal `registerCount(type)`. */
export function decode(registers: number[], type: DataType, order: ByteOrder = "ABCD"): string {
  const r = registers[0] ?? 0;
  switch (type) {
    case "bit":
      return r ? "1" : "0";
    case "uint16":
      return String(r);
    case "int16":
      return String((r << 16) >> 16);
    case "hex":
      return "0x" + r.toString(16).toUpperCase().padStart(4, "0");
    case "binary":
      return r.toString(2).padStart(16, "0").replace(/(.{4})(?!$)/g, "$1 ");
    case "ascii":
      return asciiChar(r >> 8) + asciiChar(r & 0xff);
  }
  const view = toBytes(registers, order);
  switch (type) {
    case "uint32":
      return String(view.getUint32(0));
    case "int32":
      return String(view.getInt32(0));
    case "float32":
      return formatFloat(view.getFloat32(0), 7);
    case "uint64":
      return view.getBigUint64(0).toString();
    case "int64":
      return view.getBigInt64(0).toString();
    case "float64":
      return formatFloat(view.getFloat64(0), 15);
  }
}

/** Numeric value of the registers, for charts. NaN for ASCII. */
export function numeric(registers: number[], type: DataType, order: ByteOrder = "ABCD"): number {
  if (type === "ascii") return NaN;
  if (type === "hex" || type === "binary") return registers[0] ?? 0;
  return Number(decode(registers, type, order));
}

export class EncodeError extends Error {}

function parseInteger(text: string, min: bigint, max: bigint): bigint {
  const t = text.trim().replace(/[_\s]/g, "");
  let value: bigint;
  try {
    if (!/^[+-]?(0x[0-9a-f]+|0b[01]+|\d+)$/i.test(t)) throw new Error();
    const negative = t.startsWith("-");
    const body = t.replace(/^[+-]/, "");
    value = BigInt(body);
    if (negative) value = -value;
  } catch {
    throw new EncodeError(`"${text}" is not an integer`);
  }
  if (value < min || value > max) throw new EncodeError(`${text} is outside ${min}..${max}`);
  return value;
}

/** Parses user input for one value into registers in wire order. Throws EncodeError. */
export function encode(text: string, type: DataType, order: ByteOrder = "ABCD"): number[] {
  switch (type) {
    case "bit": {
      const t = text.trim().toLowerCase();
      if (["1", "on", "true"].includes(t)) return [1];
      if (["0", "off", "false"].includes(t)) return [0];
      throw new EncodeError(`"${text}" is not a bit value`);
    }
    case "uint16":
      return [Number(parseInteger(text, 0n, 0xffffn))];
    case "int16":
      return [Number(BigInt.asUintN(16, parseInteger(text, -0x8000n, 0x7fffn)))];
    case "hex": {
      const t = text.trim().replace(/^0x/i, "");
      if (!/^[0-9a-f]{1,4}$/i.test(t)) throw new EncodeError(`"${text}" is not a 16-bit hex value`);
      return [parseInt(t, 16)];
    }
    case "binary": {
      const t = text.replace(/\s/g, "").replace(/^0b/i, "");
      if (!/^[01]{1,16}$/.test(t)) throw new EncodeError(`"${text}" is not a 16-bit binary value`);
      return [parseInt(t, 2)];
    }
    case "ascii": {
      if (text.length > 2 || /[^\x20-\x7e]/.test(text)) throw new EncodeError("ASCII register holds 2 printable chars");
      const padded = text.padEnd(2, "\0");
      return [(padded.charCodeAt(0) << 8) | padded.charCodeAt(1)];
    }
  }
  const view = new DataView(new ArrayBuffer(registerCount(type) * 2));
  switch (type) {
    case "uint32":
      view.setUint32(0, Number(parseInteger(text, 0n, 0xffffffffn)));
      break;
    case "int32":
      view.setInt32(0, Number(parseInteger(text, -0x80000000n, 0x7fffffffn)));
      break;
    case "uint64":
      view.setBigUint64(0, parseInteger(text, 0n, 2n ** 64n - 1n));
      break;
    case "int64":
      view.setBigInt64(0, parseInteger(text, -(2n ** 63n), 2n ** 63n - 1n));
      break;
    case "float32":
    case "float64": {
      const value = Number(text.trim().replace(",", "."));
      if (text.trim() === "" || Number.isNaN(value)) throw new EncodeError(`"${text}" is not a number`);
      if (type === "float32") view.setFloat32(0, value);
      else view.setFloat64(0, value);
      break;
    }
  }
  return fromBytes(view, order);
}
