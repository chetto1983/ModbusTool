import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CsvError, parseRegisters, registersCsv, trafficCsv } from "./csv";

describe("register import/export", () => {
  it("reads the ModbusTool 2 export format", () => {
    const legacy = "4100:0x04c8,4101:1234,4102:0000000000000101";
    expect(parseRegisters(legacy)).toEqual([
      { address: 4100, value: 0x04c8 },
      { address: 4101, value: 1234 },
      { address: 4102, value: 5 },
    ]);
  });

  it("round-trips its own CSV, labels with commas and quotes included", () => {
    const label = fc.string().filter((s) => !/[\r\n]/.test(s));
    const row = fc.record({
      address: fc.integer({ min: 0, max: 0xffff }),
      value: fc.integer({ min: 0, max: 0xffff }),
      label,
    });
    fc.assert(
      fc.property(fc.array(row, { maxLength: 20 }), (rows) => {
        const expected = rows.map((r) => (r.label ? r : { address: r.address, value: r.value }));
        expect(parseRegisters(registersCsv(rows))).toEqual(expected);
      }),
    );
  });

  it("rejects out of range values", () => {
    expect(() => parseRegisters("1:70000")).toThrow(CsvError);
    expect(() => parseRegisters("address,value\nx,1")).toThrow(CsvError);
    expect(parseRegisters("  ")).toEqual([]);
  });
});

describe("traffic export", () => {
  it("writes one line per event with hex bytes", () => {
    const csv = trafficCsv([
      {
        timestampMs: 0,
        origin: "master",
        direction: "tx",
        peer: "TCP 127.0.0.1:502",
        bytes: [0, 1, 0xab],
        summary: { unit: 1, function: 3, exception: null, text: "Read, quoted \"x\"" },
        message: null,
      },
      { timestampMs: 0, origin: "slave", direction: "info", peer: "p", bytes: [], summary: null, message: "Listening" },
    ]);
    expect(csv.split("\n")[1]).toBe('1970-01-01T00:00:00.000Z,master,tx,TCP 127.0.0.1:502,00 01 AB,"Read, quoted ""x"""');
    expect(csv.split("\n")[2]).toBe("1970-01-01T00:00:00.000Z,slave,info,p,,Listening");
  });
});
