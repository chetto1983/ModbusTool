// Dashboard operations driven by the UI (docs/superpowers/specs/2026-11-06-dashboards-design.md).

import { m } from "../paraglide/messages.js";
import {
  newDashboard,
  newPanel,
  type Dashboard,
  type Panel,
  type PanelKind,
  type Place,
  type Signal,
  type WriteTarget,
} from "./dashboards";
import { labelFor, READ_KINDS, writeTo } from "./masterActions.svelte";
import { newId } from "./project";
import { app, isBitPoll, notify, pruneHistory } from "./state.svelte";
import { encode, registerCount } from "./datatypes";

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

export interface SignalOption {
  signal: Signal;
  label: string;
}

/** Every value the polls read, one per register (or per multi-register value), for pickers. */
export function signalOptions(): SignalOption[] {
  return app.project.master.polls.flatMap((poll) => {
    const width = isBitPoll(poll) ? 1 : registerCount(poll.dataType);
    const code = READ_KINDS.find((k) => k.id === poll.kind)?.code;
    const options: SignalOption[] = [];
    for (let offset = 0; offset + width <= poll.quantity; offset += width) {
      const address = poll.address + offset;
      const label = labelFor(poll, address);
      options.push({
        signal: { pollId: poll.id, offset },
        label: `${poll.name} · ${code} ${address}${label ? ` · ${label}` : ""}`,
      });
    }
    return options;
  });
}

/** How a signal is named on panels: the register's label, else poll and address. */
export function signalLabel(signal: Signal): string {
  const poll = app.project.master.polls.find((p) => p.id === signal.pollId);
  if (!poll) return m.signal_missing();
  const address = poll.address + signal.offset;
  return labelFor(poll, address) || `${poll.name} · ${address}`;
}

/** The registers a button writes, or the error that makes its value unwritable. */
export function targetRegisters(target: WriteTarget, text: string): number[] {
  return target.table === "coils" ? encode(text, "bit") : encode(text, target.dataType, target.byteOrder);
}

/** Writes a panel's value through the master; failures are shown as notices. */
export async function writeTarget(target: WriteTarget, text: string): Promise<void> {
  let registers: number[];
  try {
    registers = targetRegisters(target, text);
  } catch (e) {
    notify("error", m.master_write_failed({ error: e instanceof Error ? e.message : String(e) }));
    return;
  }
  await writeTo(target.unit, target.table === "coils", target.address, registers).catch(() => {
    // writeTo has shown the notice.
  });
}
