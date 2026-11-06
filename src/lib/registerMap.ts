// Register maps (docs/superpowers/specs/2026-11-06-register-maps-logging-design.md, R1-R8): a
// device's registers as CSV, read into the rows of a dashboard table panel and written back.

import { m } from "../paraglide/messages.js";
import type { Table } from "./api";
import { field, parseLine } from "./csv";
import { newTableRow, newVariable, type TableRow } from "./dashboards";
import { BYTE_ORDERS, DATA_TYPES, type ByteOrder, type DataType } from "./datatypes";
import type { Scaling } from "./scaling";

export class MapError extends Error {}

const COLUMNS = [
  "name",
  "table",
  "address",
  "type",
  "byte_order",
  "units",
  "decimals",
  "raw_min",
  "raw_max",
  "eng_min",
  "eng_max",
  "clamp",
] as const;
type Column = (typeof COLUMNS)[number];
const REQUIRED: Column[] = ["name", "table", "address"];
const SCALING: Column[] = ["raw_min", "raw_max", "eng_min", "eng_max"];

const TABLE_NAMES: Record<Table, string> = {
  coils: "coils",
  discreteInputs: "discrete inputs",
  holdingRegisters: "holding registers",
  inputRegisters: "input registers",
};
const TABLE_ALIASES: Record<string, Table> = {
  coils: "coils",
  coil: "coils",
  discreteinputs: "discreteInputs",
  discrete: "discreteInputs",
  holdingregisters: "holdingRegisters",
  holding: "holdingRegisters",
  inputregisters: "inputRegisters",
  input: "inputRegisters",
};

const isBits = (table: Table) => table === "coils" || table === "discreteInputs";
const columnName = (header: string) =>
  header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** A row's text by column, empty for a column the file does not have. */
type Cells = (column: Column) => string;

function parseRow(cells: Cells, unit: number, fail: (column: Column) => never): TableRow {
  const table = TABLE_ALIASES[cells("table").toLowerCase().replace(/\s+/g, "")] ?? fail("table");
  const addressText = cells("address");
  const address = /^\d+$/.test(addressText) ? Number(addressText) : NaN;
  if (!(address <= 0xffff)) fail("address");
  const typeText = cells("type").toLowerCase();
  const dataType: DataType = isBits(table)
    ? "uint16"
    : (DATA_TYPES.find((t) => t.id === typeText || t.label.toLowerCase() === typeText)?.id ?? fail("type"));
  const orderText = cells("byte_order").toUpperCase();
  const byteOrder: ByteOrder =
    orderText === "" ? "ABCD" : (BYTE_ORDERS.find((o) => o === orderText) ?? fail("byte_order"));
  const decimalsText = cells("decimals");
  const decimals = decimalsText === "" ? 1 : Number(decimalsText);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) fail("decimals");
  const variable = newVariable({
    name: cells("name"),
    unit,
    table,
    address,
    dataType,
    byteOrder,
    scaling: parseScaling(cells, fail),
  });
  return { ...newTableRow(variable), units: cells("units"), decimals };
}

/** The four scaling columns together, or none of them (R1). */
function parseScaling(cells: Cells, fail: (column: Column) => never): Scaling | null {
  const texts = SCALING.map(cells);
  if (texts.every((t) => t === "")) return null;
  const [rawMin, rawMax, engMin, engMax] = texts.map((t, i) =>
    t !== "" && Number.isFinite(Number(t)) ? Number(t) : fail(SCALING[i]),
  );
  if (rawMin === rawMax) fail("raw_max");
  const clampText = cells("clamp").toLowerCase();
  if (!["", "true", "false", "yes", "no", "1", "0"].includes(clampText)) fail("clamp");
  return { rawMin, rawMax, engMin, engMax, clamp: ["true", "yes", "1"].includes(clampText) };
}

/**
 * The rows of a register map, all read by `unit`. A file with one invalid row is refused whole
 * (R4): a map imported in part looks complete and is not.
 */
export function parseRegisterMap(text: string, unit: number): TableRow[] {
  const lines = text.split(/\r?\n/).map((line, i) => ({ line, number: i + 1 }));
  const filled = lines.filter(({ line }) => line.trim() !== "");
  if (filled.length < 2) throw new MapError(m.map_empty());
  const headers = parseLine(filled[0].line).map(columnName);
  const missing = REQUIRED.filter((c) => !headers.includes(c));
  if (missing.length) throw new MapError(m.map_missing_columns({ columns: missing.join(", ") }));
  return filled.slice(1).map(({ line, number }) => {
    const values = parseLine(line);
    const cells: Cells = (column) => {
      const index = headers.indexOf(column);
      return index < 0 ? "" : (values[index] ?? "").trim();
    };
    const fail = (column: Column): never => {
      const value = cells(column);
      throw new MapError(
        column === "address"
          ? m.map_invalid_address({ line: number, value })
          : m.map_invalid_cell({ line: number, column, value }),
      );
    };
    return parseRow(cells, unit, fail);
  });
}

/** A table panel's rows as a register map, in the format `parseRegisterMap` reads (R7). */
export function registerMapCsv(rows: TableRow[]): string {
  const lines = rows.map(({ variable: v, units, decimals }) => {
    const s = v.scaling;
    const scaling = s
      ? [s.rawMin, s.rawMax, s.engMin, s.engMax].map(String).concat(String(s.clamp))
      : ["", "", "", "", ""];
    const type = isBits(v.table) ? "" : (DATA_TYPES.find((t) => t.id === v.dataType)?.label ?? v.dataType);
    return [field(v.name), TABLE_NAMES[v.table], String(v.address), type, isBits(v.table) ? "" : v.byteOrder]
      .concat(field(units), String(decimals), scaling)
      .join(",");
  });
  return [COLUMNS.join(","), ...lines].join("\n") + "\n";
}
