import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documentDir: vi.fn(),
  homeDir: vi.fn(),
  mkdir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));
vi.mock("@tauri-apps/api/path", () => ({
  documentDir: mocks.documentDir,
  homeDir: mocks.homeDir,
  join: async (...parts: string[]) => parts.join("/"),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: mocks.mkdir,
  readTextFile: mocks.readTextFile,
  writeTextFile: mocks.writeTextFile,
}));

import { recorder, recordReadings, startRecording, stopRecording } from "./recorder.svelte";
import { newDashboard, newPanel, newVariable, type Dashboard } from "./dashboards";
import { defaultProject } from "./project";
import { app, readings, readKey, readLayout } from "./state.svelte";

const pressure = newVariable({ name: "Pressure", address: 2 });
const BLOCK = "dash:block";
// 10:00:00 local on 2026-05-04, and the next day just after midnight.
const MORNING = new Date(2026, 4, 4, 10, 0, 0, 0).getTime();
const NEXT_DAY = new Date(2026, 4, 5, 0, 0, 1, 0).getTime();
const FOLDER = "/home/ada/Documents/ModbusTool/recordings";

/** In-memory files, as plugin-fs would leave them. */
let files: Record<string, string>;

function plant(): Dashboard {
  const dashboard = newDashboard("d", "Plant");
  const panel = newPanel("p", "value", "Pressure", []);
  if (panel.kind !== "value") throw new Error("value");
  panel.variable = pressure;
  panel.unit = "bar";
  dashboard.panels.push(panel);
  app.project.dashboards = [dashboard];
  return dashboard;
}

/** The reference answered: pressure register holds `raw`. */
function read(raw: number, ms: number) {
  readings[BLOCK] = { values: [raw], error: null };
  recordReadings([{ id: BLOCK, timestampMs: ms, values: [raw], error: null, timeout: false, elapsedMs: 3 }]);
}

beforeEach(() => {
  stopRecording();
  files = {};
  mocks.documentDir.mockReset().mockResolvedValue("/home/ada/Documents");
  mocks.homeDir.mockReset().mockResolvedValue("/home/ada");
  mocks.mkdir.mockReset().mockResolvedValue(undefined);
  mocks.readTextFile.mockReset().mockImplementation(async (path: string) => {
    if (!(path in files)) throw new Error("not found");
    return files[path];
  });
  mocks.writeTextFile
    .mockReset()
    .mockImplementation(async (path: string, text: string, options?: { append?: boolean }) => {
      files[path] = options?.append ? (files[path] ?? "") + text : text;
    });
  app.project = defaultProject();
  app.notice = null;
  for (const key of Object.keys(readings)) delete readings[key];
  for (const key of Object.keys(readLayout)) delete readLayout[key];
  readLayout[readKey(pressure)] = { block: BLOCK, offset: 0 };
});

describe("recording", () => {
  it("writes a header, then a row per period with the values read, in the day's file", async () => {
    await startRecording(plant());
    expect(mocks.mkdir).toHaveBeenCalledWith(FOLDER, { recursive: true });
    read(4, MORNING);
    read(5, MORNING + 300); // the same period: no row
    read(6, MORNING + 1000);
    await vi.waitFor(() => expect(recorder.rows).toBe(2));
    expect(recorder.file).toBe(`${FOLDER}/Plant_2026-05-04.csv`);
    expect(files[recorder.file]).toBe("time,Pressure [bar]\n2026-05-04 10:00:00.000,4\n2026-05-04 10:00:01.000,6\n");
  });

  it("starts a new file at midnight", async () => {
    await startRecording(plant());
    read(4, MORNING);
    read(7, NEXT_DAY);
    await vi.waitFor(() => expect(recorder.rows).toBe(2));
    expect(files[`${FOLDER}/Plant_2026-05-05.csv`]).toBe("time,Pressure [bar]\n2026-05-05 00:00:01.000,7\n");
  });

  it("goes on in the day's file when it has the same columns, and opens a copy when not", async () => {
    files[`${FOLDER}/Plant_2026-05-04.csv`] = "time,Pressure [bar]\n2026-05-04 09:00:00.000,1\n";
    await startRecording(plant());
    read(4, MORNING);
    await vi.waitFor(() => expect(recorder.rows).toBe(1));
    expect(files[`${FOLDER}/Plant_2026-05-04.csv`]).toMatch(/09:00:00.000,1\n2026-05-04 10:00:00.000,4\n$/);
    stopRecording();
    // The same day, the same dashboard name, other columns: a copy.
    files[`${FOLDER}/Plant_2026-05-04.csv`] = "time,Other\n";
    await startRecording(plant());
    read(5, MORNING + 2000);
    await vi.waitFor(() => expect(recorder.file).toBe(`${FOLDER}/Plant_2026-05-04_2.csv`));
    expect(files[`${FOLDER}/Plant_2026-05-04.csv`]).toBe("time,Other\n");
  });

  it("leaves a cell empty while its value is not read", async () => {
    await startRecording(plant());
    readings[BLOCK] = { values: null, error: "timeout" };
    recordReadings([
      { id: BLOCK, timestampMs: MORNING, values: null, error: "timeout", timeout: true, elapsedMs: 1000 },
    ]);
    // A failed read makes no row; a later good one does.
    read(8, MORNING + 1000);
    await vi.waitFor(() => expect(recorder.rows).toBe(1));
    expect(files[recorder.file]).toMatch(/,8\n$/);
  });

  it("ignores readings of other dashboards and does nothing until started", async () => {
    read(4, MORNING);
    await startRecording(plant());
    recordReadings([
      { id: "dash:other", timestampMs: MORNING, values: [1], error: null, timeout: false, elapsedMs: 1 },
    ]);
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
  });

  it("records under the home folder where the system names no Documents folder", async () => {
    mocks.documentDir.mockRejectedValue(new Error("unknown path"));
    await startRecording(plant());
    expect(recorder.folder).toBe("/home/ada/ModbusTool/recordings");
  });

  it("does not start, and says why, when the folder cannot be created", async () => {
    mocks.mkdir.mockRejectedValue(new Error("read-only file system"));
    await startRecording(plant());
    expect(recorder.dashboardId).toBeNull();
    expect(app.notice).toEqual({ kind: "error", text: "Recording stopped: read-only file system" });
  });

  it("stops when the dashboard is deleted or a write fails", async () => {
    await startRecording(plant());
    app.project.dashboards = [];
    read(4, MORNING);
    expect(recorder.dashboardId).toBeNull();

    await startRecording(plant());
    mocks.writeTextFile.mockRejectedValue(new Error("disk full"));
    read(4, MORNING);
    await vi.waitFor(() => expect(recorder.dashboardId).toBeNull());
    expect(app.notice).toEqual({ kind: "error", text: "Recording stopped: disk full" });
  });
});
