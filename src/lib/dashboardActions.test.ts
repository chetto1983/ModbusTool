import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ masterExecute: vi.fn() }));
vi.mock("./api", () => ({ api: { masterExecute: mocks.masterExecute } }));

import * as d from "./dashboardActions.svelte";
import { defaultProject, type PollConfig } from "./project";
import { app, history } from "./state.svelte";

const poll = (over: Partial<PollConfig> = {}): PollConfig => ({
  id: "p",
  name: "Pumps",
  unit: 1,
  kind: "readHoldingRegisters",
  address: 100,
  quantity: 4,
  intervalMs: 1000,
  dataType: "uint16",
  byteOrder: "ABCD",
  ...over,
});

beforeEach(() => {
  mocks.masterExecute.mockReset().mockResolvedValue({ values: [], elapsedMs: 1 });
  app.project = defaultProject();
  app.notice = null;
  Object.assign(d.dashboardUi, { selected: null, editing: false, fullscreen: null });
  for (const key of Object.keys(history)) delete history[key];
});

describe("dashboards", () => {
  it("adds, selects, renames and removes dashboards", () => {
    expect(d.currentDashboard()).toBeNull();
    d.addDashboard("Plant");
    d.addDashboard("Line 2");
    expect(d.currentDashboard()?.name).toBe("Line 2");
    expect(d.dashboardUi.editing).toBe(true);
    const [first, second] = app.project.dashboards;
    d.dashboardUi.selected = first.id;
    d.renameDashboard(first.id, "Plant A");
    d.renameDashboard("missing", "x");
    expect(d.currentDashboard()?.name).toBe("Plant A");
    d.removeDashboard(first.id);
    expect(d.currentDashboard()?.id).toBe(second.id);
    d.removeDashboard(second.id);
    expect(d.dashboardUi.selected).toBeNull();
  });

  it("adds panels only when saved and keeps the grid's place on edits", () => {
    d.addDashboard("Plant");
    const dashboard = d.currentDashboard()!;
    const draft = d.newPanelDraft(dashboard, "value");
    expect(draft.title).toBe("Value");
    expect(dashboard.panels).toEqual([]);
    d.savePanel(dashboard, draft);
    d.placePanels(dashboard, [
      { id: draft.id, place: { x: 3, y: 1, w: 4, h: 3 } },
      { id: "gone", place: { x: 0, y: 0, w: 1, h: 1 } },
    ]);
    d.savePanel(dashboard, { ...draft, title: "Flow", place: { x: 0, y: 0, w: 1, h: 1 } });
    expect(dashboard.panels).toEqual([{ ...draft, title: "Flow", place: { x: 3, y: 1, w: 4, h: 3 } }]);
    const next = d.newPanelDraft(dashboard, "lamp");
    // The value panel moved to x 3: the top left corner is free again.
    expect(next.place).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it("removing a panel closes its full screen and drops history nothing watches", () => {
    app.project.master.polls = [poll()];
    d.addDashboard("Plant");
    const dashboard = d.currentDashboard()!;
    const trend = d.newPanelDraft(dashboard, "trend");
    if (trend.kind === "trend") trend.signals.push({ pollId: "p", offset: 0 });
    d.savePanel(dashboard, trend);
    history["p:0"] = { times: [1], values: [2] };
    d.dashboardUi.fullscreen = trend.id;
    d.removePanel(dashboard, trend.id);
    expect(d.dashboardUi.fullscreen).toBeNull();
    expect(history["p:0"]).toBeUndefined();
  });
});

describe("signals for pickers and labels", () => {
  it("lists one option per value, by the poll's type width, with register labels", () => {
    app.project.master.polls = [
      poll({ dataType: "float32" }),
      poll({ id: "c", name: "Valves", kind: "readCoils", quantity: 2 }),
    ];
    app.project.labels["master:1:holdingRegisters:102"] = "Flow";
    expect(d.signalOptions().map((o) => o.label)).toEqual([
      "Pumps · FC03 100",
      "Pumps · FC03 102 · Flow",
      "Valves · FC01 100",
      "Valves · FC01 101",
    ]);
    expect(d.signalLabel({ pollId: "p", offset: 2 })).toBe("Flow");
    expect(d.signalLabel({ pollId: "p", offset: 0 })).toBe("Pumps · 100");
    expect(d.signalLabel({ pollId: "nope", offset: 0 })).toBe("Deleted poll");
  });
});

const target = (over = {}) => ({
  unit: 3,
  table: "holdingRegisters" as const,
  address: 40,
  dataType: "uint16" as const,
  byteOrder: "ABCD" as const,
  ...over,
});

describe("writes", () => {
  it("encodes the value with the target's type and writes through the master", async () => {
    expect(await d.writeTarget(target(), "7")).toBe(true);
    await d.writeTarget(target({ dataType: "float32", byteOrder: "CDAB" }), "123.456");
    await d.writeTarget(target({ table: "coils" }), "1");
    expect(mocks.masterExecute.mock.calls).toEqual([
      [3, { kind: "writeSingleRegister", address: 40, value: 7 }],
      [3, { kind: "writeMultipleRegisters", address: 40, values: [0xe979, 0x42f6] }],
      [3, { kind: "writeSingleCoil", address: 40, value: true }],
    ]);
  });

  it("reports a value that does not encode and a failed write, without throwing", async () => {
    expect(await d.writeTarget(target(), "abc")).toBe(false);
    expect(app.notice?.text).toBe('Write failed: "abc" is not an integer');
    expect(mocks.masterExecute).not.toHaveBeenCalled();
    mocks.masterExecute.mockRejectedValueOnce("Exception 0x02: Illegal data address");
    expect(await d.writeTarget(target(), "1")).toBe(false);
    expect(app.notice?.text).toBe("Write failed: Exception 0x02: Illegal data address");
    expect(() => d.targetRegisters(target({ table: "coils" }), "maybe")).toThrow();
  });

  it("keeps a setpoint inside the panel's range, bounds included", () => {
    d.addDashboard("Plant");
    const panel = d.newPanelDraft(d.currentDashboard()!, "number");
    if (panel.kind !== "number") throw new Error(panel.kind);
    expect(d.setpointRegisters(panel, "65535")).toEqual([65535]);
    Object.assign(panel, { min: 10, max: 20 });
    expect(d.setpointRegisters(panel, "10")).toEqual([10]);
    expect(d.setpointRegisters(panel, "20")).toEqual([20]);
    expect(() => d.setpointRegisters(panel, "9")).toThrow("Below the minimum 10");
    expect(() => d.setpointRegisters(panel, "21")).toThrow("Above the maximum 20");
    expect(() => d.setpointRegisters(panel, "15.5")).toThrow(/integer/);
  });
});
