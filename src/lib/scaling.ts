// Two-point linear scaling, raw device value <-> engineering value, as SCADA tags do it
// (docs/superpowers/specs/2026-11-06-dashboards-design.md, D16-D17).

import type { DataType } from "./datatypes";
import { isNumber, isObject } from "./validation";

export interface Scaling {
  rawMin: number;
  rawMax: number;
  engMin: number;
  engMax: number;
  /** Keep engineering values inside engMin..engMax, both ways. */
  clamp: boolean;
}

/** A 16-bit analogue input (0..27648, as Siemens S7 scales 4-20 mA) to 0..100. */
export const defaultScaling = (): Scaling => ({ rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, clamp: false });

/** Types whose value is a number: hex, binary and ASCII are shown as typed, never scaled. */
const NUMERIC = new Set<DataType>(["uint16", "int16", "uint32", "int32", "float32", "uint64", "int64", "float64"]);
const FLOAT = new Set<DataType>(["float32", "float64"]);

/** The scaling that applies to a value of `type`: none for bits and non-numeric types. */
export const effectiveScaling = (scaling: Scaling | null, type: DataType | "bit"): Scaling | null =>
  type !== "bit" && NUMERIC.has(type) ? scaling : null;

function clamped(value: number, s: Scaling): number {
  if (!s.clamp) return value;
  const [low, high] = s.engMin <= s.engMax ? [s.engMin, s.engMax] : [s.engMax, s.engMin];
  return Math.min(high, Math.max(low, value));
}

export function toEngineering(raw: number, s: Scaling | null): number {
  if (!s) return raw;
  return clamped(s.engMin + ((raw - s.rawMin) * (s.engMax - s.engMin)) / (s.rawMax - s.rawMin), s);
}

/** The raw value to write for an engineering value; whole for integer types. */
export function toRaw(engineering: number, s: Scaling | null, type: DataType): number {
  if (!s) return engineering;
  const raw = s.rawMin + ((clamped(engineering, s) - s.engMin) * (s.rawMax - s.rawMin)) / (s.engMax - s.engMin);
  return FLOAT.has(type) ? raw : Math.round(raw);
}

/**
 * True when two engineering values stand for the same raw value: within half a raw step, since a
 * written value is rounded to a whole raw value.
 */
export function sameEngineering(a: number, b: number, s: Scaling | null): boolean {
  if (!s) return a === b;
  return Math.abs(a - b) <= Math.abs((s.engMax - s.engMin) / (s.rawMax - s.rawMin)) / 2;
}

/** A scaling from a project file; writes need a span on both sides, reads only on the raw one. */
export function isScaling(v: unknown, invertible: boolean): boolean {
  return (
    v === null ||
    (isObject(v) &&
      [v.rawMin, v.rawMax, v.engMin, v.engMax].every(isNumber) &&
      typeof v.clamp === "boolean" &&
      v.rawMin !== v.rawMax &&
      (!invertible || v.engMin !== v.engMax))
  );
}
