import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MapError, parseRegisterMap, registerMapCsv } from "./registerMap";
import { newTableRow, newVariable, type TableRow } from "./dashboards";
import { BYTE_ORDERS, DATA_TYPES } from "./datatypes";

// The shape of a drive's register table as manuals print it: mixed types, scaled values, a bit.
const DRIVE = `Name,Table,Address,Type,Byte order,Units,Decimals,Raw min,Raw max,Eng min,Eng max
Speed setpoint,holding registers,0,UInt16,,rpm,0,,,,
Output frequency,input registers,1,Float32,CDAB,Hz,2,,,,
"Motor current, phase L1",input,3,UInt16,,A,1,0,1000,0,100
Running,coils,8,,,,0,,,,
`;

describe("parseRegisterMap", () => {
  it("reads a drive's map: tables, types, orders, units and scaling", () => {
    const rows = parseRegisterMap(DRIVE, 7);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      variable: newVariable({ name: "Speed setpoint", unit: 7, address: 0 }),
      units: "rpm",
      decimals: 0,
    });
    expect(rows[1].variable).toMatchObject({ table: "inputRegisters", dataType: "float32", byteOrder: "CDAB" });
    expect(rows[2].variable).toMatchObject({
      name: "Motor current, phase L1",
      scaling: { rawMin: 0, rawMax: 1000, engMin: 0, engMax: 100, clamp: false },
    });
    // Bits have no type or byte order: whatever the file says, the defaults are kept.
    expect(rows[3].variable).toMatchObject({ table: "coils", address: 8, dataType: "uint16", byteOrder: "ABCD" });
  });

  it("finds columns by name in any order and ignores columns it does not know", () => {
    const rows = parseRegisterMap("address,description,name,table,type\n12,the pump,Pump,holding,uint16\n", 1);
    expect(rows).toEqual([newTableRow(newVariable({ name: "Pump", address: 12 }))]);
  });

  it("skips blank lines and keeps the file's line numbers in errors", () => {
    expect(() => parseRegisterMap("name,table,address,type\n\nA,holding,1,UInt16\n\nB,holding,x,UInt16\n", 1)).toThrow(
      /line 5\b.*"x"/i,
    );
  });

  it.each([
    ["an unknown table", "A,outputs,1,UInt16", /table/],
    ["an address over 65535", "A,holding,65536,UInt16", /address/],
    ["a negative address", "A,holding,-1,UInt16", /address/],
    ["a six-digit 400001 address, with the reason", "A,holding,400001,UInt16", /40001 notation/],
    ["an unknown type", "A,holding,1,Int128", /type/],
    ["a register without type", "A,holding,1,", /type/],
  ])("refuses %s", (_, row, column) => {
    expect(() => parseRegisterMap(`name,table,address,type\n${row}\n`, 1)).toThrow(column);
  });

  it.each([
    ["an unknown byte order", "byte_order", "ABDC"],
    ["decimals out of range", "decimals", "11"],
    ["a clamp that is not yes or no", "clamp", "maybe"],
  ])("refuses %s", (_, column, value) => {
    const scaling = column === "clamp" ? ",raw_min,raw_max,eng_min,eng_max" : "";
    const values = column === "clamp" ? ",0,10,0,1" : "";
    const text = `name,table,address,type,${column}${scaling}\nA,holding,1,UInt16,${value}${values}\n`;
    expect(() => parseRegisterMap(text, 1)).toThrow(new RegExp(column));
  });

  it("wants the four scaling columns together, with a raw span", () => {
    const head = "name,table,address,type,raw_min,raw_max,eng_min,eng_max\n";
    expect(() => parseRegisterMap(`${head}A,holding,1,UInt16,0,10,0,\n`, 1)).toThrow(/eng_max/);
    expect(() => parseRegisterMap(`${head}A,holding,1,UInt16,5,5,0,1\n`, 1)).toThrow(/raw_max/);
  });

  it("refuses a file without rows or without the required columns", () => {
    expect(() => parseRegisterMap("", 1)).toThrow(MapError);
    expect(() => parseRegisterMap("name,table,address\n", 1)).toThrow(MapError);
    expect(() => parseRegisterMap("name,type\nA,UInt16\n", 1)).toThrow(/table, address/);
  });
});

const text = fc.string({ maxLength: 12 }).filter((s) => !/[\r\n]/.test(s) && s === s.trim());
const finite = fc.double({ noNaN: true, noDefaultInfinity: true }).map((n) => (Object.is(n, -0) ? 0 : n));
const bitsOrRegisters = fc.constantFrom("coils", "discreteInputs", "holdingRegisters", "inputRegisters");

const row: fc.Arbitrary<TableRow> = fc
  .record({
    name: text,
    table: bitsOrRegisters,
    address: fc.integer({ min: 0, max: 0xffff }),
    dataType: fc.constantFrom(...DATA_TYPES.map((t) => t.id)),
    byteOrder: fc.constantFrom(...BYTE_ORDERS),
    scaling: fc.option(
      fc
        .record({ rawMin: finite, rawMax: finite, engMin: finite, engMax: finite, clamp: fc.boolean() })
        .filter((s) => s.rawMin !== s.rawMax),
      { nil: null },
    ),
    units: text,
    decimals: fc.integer({ min: 0, max: 10 }),
  })
  .map(({ units, decimals, ...v }) => {
    const bits = v.table === "coils" || v.table === "discreteInputs";
    const variable = newVariable({ ...v, unit: 3, ...(bits ? { dataType: "uint16", byteOrder: "ABCD" } : {}) });
    return { variable, units, decimals };
  });

describe("registerMapCsv", () => {
  it("is read back as the same rows", () => {
    fc.assert(
      fc.property(fc.array(row, { minLength: 1, maxLength: 20 }), (rows) => {
        expect(parseRegisterMap(registerMapCsv(rows), 3)).toEqual(rows);
      }),
    );
  });

  it("writes the drive's map with readable table and type names", () => {
    const csv = registerMapCsv(parseRegisterMap(DRIVE, 1));
    expect(csv.split("\n")[0]).toBe(
      "name,table,address,type,byte_order,units,decimals,raw_min,raw_max,eng_min,eng_max,clamp",
    );
    expect(csv).toContain('"Motor current, phase L1",input registers,3,UInt16,ABCD,A,1,0,1000,0,100,false');
    expect(csv).toContain("Running,coils,8,,,,0,,,,,");
  });
});
