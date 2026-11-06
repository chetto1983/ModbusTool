// Dashboards read their own variables (spec D14): every distinct variable is a backend poll, with the
// shortest period of the dashboards using it, running while the master is connected.

import { api, type PollDefinition, type ReadKind } from "./api";
import type { Dashboard, Panel, Variable } from "./dashboards";
import { registerCount } from "./datatypes";
import { app, isBitTable, master, READ_PREFIX, readings, readKey, readLayout } from "./state.svelte";

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

/** Most values one request reads: FC03/04 and FC01/02 (Modbus Application Protocol 1.1b3 §6.1-6.4). */
export const MAX_REGISTERS = 125;
export const MAX_BITS = 2000;

export interface ReadPlan {
  polls: PollDefinition[];
  /** Each variable's block and offset in it, by readKey. */
  layout: Record<string, { block: string; offset: number }>;
}

interface Span {
  key: string;
  unit: number;
  table: Variable["table"];
  start: number;
  end: number;
  intervalMs: number;
}

/** Each distinct location read, with the shortest period of the dashboards that show it. */
function spans(): Span[] {
  const byKey = new Map<string, Span>();
  for (const dashboard of app.project.dashboards) {
    for (const variable of dashboardVariables(dashboard)) {
      const key = readKey(variable);
      const known = byKey.get(key);
      if (known && known.intervalMs <= dashboard.periodMs) continue;
      const width = isBitTable(variable.table) ? 1 : registerCount(variable.dataType);
      const { unit, table, address } = variable;
      byKey.set(key, { key, unit, table, start: address, end: address + width, intervalMs: dashboard.periodMs });
    }
  }
  return [...byKey.values()];
}

/**
 * The backend polls the dashboards need now (none while the master is not connected): one per
 * block of variables of the same unit, table and period that touch or overlap, up to what one
 * request reads. Addresses no variable asks for are never read (spec D21).
 */
export function readPlan(): ReadPlan {
  const plan: ReadPlan = { polls: [], layout: {} };
  if (!master.connected) return plan;
  const groups = new Map<string, Span[]>();
  for (const span of spans()) {
    const group = `${span.unit}:${span.table}:${span.intervalMs}`;
    groups.set(group, [...(groups.get(group) ?? []), span]);
  }
  for (const group of groups.values()) {
    const sorted = group.toSorted((a, b) => a.start - b.start);
    const limit = isBitTable(sorted[0].table) ? MAX_BITS : MAX_REGISTERS;
    let block: Span[] = [];
    let end = 0;
    const close = () => {
      if (!block.length) return;
      const [first] = block;
      const id = `${READ_PREFIX}${first.unit}:${first.table}:${first.start}+${end - first.start}@${first.intervalMs}`;
      plan.polls.push({
        id,
        unit: first.unit,
        operation: { kind: READ_KIND[first.table], address: first.start, quantity: end - first.start },
        intervalMs: first.intervalMs,
      });
      for (const s of block) plan.layout[s.key] = { block: id, offset: s.start - first.start };
    };
    for (const span of sorted) {
      if (block.length && (span.start > end || Math.max(end, span.end) - block[0].start > limit)) {
        close();
        block = [];
      }
      end = block.length ? Math.max(end, span.end) : span.end;
      block.push(span);
    }
    close();
  }
  return plan;
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

/** Applies a read plan after any change still being applied, never two at once. */
export function followReads(plan: ReadPlan): Promise<void> {
  queue = queue
    .catch(() => {})
    .then(() => {
      for (const key of Object.keys(readLayout)) if (!(key in plan.layout)) delete readLayout[key];
      Object.assign(readLayout, plan.layout);
      return syncReads(plan.polls);
    });
  return queue;
}
