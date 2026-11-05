// Slave operations driven by the UI: listener, units, data access, CSV and simulation.

import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { api, type Table } from "./api";
import { parseRegisters, registersCsv } from "./csv";
import { labelKey, newId, type SimulationRule } from "./project";
import { simulatedRegisters, tick } from "./simulation";
import { runs } from "./units";
import { app, notify, slave } from "./state.svelte";

export const TABLES: { id: Table; label: string; bits: boolean }[] = [
  { id: "coils", label: "Coils", bits: true },
  { id: "discreteInputs", label: "Discrete inputs", bits: true },
  { id: "holdingRegisters", label: "Holding registers", bits: false },
  { id: "inputRegisters", label: "Input registers", bits: false },
];

export const isBitTable = (table: Table) => table === "coils" || table === "discreteInputs";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function applyUnits(units: number[]): Promise<void> {
  app.project.slave.units = units;
  await api.slaveSetUnits(units);
}

export async function startSlave(): Promise<void> {
  slave.busy = true;
  slave.error = null;
  try {
    await api.slaveSetUnits($state.snapshot(app.project.slave.units));
    slave.endpoint = await api.slaveStart($state.snapshot(app.project.slave.config));
    slave.running = true;
  } catch (e) {
    slave.error = message(e);
  } finally {
    slave.busy = false;
  }
}

export async function stopSlave(): Promise<void> {
  slave.busy = true;
  try {
    await api.slaveStop();
    slave.running = false;
  } finally {
    slave.busy = false;
  }
}

export function slaveLabel(unit: number, table: Table, address: number): string {
  return app.project.labels[labelKey("slave", unit, table, address)] ?? "";
}

export function setSlaveLabel(unit: number, table: Table, address: number, label: string): void {
  const key = labelKey("slave", unit, table, address);
  if (label.trim()) app.project.labels[key] = label.trim();
  else delete app.project.labels[key];
}

const CSV_FILTERS = [{ name: "CSV", extensions: ["csv", "txt"] }];

export async function importCsv(unit: number, table: Table): Promise<number | null> {
  const path = await open({ filters: CSV_FILTERS, multiple: false, directory: false });
  if (!path) return null;
  try {
    const entries = parseRegisters(await readTextFile(path));
    for (const run of runs(entries)) await api.slaveWrite(unit, table, run.address, run.values);
    for (const e of entries) if (e.label) setSlaveLabel(unit, table, e.address, e.label);
    notify("ok", `Imported ${entries.length} values`);
    return entries[0]?.address ?? null;
  } catch (e) {
    notify("error", `Import failed: ${message(e)}`);
    return null;
  }
}

export async function exportCsv(unit: number, table: Table, start: number, count: number): Promise<void> {
  const path = await save({ filters: CSV_FILTERS, defaultPath: `unit${unit}-${table}-${start}.csv` });
  if (!path) return;
  try {
    const values = await api.slaveRead(unit, table, start, count);
    const rows = values.map((value, i) => ({ address: start + i, value, label: slaveLabel(unit, table, start + i) }));
    await writeTextFile(path, registersCsv(rows));
    notify("ok", `Exported ${rows.length} values`);
  } catch (e) {
    notify("error", `Export failed: ${message(e)}`);
  }
}

export function newRule(unit: number, table: Table, address: number): SimulationRule {
  return {
    id: newId(),
    enabled: true,
    unit,
    table,
    address,
    dataType: "uint16",
    byteOrder: "ABCD",
    kind: isBitTable(table) ? "toggle" : "sine",
    min: 0,
    max: isBitTable(table) ? 1 : 100,
    step: 1,
    periodMs: 1000,
  };
}

/** Last simulation error per rule id, shown in the editor. */
export const simulationErrors = $state<Record<string, string>>({});

const lastTick = new Map<string, number>();
let simulationTimer: ReturnType<typeof setInterval> | null = null;

/** Writes simulated values whenever a rule enters a new period. Runs for the app lifetime. */
export function startSimulationLoop(): () => void {
  simulationTimer ??= setInterval(() => {
    const now = Date.now();
    for (const rule of app.project.slave.simulations) {
      if (!rule.enabled || !app.project.slave.units.includes(rule.unit)) continue;
      const k = tick(rule, now);
      if (lastTick.get(rule.id) === k) continue;
      lastTick.set(rule.id, k);
      try {
        const registers = simulatedRegisters(rule, now);
        api
          .slaveWrite(rule.unit, rule.table, rule.address, registers)
          .then(() => delete simulationErrors[rule.id])
          .catch((e) => (simulationErrors[rule.id] = message(e)));
      } catch (e) {
        simulationErrors[rule.id] = message(e);
      }
    }
  }, 50);
  return () => {
    if (simulationTimer) clearInterval(simulationTimer);
    simulationTimer = null;
  };
}

