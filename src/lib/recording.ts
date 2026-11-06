// Recording a dashboard's variables to CSV files, one a day
// (docs/superpowers/specs/2026-11-06-register-maps-logging-design.md, L1-L4). Pure functions: the
// time comes from outside, so day changes and cadence are tested without waiting.

import { field } from "./csv";
import { variableKey, type Dashboard, type Panel, type Variable } from "./dashboards";
import { panelVariables } from "./dashboardReads.svelte";

export interface RecordColumn {
  variable: Variable;
  header: string;
}

/** The units a dashboard shows a variable with: a table row's, else a value panel's, else none. */
function unitsOf(dashboard: Dashboard, variable: Variable): string {
  const key = variableKey(variable);
  for (const panel of dashboard.panels) {
    if (panel.kind === "table") {
      const row = panel.rows.find((r) => variableKey(r.variable) === key && r.units);
      if (row) return row.units;
    }
    if (panel.kind === "value" && panel.unit && variableKey(panel.variable) === key) return panel.unit;
  }
  return "";
}

/**
 * What a column is called: the variable's name, else the title of a panel that shows only this
 * variable (what the user calls it on screen), else `label` (the register's label or address).
 */
function columnName(panel: Panel, variable: Variable, label: (v: Variable) => string): string {
  if (variable.name.trim()) return variable.name.trim();
  const single = panel.kind !== "trend" && panel.kind !== "bars" && panel.kind !== "table";
  return single && panel.title.trim() ? panel.title.trim() : label(variable);
}

/** One column per location the dashboard reads (L1), in the order its panels show them. */
export function recordColumns(dashboard: Dashboard, label: (v: Variable) => string): RecordColumn[] {
  const columns = new Map<string, RecordColumn>();
  for (const panel of dashboard.panels) {
    for (const variable of panelVariables(panel)) {
      const key = variableKey(variable);
      if (columns.has(key)) continue;
      const name = columnName(panel, variable, label);
      const units = unitsOf(dashboard, variable);
      columns.set(key, { variable, header: units ? `${name} [${units}]` : name });
    }
  }
  return [...columns.values()];
}

export const headerLine = (columns: RecordColumn[]): string =>
  ["time", ...columns.map((c) => field(c.header))].join(",") + "\n";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local time as spreadsheets read a date: `YYYY-MM-DD hh:mm:ss.mmm` (L2). */
export function localTime(ms: number): string {
  const d = new Date(ms);
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** A row: the time, then each value with a dot as decimal separator, empty when not read (L1). */
export const rowLine = (ms: number, values: (number | null)[]): string =>
  [localTime(ms), ...values.map((v) => (v === null ? "" : String(v)))].join(",") + "\n";

/** The day's file (L4); `copy` above 1 when the day's file holds other columns. */
export function dayFileName(dashboardName: string, ms: number, copy = 1): string {
  // Characters no file system accepts in a name, and control characters.
  // eslint-disable-next-line no-control-regex
  const base = dashboardName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "dashboard";
  return `${base}_${localDate(new Date(ms))}${copy > 1 ? `_${copy}` : ""}.csv`;
}

/**
 * True when a reading at `ms` starts a new row (L3): at most one row per half period, so that
 * readings arriving a little early are not skipped and the blocks of one cycle make one row.
 */
export const rowDue = (lastRowMs: number | null, ms: number, periodMs: number): boolean =>
  lastRowMs === null || ms - lastRowMs >= periodMs / 2;
