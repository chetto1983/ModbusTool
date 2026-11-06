import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open, save: mocks.save }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: mocks.readTextFile, writeTextFile: mocks.writeTextFile }));

import { exportMap, importMap, mapDashboard } from "./mapActions.svelte";
import { dashboardUi } from "./dashboardActions.svelte";
import { GRID_COLUMNS, newTableRow, newVariable, type TablePanel } from "./dashboards";
import { defaultProject } from "./project";
import { parseRegisterMap } from "./registerMap";
import { app } from "./state.svelte";

/** Where a map of `count` rows puts its table. */
const height = (count: number) =>
  mapDashboard(
    "x",
    Array.from({ length: count }, () => newTableRow(newVariable())),
  ).panels[0].place;

const MAP = "name,table,address,type,units\nFrequency,input,1,Float32,Hz\nCurrent,input,3,UInt16,A\n";

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  app.project = defaultProject();
  app.notice = null;
  dashboardUi.selected = null;
});

describe("register map actions", () => {
  it("imports a map as a new dashboard with one table, read by the chosen unit", async () => {
    mocks.open.mockResolvedValue("/maps/drive.csv");
    mocks.readTextFile.mockResolvedValue(MAP);
    await importMap(5);
    const [dashboard] = app.project.dashboards;
    expect(dashboard.name).toBe("drive");
    expect(dashboardUi.selected).toBe(dashboard.id);
    const panel = dashboard.panels[0] as TablePanel;
    expect(panel.kind).toBe("table");
    expect(panel.rows.map((r) => [r.variable.name, r.variable.unit, r.units])).toEqual([
      ["Frequency", 5, "Hz"],
      ["Current", 5, "A"],
    ]);
    expect(app.notice).toEqual({ kind: "ok", text: "Imported 2 registers from drive.csv" });
  });

  it("adds nothing from an invalid map, and says why", async () => {
    mocks.open.mockResolvedValue("/maps/bad.csv");
    mocks.readTextFile.mockResolvedValue("name,table,address,type\nA,holding,x,UInt16\n");
    await importMap(1);
    expect(app.project.dashboards).toEqual([]);
    expect(app.notice?.kind).toBe("error");
    expect(app.notice?.text).toMatch(/line 2/);
  });

  it("does nothing when the file choice is cancelled", async () => {
    mocks.open.mockResolvedValue(null);
    mocks.save.mockResolvedValue(null);
    await importMap(1);
    await exportMap(mapDashboard("x", []).panels[0] as TablePanel);
    expect(app.project.dashboards).toEqual([]);
    expect(mocks.readTextFile).not.toHaveBeenCalled();
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
  });

  it("exports a table as a map that imports back to the same rows", async () => {
    const panel = mapDashboard("drive", parseRegisterMap(MAP, 2)).panels[0] as TablePanel;
    mocks.save.mockResolvedValue("/maps/out.csv");
    mocks.writeTextFile.mockResolvedValue(undefined);
    await exportMap(panel);
    const [path, text] = mocks.writeTextFile.mock.calls[0];
    expect(path).toBe("/maps/out.csv");
    expect(parseRegisterMap(text, 2)).toEqual(panel.rows);
    expect(app.notice).toEqual({ kind: "ok", text: "Exported 2 registers to out.csv" });
  });

  it("reports a failed export", async () => {
    mocks.save.mockResolvedValue("/read-only/out.csv");
    mocks.writeTextFile.mockRejectedValue(new Error("permission denied"));
    await exportMap(mapDashboard("x", [newTableRow()]).panels[0] as TablePanel);
    expect(app.notice).toEqual({ kind: "error", text: "Save failed: permission denied" });
  });

  it("sizes the table to its rows, across the grid, within limits", () => {
    expect(height(1)).toEqual({ x: 0, y: 0, w: GRID_COLUMNS, h: 3 });
    expect(height(30).h).toBe(11);
    expect(height(500).h).toBe(12);
  });
});
