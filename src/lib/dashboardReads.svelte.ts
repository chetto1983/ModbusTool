// Dashboards read their own variables (spec D14): every distinct variable is a backend poll, with the
// shortest period of the dashboards using it, running while the master is connected.

import { api, type PollDefinition, type ReadKind } from "./api";
import type { Dashboard, Panel, Variable } from "./dashboards";
import { registerCount } from "./datatypes";
import { app, isBitTable, master, readings, readKey } from "./state.svelte";

const READ_KIND: Record<Variable["table"], ReadKind> = {
  coils: "readCoils",
  discreteInputs: "readDiscreteInputs",
  holdingRegisters: "readHoldingRegisters",
  inputRegisters: "readInputRegisters",
};

/** The variables a panel reads. */
export function panelVariables(panel: Panel): Variable[] {
  switch (panel.kind) {
    case "trend":
    case "bars":
      return panel.variables;
    case "value":
    case "lamp":
      return [panel.variable];
    case "button":
      return [];
    default:
      return panel.state ? [panel.state] : [];
  }
}

const dashboardVariables = (dashboard: Dashboard) => dashboard.panels.flatMap(panelVariables);

/** The backend polls the dashboards need now: none while the master is not connected. */
export function wantedReads(): PollDefinition[] {
  if (!master.connected) return [];
  const byId = new Map<string, PollDefinition>();
  for (const dashboard of app.project.dashboards) {
    for (const variable of dashboardVariables(dashboard)) {
      const id = readKey(variable);
      const known = byId.get(id);
      if (known && known.intervalMs <= dashboard.periodMs) continue;
      byId.set(id, {
        id,
        unit: variable.unit,
        operation: {
          kind: READ_KIND[variable.table],
          address: variable.address,
          quantity: isBitTable(variable.table) ? 1 : registerCount(variable.dataType),
        },
        intervalMs: dashboard.periodMs,
      });
    }
  }
  return [...byId.values()];
}

/** The polls started, by id, with the definition they run. */
const started = new Map<string, string>();

/**
 * Starts the wanted reads not running yet (or running with another definition) and stops the
 * others, dropping their last reading. The backend drops every poll on disconnect, so after a
 * disconnect `wanted` is empty and nothing is left marked as started.
 */
async function syncReads(wanted: PollDefinition[]): Promise<void> {
  const ids = new Set(wanted.map((d) => d.id));
  const gone = [...started.keys()].filter((id) => !ids.has(id));
  for (const id of gone) {
    started.delete(id);
    delete readings[id];
  }
  const changed = wanted.filter((d) => started.get(d.id) !== JSON.stringify(d));
  await Promise.all([
    ...gone.map((id) => api.pollStop(id)),
    ...changed.map(async (definition) => {
      readings[definition.id] ??= { values: null, error: null };
      await api.pollStart(definition);
      // Marked only once started: a start that failed is tried again at the next change.
      started.set(definition.id, JSON.stringify(definition));
    }),
  ]);
}

let queue = Promise.resolve();

/** Applies the wanted reads after any change still being applied, never two at once. */
export function followReads(wanted: PollDefinition[]): Promise<void> {
  queue = queue.catch(() => {}).then(() => syncReads(wanted));
  return queue;
}
