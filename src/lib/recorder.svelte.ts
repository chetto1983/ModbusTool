// Recording through the fs plugin (spec L3-L6): rows written as the dashboard's readings arrive,
// into a file a day in the recordings folder.

import { documentDir, homeDir, join } from "@tauri-apps/api/path";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { m } from "../paraglide/messages.js";
import type { PollResult } from "./api";
import { variableLabel } from "./dashboardActions.svelte";
import type { Dashboard } from "./dashboards";
import { dayFileName, headerLine, recordColumns, rowDue, rowLine, type RecordColumn } from "./recording";
import { app, notify, readKey, readLayout, variableStale, variableValue } from "./state.svelte";

export const recorder = $state({
  /** The dashboard being recorded; null while not recording. */
  dashboardId: null as string | null,
  folder: "",
  /** The file rows go to now. */
  file: "",
  rows: 0,
});

// Fixed when the recording starts: a dashboard edited meanwhile keeps its columns until the next.
let session = { name: "", periodMs: 1000, columns: [] as RecordColumn[], header: "" };
let lastRowMs: number | null = null;
let fileOfDay = "";
let writes: Promise<void> = Promise.resolve();

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Documents/ModbusTool/recordings (L4), or ~/ModbusTool/recordings where the system names no
 * Documents folder: on Linux it comes from the XDG user dirs file, which WSL2, containers and CI
 * runners often lack (dirs 7.0.0, `document_dir`).
 */
export async function recordingsFolder(): Promise<string> {
  const base = await documentDir().catch(() => homeDir());
  return join(base, "ModbusTool", "recordings");
}

export async function startRecording(dashboard: Dashboard): Promise<void> {
  try {
    const folder = await recordingsFolder();
    await mkdir(folder, { recursive: true });
    const columns = recordColumns(dashboard, variableLabel);
    session = { name: dashboard.name, periodMs: dashboard.periodMs, columns, header: headerLine(columns) };
    lastRowMs = null;
    fileOfDay = "";
    Object.assign(recorder, { dashboardId: dashboard.id, folder, file: "", rows: 0 });
  } catch (e) {
    notify("error", m.record_failed({ error: message(e) }));
  }
}

export function stopRecording(): void {
  recorder.dashboardId = null;
}

/** Adds a row when a reading of the recorded variables is due one (L3); called on every result. */
export function recordReadings(results: PollResult[]): void {
  if (recorder.dashboardId === null) return;
  if (!app.project.dashboards.some((d) => d.id === recorder.dashboardId)) return stopRecording();
  const blocks = new Set(session.columns.map((c) => readLayout[readKey(c.variable)]?.block));
  const read = results.filter((r) => r.values && blocks.has(r.id));
  if (read.length === 0) return;
  const ms = Math.max(...read.map((r) => r.timestampMs));
  if (!rowDue(lastRowMs, ms, session.periodMs)) return;
  lastRowMs = ms;
  const values = session.columns.map(({ variable }) => (variableStale(variable) ? null : variableValue(variable)));
  const line = rowLine(ms, values);
  writes = writes.then(() => writeRow(ms, line));
}

async function writeRow(ms: number, line: string): Promise<void> {
  if (recorder.dashboardId === null) return;
  try {
    const day = dayFileName(session.name, ms);
    if (day !== fileOfDay) {
      recorder.file = await dayFile(ms);
      fileOfDay = day;
    }
    await writeTextFile(recorder.file, line, { append: true });
    recorder.rows++;
  } catch (e) {
    stopRecording();
    notify("error", m.record_failed({ error: message(e) }));
  }
}

/**
 * The day's file: an existing one with the same columns, else a new one starting with them (L4).
 * Copies are tried one after the other: the first that is missing or matches is the one.
 */
async function dayFile(ms: number, copy = 1): Promise<string> {
  const path = await join(recorder.folder, dayFileName(session.name, ms, copy));
  const existing = await readTextFile(path).catch(() => null);
  if (existing === null) {
    await writeTextFile(path, session.header);
    return path;
  }
  return existing.startsWith(session.header) ? path : dayFile(ms, copy + 1);
}
