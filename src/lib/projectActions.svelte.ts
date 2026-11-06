// Open/save the project file through the dialog and fs plugins.

import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { m } from "../paraglide/messages.js";
import { api } from "./api";
import { parseProject, serializeProject } from "./project";
import { app, master, notify, slave } from "./state.svelte";

const filters = () => [{ name: m.project_file_type(), extensions: ["json"] }];

export async function openProject(): Promise<void> {
  if (master.connected || slave.running) {
    notify("error", m.project_busy());
    return;
  }
  const path = await open({ filters: filters(), multiple: false, directory: false });
  if (!path) return;
  try {
    app.project = parseProject(await readTextFile(path));
    app.projectPath = path;
    await api.slaveSetUnits(app.project.slave.units);
    master.selectedPoll = app.project.master.polls[0]?.id ?? null;
    master.runtime = {};
    master.trend = [];
    notify("ok", m.project_opened({ file: fileName(path) }));
  } catch (e) {
    notify("error", e instanceof Error ? e.message : String(e));
  }
}

export async function saveProject(saveAs = false): Promise<void> {
  let path = saveAs ? null : app.projectPath;
  path ??= await save({ filters: filters(), defaultPath: "modbus-project.json" });
  if (!path) return;
  try {
    await writeTextFile(path, serializeProject($state.snapshot(app.project)));
    app.projectPath = path;
    notify("ok", m.project_saved({ file: fileName(path) }));
  } catch (e) {
    notify("error", m.project_save_failed({ error: e instanceof Error ? e.message : String(e) }));
  }
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
