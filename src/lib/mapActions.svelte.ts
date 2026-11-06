// Register maps through the dialog and fs plugins (spec R5, R7): imported as a dashboard with one
// table panel, exported from a table panel in the same format.

import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { m } from "../paraglide/messages.js";
import { dashboardUi } from "./dashboardActions.svelte";
import { GRID_COLUMNS, newDashboard, type Dashboard, type TablePanel, type TableRow } from "./dashboards";
import { newId } from "./project";
import { fileName } from "./projectActions.svelte";
import { parseRegisterMap, registerMapCsv } from "./registerMap";
import { app, notify } from "./state.svelte";

const filters = () => [{ name: m.map_file_type(), extensions: ["csv"] }];

/** Grid rows for a table of `count` rows: a grid cell holds about three table rows. */
const tableHeight = (count: number) => Math.min(12, Math.max(3, 1 + Math.ceil(count / 3)));

/** A dashboard named after the map, with one table panel across the grid. */
export function mapDashboard(name: string, rows: TableRow[]): Dashboard {
  const dashboard = newDashboard(newId(), name);
  const panel: TablePanel = {
    id: newId(),
    kind: "table",
    title: name,
    place: { x: 0, y: 0, w: GRID_COLUMNS, h: tableHeight(rows.length) },
    rows,
  };
  dashboard.panels.push(panel);
  return dashboard;
}

export async function importMap(unit: number): Promise<void> {
  const path = await open({ filters: filters(), multiple: false, directory: false });
  if (!path) return;
  try {
    const rows = parseRegisterMap(await readTextFile(path), unit);
    const dashboard = mapDashboard(fileName(path).replace(/\.csv$/i, ""), rows);
    app.project.dashboards.push(dashboard);
    dashboardUi.selected = dashboard.id;
    notify("ok", m.map_imported({ count: rows.length, file: fileName(path) }));
  } catch (e) {
    notify("error", e instanceof Error ? e.message : String(e));
  }
}

export async function exportMap(panel: TablePanel): Promise<void> {
  const path = await save({ filters: filters(), defaultPath: `${panel.title || "register-map"}.csv` });
  if (!path) return;
  try {
    await writeTextFile(path, registerMapCsv($state.snapshot(panel.rows)));
    notify("ok", m.map_exported({ count: panel.rows.length, file: fileName(path) }));
  } catch (e) {
    notify("error", m.project_save_failed({ error: e instanceof Error ? e.message : String(e) }));
  }
}
