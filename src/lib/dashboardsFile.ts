// Dashboards in the project file: validation, and conversion of files saved by 3.2.0, whose panels
// read through the master's polls (spec D15).

import type { ReadKind, Table } from "./api";
import { BYTE_ORDERS, DATA_TYPES, type ByteOrder } from "./datatypes";
import {
  DEFAULT_PERIOD_MS,
  GRID_COLUMNS,
  INTERPOLATIONS,
  PANEL_KINDS,
  newVariable,
  type Dashboard,
  type Interpolation,
  type PanelKind,
  type Variable,
} from "./dashboards";
import type { PollConfig } from "./project";
import { isColour } from "./colors";
import { isScaling } from "./scaling";
import { check, isInt, isNumber, isObject } from "./validation";

const TABLES = new Set<unknown>(["coils", "discreteInputs", "holdingRegisters", "inputRegisters"]);

const isNullableNumber = (v: unknown) => v === null || isNumber(v);

const isLocation = (v: Record<string, unknown>) =>
  isInt(v.unit, 0, 255) &&
  isInt(v.address, 0, 0xffff) &&
  DATA_TYPES.some((t) => t.id === v.dataType) &&
  BYTE_ORDERS.includes(v.byteOrder as ByteOrder);

const isVariable = (v: unknown) =>
  isObject(v) &&
  typeof v.name === "string" &&
  TABLES.has(v.table) &&
  isLocation(v) &&
  isScaling(v.scaling, false) &&
  isColour(v.colour);
const isVariables = (v: unknown) => Array.isArray(v) && v.every(isVariable);
const isState = (v: unknown) => v === null || isVariable(v);

const isTarget = (v: unknown) =>
  isObject(v) && (v.table === "coils" || v.table === "holdingRegisters") && isLocation(v) && isScaling(v.scaling, true);

const isPlace = (v: unknown) =>
  isObject(v) &&
  isInt(v.x, 0, GRID_COLUMNS - 1) &&
  isInt(v.y, 0, 10_000) &&
  isInt(v.w, 1, GRID_COLUMNS) &&
  isInt(v.h, 1, 100);

const isOption = (v: unknown) => isObject(v) && typeof v.label === "string" && typeof v.value === "string";

const PANEL_FIELDS: Record<PanelKind, (p: Record<string, unknown>) => boolean> = {
  trend: (p) =>
    isVariables(p.variables) &&
    isInt(p.windowS, 1, 86_400) &&
    INTERPOLATIONS.includes(p.interpolation as Interpolation),
  value: (p) =>
    isVariable(p.variable) &&
    typeof p.unit === "string" &&
    [p.min, p.max].every(isNumber) &&
    isInt(p.decimals, 0, 10) &&
    typeof p.gauge === "boolean" &&
    isNullableNumber(p.warn) &&
    isNullableNumber(p.alarm),
  bars: (p) => isVariables(p.variables),
  lamp: (p) => isVariable(p.variable),
  button: (p) => isTarget(p.target) && typeof p.value === "string" && typeof p.confirm === "boolean",
  switch: (p) => isTarget(p.target) && isState(p.state),
  select: (p) => isTarget(p.target) && Array.isArray(p.options) && p.options.every(isOption) && isState(p.state),
  number: (p) => isTarget(p.target) && isState(p.state) && isNullableNumber(p.min) && isNullableNumber(p.max),
};

const TABLE_OF: Record<ReadKind, Table> = {
  readCoils: "coils",
  readDiscreteInputs: "discreteInputs",
  readHoldingRegisters: "holdingRegisters",
  readInputRegisters: "inputRegisters",
};

/** A 3.2.0 signal (poll + register offset) as the variable it read, or null when its poll is gone. */
function signalVariable(signal: unknown, polls: PollConfig[]): Variable | null {
  if (!isObject(signal)) return null;
  const poll = polls.find((p) => p.id === signal.pollId);
  if (!poll || !isInt(signal.offset, 0, 1999)) return null;
  return {
    name: "",
    unit: poll.unit,
    table: TABLE_OF[poll.kind],
    address: poll.address + (signal.offset as number),
    dataType: poll.dataType,
    byteOrder: poll.byteOrder,
    scaling: null,
    colour: null,
  };
}

/** Rewrites a 3.2.0 panel in place: signals become variables, a command's signal its state. */
function convertPanel(panel: Record<string, unknown>, polls: PollConfig[]): void {
  if ("signals" in panel) {
    // Not a list: left as it is, for the check to reject.
    panel.variables = Array.isArray(panel.signals)
      ? panel.signals.map((s) => signalVariable(s, polls)).filter((v) => v !== null)
      : panel.signals;
    delete panel.signals;
  }
  if ("signal" in panel) {
    const variable = signalVariable(panel.signal, polls);
    if (panel.kind === "value" || panel.kind === "lamp") panel.variable = variable ?? newVariable();
    else panel.state = variable;
    delete panel.signal;
  }
  // 3.2.0 drew trends in steps and had no choice.
  if (panel.kind === "trend") panel.interpolation ??= "step";
  // Saved before scaling (D16): nothing scaled, except a value panel's own scale and offset (D18).
  const variables = Array.isArray(panel.variables) ? panel.variables : [];
  for (const v of [panel.variable, panel.state, panel.target, ...variables]) if (isObject(v)) v.scaling ??= null;
  // Saved before colours (D22): automatic.
  for (const v of [panel.variable, panel.state, ...variables]) if (isObject(v)) v.colour ??= null;
  if (panel.kind === "value" && ("scale" in panel || "offset" in panel)) {
    const { scale, offset } = panel;
    check(isNumber(scale) && isNumber(offset), "value panel settings");
    if (isObject(panel.variable) && (scale !== 1 || offset !== 0)) {
      const [engMin, span] = [offset as number, scale as number];
      panel.variable.scaling = { rawMin: 0, rawMax: 1, engMin, engMax: engMin + span, clamp: false };
    }
    delete panel.scale;
    delete panel.offset;
  }
}

function checkPanel(v: unknown, polls: PollConfig[]): void {
  check(isObject(v), "panel must be an object");
  const panel = v as Record<string, unknown>;
  convertPanel(panel, polls);
  check(typeof panel.id === "string" && typeof panel.title === "string", "panel id/title");
  check(PANEL_KINDS.includes(panel.kind as PanelKind), `panel kind ${String(panel.kind)}`);
  check(isPlace(panel.place), "panel place");
  check(PANEL_FIELDS[panel.kind as PanelKind](panel), `${String(panel.kind)} panel settings`);
}

/**
 * Dashboards from a project file; a file without the field (before dashboards) has none. `polls`
 * are the file's polls, which 3.2.0 dashboards read through.
 */
export function parseDashboards(v: unknown, polls: PollConfig[]): Dashboard[] {
  if (v === undefined) return [];
  check(Array.isArray(v), "dashboards");
  for (const d of v as unknown[]) {
    check(isObject(d) && typeof d.id === "string" && typeof d.name === "string", "dashboard id/name");
    const dashboard = d as Record<string, unknown>;
    dashboard.periodMs ??= DEFAULT_PERIOD_MS;
    check(isInt(dashboard.periodMs, 50, 3_600_000), "dashboard period");
    check(Array.isArray(dashboard.panels), "dashboard panels");
    for (const panel of dashboard.panels as unknown[]) checkPanel(panel, polls);
  }
  return v as Dashboard[];
}
