// Unit id lists and write batching for the slave.

import type { AddressValue } from "./csv";

/** Parses "1, 2, 10-12" into sorted unique unit ids 1..247 (Modbus serial addresses). */
export function parseUnits(text: string): number[] {
  const units = new Set<number>();
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const [from, to = from] = part.split("-").map((n) => Number(n.trim()));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 247 || from > to) {
      throw new Error(`"${part}" is not a unit or range in 1..247`);
    }
    for (let u = from; u <= to; u++) units.add(u);
  }
  if (units.size === 0) throw new Error("At least one unit is required");
  return [...units].sort((a, b) => a - b);
}

/** Groups entries into runs of consecutive addresses, one write per run. */
export function runs(entries: AddressValue[]): { address: number; values: number[] }[] {
  const sorted = [...entries].sort((a, b) => a.address - b.address);
  const out: { address: number; values: number[] }[] = [];
  for (const e of sorted) {
    const last = out[out.length - 1];
    if (last && last.address + last.values.length === e.address) last.values.push(e.value);
    else out.push({ address: e.address, values: [e.value] });
  }
  return out;
}
