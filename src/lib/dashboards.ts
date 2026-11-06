// Dashboards (docs/superpowers/specs/2026-11-06-dashboards-design.md): named grids of panels that
// read their own variables through the master and write values through it.

import type { Table } from "./api";
import type { ByteOrder, DataType } from "./datatypes";
import type { Scaling } from "./scaling";

/** A value on a device, read by the dashboard (D13). Type and byte order apply to registers. */
export interface Variable {
  /** Shown in legends and labels; empty means the address is shown. */
  name: string;
  unit: number;
  table: Table;
  address: number;
  dataType: DataType;
  byteOrder: ByteOrder;
  /** Raw to engineering value (D16); null shows the raw value. */
  scaling: Scaling | null;
  /** Line, bar or lamp colour (D22): a fixed token name, a custom #rrggbb, or null (automatic). */
  colour: string | null;
}

/** Where a command panel writes, through the master. */
export interface WriteTarget {
  unit: number;
  table: "coils" | "holdingRegisters";
  address: number;
  dataType: DataType;
  byteOrder: ByteOrder;
  /** Values to write are engineering values, written raw (D17). */
  scaling: Scaling | null;
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

/** How a trend joins its samples: held until the next one, straight, or smoothed. */
export const INTERPOLATIONS = ["step", "linear", "spline"] as const;
export type Interpolation = (typeof INTERPOLATIONS)[number];

export interface TrendPanel extends PanelBase {
  kind: "trend";
  variables: Variable[];
  windowS: number;
  interpolation: Interpolation;
}

export interface ValuePanel extends PanelBase {
  kind: "value";
  variable: Variable;
  unit: string;
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
  variables: Variable[];
}

/** A row of a table panel: a variable with the units and decimals it is shown with (spec R6). */
export interface TableRow {
  variable: Variable;
  units: string;
  decimals: number;
}

/** Many variables as a list, such as a device's register map (spec R5). */
export interface TablePanel extends PanelBase {
  kind: "table";
  rows: TableRow[];
}

export interface LampPanel extends PanelBase {
  kind: "lamp";
  /** Lit when the read value is not zero. */
  variable: Variable;
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
  /** What shows its state, at first the coil it writes. */
  state: Variable | null;
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
  state: Variable | null;
}

export interface NumberPanel extends PanelBase {
  kind: "number";
  target: WriteTarget;
  /** What shows the current setpoint, at first the register it writes. */
  state: Variable | null;
  min: number | null;
  max: number | null;
}

export type Panel =
  TrendPanel | ValuePanel | TablePanel | BarsPanel | LampPanel | ButtonPanel | SwitchPanel | SelectPanel | NumberPanel;
export type PanelKind = Panel["kind"];

export interface Dashboard {
  id: string;
  name: string;
  /** How often its variables are read while the master is connected (D14). */
  periodMs: number;
  panels: Panel[];
}

export const DEFAULT_PERIOD_MS = 1000;

export const PANEL_KINDS: PanelKind[] = [
  "trend",
  "value",
  "table",
  "bars",
  "lamp",
  "button",
  "switch",
  "select",
  "number",
];

export const GRID_COLUMNS = 12;

const SIZES: Record<PanelKind, Pick<Place, "w" | "h">> = {
  trend: { w: 6, h: 4 },
  value: { w: 3, h: 2 },
  table: { w: 6, h: 5 },
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
  scaling: null,
});

export function newDashboard(id: string, name: string): Dashboard {
  return { id, name, periodMs: DEFAULT_PERIOD_MS, panels: [] };
}

export const newVariable = (over: Partial<Variable> = {}): Variable => ({
  name: "",
  unit: 1,
  table: "holdingRegisters",
  address: 0,
  dataType: "uint16",
  byteOrder: "ABCD",
  scaling: null,
  colour: null,
  ...over,
});

export const newTableRow = (variable: Variable = newVariable()): TableRow => ({ variable, units: "", decimals: 1 });

/** The variable at a write target's own location: what a command panel shows at first. */
export const targetVariable = (target: WriteTarget): Variable => ({ ...target, name: "", colour: null });

/** A command's state after its target changed: it follows the target while it reads that location. */
export function followTarget(state: Variable | null, before: WriteTarget, after: WriteTarget): Variable | null {
  if (!state || variableKey(state) !== variableKey(targetVariable(before))) return state;
  return { ...targetVariable(after), name: state.name, colour: state.colour };
}

/** One key per location read: the name does not change what is read, and bits have no type. */
export function variableKey(v: Variable): string {
  const bits = v.table === "coils" || v.table === "discreteInputs";
  return [v.unit, v.table, v.address, ...(bits ? [] : [v.dataType, v.byteOrder])].join(":");
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

const commandPanel = <P extends object>(panel: P, target: WriteTarget) => ({
  ...panel,
  target,
  state: targetVariable(target),
});

/** A new panel of `kind` in the first free spot of the dashboard. */
export function newPanel(id: string, kind: PanelKind, title: string, panels: Panel[]): Panel {
  const base = { id, title, place: freePlace(panels, SIZES[kind]) };
  switch (kind) {
    case "trend":
      return { ...base, kind, variables: [newVariable()], windowS: 60, interpolation: "linear" };
    case "value":
      return {
        ...base,
        kind,
        variable: newVariable(),
        unit: "",
        decimals: 1,
        gauge: false,
        min: 0,
        max: 100,
        warn: null,
        alarm: null,
      };
    case "table":
      return { ...base, kind, rows: [newTableRow()] };
    case "bars":
      return { ...base, kind, variables: [newVariable()] };
    case "lamp":
      return { ...base, kind, variable: newVariable({ table: "coils" }) };
    case "button":
      return { ...base, kind, target: defaultTarget("holdingRegisters"), value: "1", confirm: false };
    case "switch":
      return commandPanel({ ...base, kind }, defaultTarget("coils"));
    case "select":
      return commandPanel(
        { ...base, kind, options: ["0", "1"].map((value) => ({ label: value, value })) },
        defaultTarget("holdingRegisters"),
      );
    case "number":
      return commandPanel({ ...base, kind, min: null, max: null }, defaultTarget("holdingRegisters"));
  }
}
