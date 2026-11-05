import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  BYTE_ORDERS,
  DATA_TYPES,
  EncodeError,
  decode,
  encode,
  numeric,
  registerCount,
  type DataType,
} from "./datatypes";

const sortedBytes = (registers: number[]) => registers.flatMap((w) => [w >> 8, w & 0xff]).toSorted((a, b) => a - b);

const word = fc.integer({ min: 0, max: 0xffff });

describe("known vectors", () => {
  it("float32 123.456 in every byte order", () => {
    expect(encode("123.456", "float32", "ABCD")).toEqual([0x42f6, 0xe979]);
    expect(encode("123.456", "float32", "CDAB")).toEqual([0xe979, 0x42f6]);
    expect(encode("123.456", "float32", "BADC")).toEqual([0xf642, 0x79e9]);
    expect(encode("123.456", "float32", "DCBA")).toEqual([0x79e9, 0xf642]);
    expect(decode([0xe979, 0x42f6], "float32", "CDAB")).toBe("123.456");
  });

  it("64-bit values", () => {
    expect(encode("1", "uint64", "ABCD")).toEqual([0, 0, 0, 1]);
    expect(encode("1", "uint64", "DCBA")).toEqual([0x0100, 0, 0, 0]);
    expect(decode([0xffff, 0xffff, 0xffff, 0xffff], "int64")).toBe("-1");
    expect(decode([0xffff, 0xffff, 0xffff, 0xffff], "uint64")).toBe("18446744073709551615");
    expect(decode(encode("-2.5", "float64"), "float64")).toBe("-2.5");
  });

  it("16-bit formats", () => {
    expect(decode([0x04c8], "hex")).toBe("0x04C8");
    expect(decode([0xffff], "int16")).toBe("-1");
    expect(decode([5], "binary")).toBe("0000 0000 0000 0101");
    expect(decode([0x4142], "ascii")).toBe("AB");
    expect(decode([0x4100], "ascii")).toBe("A·");
    expect(decode([1], "bit")).toBe("1");
    expect(encode("-1", "int16")).toEqual([0xffff]);
    expect(encode("0x1F", "uint16")).toEqual([31]);
    expect(encode("0b101", "uint16")).toEqual([5]);
    expect(encode("A", "ascii")).toEqual([0x4100]);
    expect(encode("1010 1010", "binary")).toEqual([0xaa]);
    expect(encode("on", "bit")).toEqual([1]);
    expect(encode("3,5", "float32")).toEqual(encode("3.5", "float32"));
  });

  it("rejects invalid input", () => {
    const bad: [string, DataType][] = [
      ["65536", "uint16"],
      ["-32769", "int16"],
      ["1.5", "int32"],
      ["abc", "float32"],
      ["", "float64"],
      ["12345", "hex"],
      ["2", "binary"],
      ["ABC", "ascii"],
      ["maybe", "bit"],
      ["-1", "uint64"],
    ];
    for (const [text, type] of bad) expect(() => encode(text, type), `${text} ${type}`).toThrow(EncodeError);
  });

  it("numeric values for charts", () => {
    expect(numeric([0xffff], "int16")).toBe(-1);
    expect(numeric([0x00ff], "hex")).toBe(255);
    expect(numeric([0x4142], "ascii")).toBeNaN();
    expect(numeric([0x42f6, 0xe979], "float32")).toBeCloseTo(123.456, 3);
  });
});

describe("properties", () => {
  const types = DATA_TYPES.map((t) => t.id).filter((t) => t !== "ascii");

  it("decode then encode returns the same registers", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...types),
        fc.constantFrom(...BYTE_ORDERS),
        fc.array(word, { minLength: 4, maxLength: 4 }),
        (type, order, words) => {
          const registers = words.slice(0, registerCount(type));
          const text = decode(registers, type, order);
          // NaN has many bit patterns; only the canonical one survives a round trip.
          fc.pre(text !== "NaN");
          if (type.startsWith("float")) {
            expect(decode(encode(text, type, order), type, order)).toBe(text);
          } else {
            expect(encode(text, type, order)).toEqual(registers);
          }
        },
      ),
    );
  });

  it("byte orders are permutations of the same bytes", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (n) => {
        const reference = sortedBytes(encode(String(n), "uint32", "ABCD"));
        for (const order of BYTE_ORDERS) expect(sortedBytes(encode(String(n), "uint32", order))).toEqual(reference);
      }),
    );
  });
});
