// Register import/export. Import accepts the ModbusTool 2 format ("4100:0x04c8,4101:12,...")
// and the CSV this version writes ("address,value,label" with a header row).

import { m } from "../paraglide/messages.js";
import type { TrafficEvent } from "./api";

export interface AddressValue {
  address: number;
  value: number;
  label?: string;
}

export class CsvError extends Error {}

/** A CSV field, quoted when it holds a comma, a quote or a line break. */
export function field(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The fields of one CSV line, with quoted fields unquoted. */
export function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (c === '"') quoted = false;
      else current += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      fields.push(current);
      current = "";
    } else current += c;
  }
  fields.push(current);
  return fields;
}

// ModbusTool 2 rule: "0x" prefix is hex, more than 6 characters is binary, otherwise decimal.
function legacyValue(text: string): number {
  const t = text.trim();
  if (/^0x/i.test(t)) return parseInt(t.slice(2), 16);
  if (t.length > 6) return parseInt(t, 2);
  return parseInt(t, 10);
}

const inRange = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;

function checked(entry: AddressValue, source: string): AddressValue {
  if (!inRange(entry.address, 0xffff) || !inRange(entry.value, 0xffff))
    throw new CsvError(m.csv_invalid_entry({ entry: source }));
  return entry;
}

export function parseRegisters(text: string): AddressValue[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 1 && /^\d+:/.test(lines[0].trim())) {
    return lines[0]
      .trim()
      .split(",")
      .map((pair) => {
        const [address, value] = pair.split(":");
        return checked({ address: Number(address), value: legacyValue(value ?? "") }, pair);
      });
  }
  return lines
    .filter((line, i) => !(i === 0 && /^address\b/i.test(line)))
    .map((line) => {
      const [address, value, label] = parseLine(line);
      const entry: AddressValue = { address: Number(address), value: legacyValue(value ?? "") };
      if (label) entry.label = label;
      return checked(entry, line);
    });
}

export function registersCsv(rows: AddressValue[]): string {
  const lines = rows.map((r) => [String(r.address), String(r.value), field(r.label ?? "")].join(","));
  return ["address,value,label", ...lines].join("\n") + "\n";
}

export function hex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

export function trafficCsv(events: TrafficEvent[]): string {
  const lines = events.map((e) =>
    [
      new Date(e.timestampMs).toISOString(),
      e.origin,
      e.direction,
      field(e.peer),
      hex(e.bytes),
      field(e.summary?.text ?? e.message ?? ""),
    ].join(","),
  );
  return ["time,origin,direction,peer,bytes,description", ...lines].join("\n") + "\n";
}
