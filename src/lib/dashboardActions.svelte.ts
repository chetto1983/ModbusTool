// Dashboard operations driven by the UI (docs/superpowers/specs/2026-11-06-dashboards-design.md).

import { m } from "../paraglide/messages.js";
import {
  newDashboard,
  newPanel,
  type Dashboard,
  type NumberPanel,
  type Panel,
  type PanelKind,
  type Place,
  type Variable,
  type WriteTarget,
} from "./dashboards";
import { writeTo } from "./masterActions.svelte";
import { labelKey, newId } from "./project";
import { app, notify, pruneHistory } from "./state.svelte";
import { encode } from "./datatypes";
import { effectiveScaling, toRaw } from "./scaling";

export const dashboardUi = $state({
  selected: null as string | null,
  editing: false,
  /** The panel shown over the whole view, if any. */
  fullscreen: null as string | null,
});

export const PANEL_TITLES: Record<PanelKind, () => string> = {
  trend: m.panel_trend,
  value: m.panel_value,
  bars: m.panel_bars,
  lamp: m.panel_lamp,
  button: m.panel_button,
  switch: m.panel_switch,
  select: m.panel_select,
  number: m.panel_number,
};

/** The dashboard on screen: the one chosen, else the first. */
export const currentDashboard = (): Dashboard | null =>
  app.project.dashboards.find((d) => d.id === dashboardUi.selected) ?? app.project.dashboards[0] ?? null;

export function addDashboard(name: string): void {
  const dashboard = newDashboard(newId(), name);
  app.project.dashboards.push(dashboard);
  dashboardUi.selected = dashboard.id;
  dashboardUi.editing = true;
}

export function renameDashboard(id: string, name: string): void {
  const dashboard = app.project.dashboards.find((d) => d.id === id);
  if (dashboard) dashboard.name = name;
}

export function removeDashboard(id: string): void {
  app.project.dashboards = app.project.dashboards.filter((d) => d.id !== id);
  dashboardUi.selected = app.project.dashboards[0]?.id ?? null;
  pruneHistory();
}

/** A new panel to edit; it joins the dashboard only when saved. */
export function newPanelDraft(dashboard: Dashboard, kind: PanelKind): Panel {
  return newPanel(newId(), kind, PANEL_TITLES[kind](), dashboard.panels);
}

/** Applies an edited copy of a panel, or adds a new one. */
export function savePanel(dashboard: Dashboard, draft: Panel): void {
  const index = dashboard.panels.findIndex((p) => p.id === draft.id);
  if (index < 0) dashboard.panels.push(draft);
  else dashboard.panels[index] = { ...draft, place: dashboard.panels[index].place };
  pruneHistory();
}

export function removePanel(dashboard: Dashboard, id: string): void {
  dashboard.panels = dashboard.panels.filter((p) => p.id !== id);
  if (dashboardUi.fullscreen === id) dashboardUi.fullscreen = null;
  pruneHistory();
}

/** Positions reported by the grid after a drag or a resize. */
export function placePanels(dashboard: Dashboard, places: { id: string; place: Place }[]): void {
  for (const { id, place } of places) {
    const panel = dashboard.panels.find((p) => p.id === id);
    if (panel) panel.place = place;
  }
}

const TABLE_SHORT: Record<Variable["table"], string> = {
  coils: "Coil",
  discreteInputs: "DI",
  holdingRegisters: "HR",
  inputRegisters: "IR",
};

/** How a variable is named on panels: its name, else the register's label, else its address. */
export function variableLabel(variable: Variable): string {
  const label = app.project.labels[labelKey("master", variable.unit, variable.table, variable.address)];
  const address = `${TABLE_SHORT[variable.table]} ${variable.address}`;
  return variable.name.trim() || label || (variable.unit === 1 ? address : `${variable.unit} · ${address}`);
}

/**
 * The registers a command writes for `text`, an engineering value when the target scales (D17), or
 * the error that makes it unwritable.
 */
export function targetRegisters(target: WriteTarget, text: string): number[] {
  if (target.table === "coils") return encode(text, "bit");
  const scaling = effectiveScaling(target.scaling, target.dataType);
  const engineering = Number(text);
  // Text that is not a number is left to encode, which says why it is not writable.
  const raw =
    scaling && text.trim() !== "" && Number.isFinite(engineering)
      ? String(toRaw(engineering, scaling, target.dataType))
      : text;
  return encode(raw, target.dataType, target.byteOrder);
}

/** The registers a setpoint writes, or the error: out of the panel's range or not encodable. */
export function setpointRegisters(panel: NumberPanel, text: string): number[] {
  const value = Number(text);
  if (panel.min !== null && value < panel.min) throw new Error(m.panel_below_min({ min: panel.min }));
  if (panel.max !== null && value > panel.max) throw new Error(m.panel_above_max({ max: panel.max }));
  return targetRegisters(panel.target, text);
}

/** Writes a panel's value through the master; failures are shown as notices. True if written. */
export async function writeTarget(target: WriteTarget, text: string): Promise<boolean> {
  let registers: number[];
  try {
    registers = targetRegisters(target, text);
  } catch (e) {
    notify("error", m.master_write_failed({ error: e instanceof Error ? e.message : String(e) }));
    return false;
  }
  return writeTo(target.unit, target.table === "coils", target.address, registers).then(
    () => true,
    // writeTo has shown the notice.
    () => false,
  );
}
