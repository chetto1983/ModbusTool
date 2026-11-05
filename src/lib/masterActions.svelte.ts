// Master operations driven by the UI: connection, polls, one-shot reads and writes.

import { api, type Operation, type ReadKind, type Table } from "./api";
import { labelKey, newId, type PollConfig } from "./project";
import { app, emptyRuntime, master, notify } from "./state.svelte";

export const READ_KINDS: { id: ReadKind; label: string; table: Table; code: string }[] = [
  { id: "readCoils", label: "Coils", table: "coils", code: "FC01" },
  { id: "readDiscreteInputs", label: "Discrete inputs", table: "discreteInputs", code: "FC02" },
  { id: "readHoldingRegisters", label: "Holding registers", table: "holdingRegisters", code: "FC03" },
  { id: "readInputRegisters", label: "Input registers", table: "inputRegisters", code: "FC04" },
];

export const tableOf = (kind: ReadKind): Table => READ_KINDS.find((k) => k.id === kind)!.table;
export const isWritable = (kind: ReadKind) => kind === "readCoils" || kind === "readHoldingRegisters";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function connect(): Promise<void> {
  master.busy = true;
  master.error = null;
  try {
    master.endpoint = await api.masterConnect($state.snapshot(app.project.master.config));
    master.connected = true;
  } catch (e) {
    master.error = message(e);
  } finally {
    master.busy = false;
  }
}

export async function disconnect(): Promise<void> {
  await api.masterDisconnect();
  master.connected = false;
  for (const runtime of Object.values(master.runtime)) runtime.running = false;
}

export function addPoll(): PollConfig {
  const poll: PollConfig = {
    id: newId(),
    name: `Poll ${app.project.master.polls.length + 1}`,
    unit: 1,
    kind: "readHoldingRegisters",
    address: 0,
    quantity: 10,
    intervalMs: 1000,
    dataType: "uint16",
    byteOrder: "ABCD",
  };
  app.project.master.polls.push(poll);
  master.selectedPoll = poll.id;
  return poll;
}

export async function removePoll(id: string): Promise<void> {
  await stopPoll(id);
  app.project.master.polls = app.project.master.polls.filter((p) => p.id !== id);
  clearTrend(id);
  delete master.runtime[id];
  if (master.selectedPoll === id) master.selectedPoll = app.project.master.polls[0]?.id ?? null;
}

function readOperation(poll: PollConfig) {
  return { kind: poll.kind, address: poll.address, quantity: poll.quantity };
}

export async function startPoll(poll: PollConfig): Promise<void> {
  master.runtime[poll.id] = emptyRuntime(true);
  await api.pollStart({ id: poll.id, unit: poll.unit, operation: readOperation(poll), intervalMs: poll.intervalMs });
}

export async function stopPoll(id: string): Promise<void> {
  await api.pollStop(id);
  if (master.runtime[id]) master.runtime[id].running = false;
}

/** Applies edited settings to a running poll. */
export async function restartIfRunning(poll: PollConfig): Promise<void> {
  if (master.runtime[poll.id]?.running) await startPoll(poll);
}

/** Trend points recorded before a change of function, unit, address or type mean something else. */
export function clearTrend(pollId: string): void {
  master.trend = master.trend.filter((s) => s.pollId !== pollId);
}

/** For edits that change what the poll's values mean. */
export async function redefinePoll(poll: PollConfig): Promise<void> {
  clearTrend(poll.id);
  await restartIfRunning(poll);
}

export async function readOnce(poll: PollConfig): Promise<void> {
  const runtime = (master.runtime[poll.id] ??= emptyRuntime());
  runtime.stats.requests++;
  try {
    const outcome = await api.masterExecute(poll.unit, readOperation(poll));
    runtime.values = outcome.values;
    runtime.error = null;
    runtime.updatedMs = Date.now();
    runtime.stats.ok++;
    runtime.stats.lastMs = outcome.elapsedMs;
  } catch (e) {
    runtime.error = message(e);
    runtime.stats.errors++;
    if (runtime.error.startsWith("Timeout")) runtime.stats.timeouts++;
  }
}

/** Writes from the grid: coils use FC05, one register FC06, more registers FC16. */
export async function writeValues(poll: PollConfig, address: number, registers: number[]): Promise<void> {
  let operation: Operation;
  if (poll.kind === "readCoils") operation = { kind: "writeSingleCoil", address, value: registers[0] !== 0 };
  else if (registers.length === 1) operation = { kind: "writeSingleRegister", address, value: registers[0] };
  else operation = { kind: "writeMultipleRegisters", address, values: registers };
  try {
    await api.masterExecute(poll.unit, operation);
  } catch (e) {
    notify("error", `Write failed: ${message(e)}`);
    throw e;
  }
  if (!master.runtime[poll.id]?.running) await readOnce(poll);
}

export function labelFor(poll: PollConfig, address: number): string {
  return app.project.labels[labelKey("master", poll.unit, tableOf(poll.kind), address)] ?? "";
}

export function setLabel(poll: PollConfig, address: number, label: string): void {
  const key = labelKey("master", poll.unit, tableOf(poll.kind), address);
  if (label.trim()) app.project.labels[key] = label.trim();
  else delete app.project.labels[key];
}
