// Dashboards (docs/superpowers/specs/2026-11-06-dashboards-design.md): named grids of panels that
// show what the master's polls read and write values through the master.

import { BYTE_ORDERS, DATA_TYPES, type ByteOrder, type DataType } from "./datatypes";
import { check, isInt, isNumber, isObject } from "./validation";

/** A value read by a poll: the register at `offset` from the poll's address, in the poll's type. */
export interface Signal {
  pollId: string;
  offset: number;
}

/** Where a button or switch writes, through the master. */
export interface WriteTarget {
  unit: number;
  table: "coils" | "holdingRegisters";
  address: number;
  dataType: DataType;
  byteOrder: ByteOrder;
}

/** Position on the dashboard grid, in grid cells. */
export interface Place {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PanelBase {
  id: string;
  title: string;
  place: Place;
}

export interface TrendPanel extends PanelBase {
  kind: "trend";
  signals: Signal[];
  windowS: number;
}

export interface ValuePanel extends PanelBase {
  kind: "value";
  signal: Signal | null;
  unit: string;
  /** Shown value = read value × scale + offset. */
  scale: number;
  offset: number;
  decimals: number;
  gauge: boolean;
  min: number;
  max: number;
  /** Shown values at or above these turn the panel to the warning and danger colours. */
  warn: number | null;
  alarm: number | null;
}

export interface BarsPanel extends PanelBase {
  kind: "bars";
  signals: Signal[];
}

export interface LampPanel extends PanelBase {
  kind: "lamp";
  /** Lit when the read value is not zero. */
  signal: Signal | null;
}

export interface ButtonPanel extends PanelBase {
  kind: "button";
  target: WriteTarget;
  /** Text encoded with the target's type, as typed in the grid. */
  value: string;
  confirm: boolean;
}

export interface SwitchPanel extends PanelBase {
  kind: "switch";
  /** The coil it writes. */
  target: WriteTarget;
  /** What shows its state, usually a poll reading the same coil. */
  signal: Signal | null;
}

export interface SelectOption {
  label: string;
  /** Text encoded with the target's type, as for a button. */
  value: string;
}

export interface SelectPanel extends PanelBase {
  kind: "select";
  target: WriteTarget;
  options: SelectOption[];
  /** What shows the chosen option: the one whose value equals the read value. */
  signal: Signal | null;
}

export interface NumberPanel extends PanelBase {
  kind: "number";
  target: WriteTarget;
  /** What shows the current setpoint, usually a poll reading the same register. */
  signal: Signal | null;
  min: number | null;
  max: number | null;
}

export type Panel =
  TrendPanel | ValuePanel | BarsPanel | LampPanel | ButtonPanel | SwitchPanel | SelectPanel | NumberPanel;
export type PanelKind = Panel["kind"];

export interface Dashboard {
  id: string;
  name: string;
  panels: Panel[];
}

export const PANEL_KINDS: PanelKind[] = ["trend", "value", "bars", "lamp", "button", "switch", "select", "number"];

export const GRID_COLUMNS = 12;

const SIZES: Record<PanelKind, Pick<Place, "w" | "h">> = {
  trend: { w: 6, h: 4 },
  value: { w: 3, h: 2 },
  bars: { w: 4, h: 4 },
  lamp: { w: 2, h: 2 },
  button: { w: 2, h: 2 },
  switch: { w: 2, h: 2 },
  select: { w: 3, h: 2 },
  number: { w: 3, h: 2 },
};

const defaultTarget = (table: WriteTarget["table"]): WriteTarget => ({
  unit: 1,
  table,
  address: 0,
  dataType: "uint16",
  byteOrder: "ABCD",
});

export function newDashboard(id: string, name: string): Dashboard {
  return { id, name, panels: [] };
}

const overlaps = (a: Place, b: Place) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The first free spot for a panel of this size, row by row from the top left, as Grafana does. */
export function freePlace(panels: Panel[], size: Pick<Place, "w" | "h">): Place {
  for (let y = 0; ; y++) {
    for (let x = 0; x + size.w <= GRID_COLUMNS; x++) {
      const place = { x, y, ...size };
      if (!panels.some((p) => overlaps(p.place, place))) return place;
    }
  }
}

/** A new panel of `kind` in the first free spot of the dashboard. */
export function newPanel(id: string, kind: PanelKind, title: string, panels: Panel[]): Panel {
  const base = { id, title, place: freePlace(panels, SIZES[kind]) };
  switch (kind) {
    case "trend":
      return { ...base, kind, signals: [], windowS: 60 };
    case "value":
      return {
        ...base,
        kind,
        signal: null,
        unit: "",
        scale: 1,
        offset: 0,
        decimals: 1,
        gauge: false,
        min: 0,
        max: 100,
        warn: null,
        alarm: null,
      };
    case "bars":
      return { ...base, kind, signals: [] };
    case "lamp":
      return { ...base, kind, signal: null };
    case "button":
      return { ...base, kind, target: defaultTarget("holdingRegisters"), value: "1", confirm: false };
    case "switch":
      return { ...base, kind, target: defaultTarget("coils"), signal: null };
    case "select":
      return {
        ...base,
        kind,
        target: defaultTarget("holdingRegisters"),
        options: ["0", "1"].map((value) => ({ label: value, value })),
        signal: null,
      };
    case "number":
      return { ...base, kind, target: defaultTarget("holdingRegisters"), signal: null, min: null, max: null };
  }
}

// ---------- project file validation ----------

const isSignal = (v: unknown) => isObject(v) && typeof v.pollId === "string" && isInt(v.offset, 0, 1999);
const isOptionalSignal = (v: unknown) => v === null || isSignal(v);
const isNullableNumber = (v: unknown) => v === null || isNumber(v);

function isTarget(v: unknown): boolean {
  return (
    isObject(v) &&
    isInt(v.unit, 0, 255) &&
    (v.table === "coils" || v.table === "holdingRegisters") &&
    isInt(v.address, 0, 0xffff) &&
    DATA_TYPES.some((t) => t.id === v.dataType) &&
    BYTE_ORDERS.includes(v.byteOrder as ByteOrder)
  );
}

function isPlace(v: unknown): boolean {
  return (
    isObject(v) &&
    isInt(v.x, 0, GRID_COLUMNS - 1) &&
    isInt(v.y, 0, 10_000) &&
    isInt(v.w, 1, GRID_COLUMNS) &&
    isInt(v.h, 1, 100)
  );
}

const isOption = (v: unknown) => isObject(v) && typeof v.label === "string" && typeof v.value === "string";

const PANEL_FIELDS: Record<PanelKind, (p: Record<string, unknown>) => boolean> = {
  trend: (p) => Array.isArray(p.signals) && p.signals.every(isSignal) && isInt(p.windowS, 1, 86_400),
  value: (p) =>
    isOptionalSignal(p.signal) &&
    typeof p.unit === "string" &&
    [p.scale, p.offset, p.min, p.max].every(isNumber) &&
    isInt(p.decimals, 0, 10) &&
    typeof p.gauge === "boolean" &&
    isNullableNumber(p.warn) &&
    isNullableNumber(p.alarm),
  bars: (p) => Array.isArray(p.signals) && p.signals.every(isSignal),
  lamp: (p) => isOptionalSignal(p.signal),
  button: (p) => isTarget(p.target) && typeof p.value === "string" && typeof p.confirm === "boolean",
  switch: (p) => isTarget(p.target) && isOptionalSignal(p.signal),
  select: (p) =>
    isTarget(p.target) && Array.isArray(p.options) && p.options.every(isOption) && isOptionalSignal(p.signal),
  number: (p) => isTarget(p.target) && isOptionalSignal(p.signal) && isNullableNumber(p.min) && isNullableNumber(p.max),
};

function checkPanel(v: unknown): void {
  check(isObject(v), "panel must be an object");
  const panel = v as Record<string, unknown>;
  check(typeof panel.id === "string" && typeof panel.title === "string", "panel id/title");
  check(PANEL_KINDS.includes(panel.kind as PanelKind), `panel kind ${String(panel.kind)}`);
  check(isPlace(panel.place), "panel place");
  check(PANEL_FIELDS[panel.kind as PanelKind](panel), `${String(panel.kind)} panel settings`);
}

/** Dashboards from a project file; a file without the field (before dashboards) has none. */
export function parseDashboards(v: unknown): Dashboard[] {
  if (v === undefined) return [];
  check(Array.isArray(v), "dashboards");
  for (const d of v as unknown[]) {
    check(isObject(d) && typeof d.id === "string" && typeof d.name === "string", "dashboard id/name");
    const panels = (d as Record<string, unknown>).panels;
    check(Array.isArray(panels), "dashboard panels");
    (panels as unknown[]).forEach(checkPanel);
  }
  return v as Dashboard[];
}
