import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pollStart: vi.fn(), pollStop: vi.fn() }));
vi.mock("./api", () => ({ api: { pollStart: mocks.pollStart, pollStop: mocks.pollStop } }));

import { followReads, MAX_BITS, MAX_REGISTERS, panelVariables, readPlan } from "./dashboardReads.svelte";
import { newDashboard, newPanel, newVariable, type Dashboard, type Panel } from "./dashboards";
import { defaultProject } from "./project";
import { app, master, readings, readKey, readLayout } from "./state.svelte";

const panel = (kind: Panel["kind"], change: (p: Panel) => void = () => {}): Panel => {
  const p = newPanel(kind, kind, kind, []);
  change(p);
  return p;
};

const dashboard = (periodMs: number, panels: Panel[]): Dashboard => ({
  ...newDashboard(String(periodMs), "D"),
  periodMs,
  panels,
});

const at = (address: number, over = {}) => newVariable({ address, ...over });

beforeEach(async () => {
  mocks.pollStart.mockResolvedValue(undefined);
  mocks.pollStop.mockResolvedValue(undefined);
  // Stop what the previous test left started.
  master.connected = false;
  await followReads(readPlan());
  mocks.pollStart.mockReset().mockResolvedValue(undefined);
  mocks.pollStop.mockReset().mockResolvedValue(undefined);
  app.project = defaultProject();
  master.connected = true;
  for (const key of Object.keys(readings)) delete readings[key];
});

describe("dashboard reads", () => {
  it("reads what every panel shows, nothing for a button or a command without state", () => {
    const flow = newVariable({ address: 40, dataType: "float32" });
    const kinds = {
      trend: panel("trend", (p) => p.kind === "trend" && (p.variables = [flow, flow])),
      value: panel("value", (p) => p.kind === "value" && (p.variable = flow)),
      button: panel("button"),
      switch: panel("switch"),
      number: panel("number", (p) => p.kind === "number" && (p.state = null)),
    };
    expect(panelVariables(kinds.trend)).toEqual([flow, flow]);
    expect(panelVariables(kinds.value)).toEqual([flow]);
    expect(panelVariables(kinds.button)).toEqual([]);
    expect(panelVariables(kinds.switch)).toHaveLength(1);
    expect(panelVariables(kinds.number)).toEqual([]);
  });

  it("reads each location at the shortest period using it, sized by its type", () => {
    const flow = newVariable({ unit: 3, address: 40, dataType: "float64" });
    const coil = newVariable({ table: "coils", address: 7, dataType: "float64" });
    app.project.dashboards = [
      dashboard(1000, [panel("value", (p) => p.kind === "value" && (p.variable = flow))]),
      dashboard(250, [panel("trend", (p) => p.kind === "trend" && (p.variables = [{ ...flow, name: "Flow" }, coil]))]),
    ];
    const plan = readPlan();
    expect(plan.polls.map((p) => [p.unit, p.operation, p.intervalMs])).toEqual([
      [3, { kind: "readHoldingRegisters", address: 40, quantity: 4 }, 250],
      [1, { kind: "readCoils", address: 7, quantity: 1 }, 250],
    ]);
    expect(plan.layout[readKey(flow)]).toEqual({ block: plan.polls[0].id, offset: 0 });
    master.connected = false;
    expect(readPlan()).toEqual({ polls: [], layout: {} });
  });

  it("reads touching and overlapping variables in one request, never an address no one asks for", () => {
    const vars = [at(10), at(11, { dataType: "float32" }), at(12), at(13), at(20), at(0, { table: "inputRegisters" })];
    app.project.dashboards = [dashboard(200, [panel("bars", (p) => p.kind === "bars" && (p.variables = vars))])];
    const plan = readPlan();
    expect(plan.polls.map((p) => p.operation)).toEqual([
      // 10, 11-12 (float32) and 13 touch or overlap; 14-19 are a gap no variable asks for.
      { kind: "readHoldingRegisters", address: 10, quantity: 4 },
      { kind: "readHoldingRegisters", address: 20, quantity: 1 },
      { kind: "readInputRegisters", address: 0, quantity: 1 },
    ]);
    expect(vars.map((v) => plan.layout[readKey(v)].offset)).toEqual([0, 1, 2, 3, 0, 0]);
  });

  it("splits blocks at what one request reads, and by unit and period", () => {
    const registers = Array.from({ length: 130 }, (_, i) => newVariable({ address: i }));
    const coils = Array.from({ length: 2001 }, (_, i) => newVariable({ table: "coils", address: i }));
    app.project.dashboards = [
      dashboard(200, [panel("bars", (p) => p.kind === "bars" && (p.variables = [...registers, ...coils]))]),
      dashboard(500, [panel("lamp", (p) => p.kind === "lamp" && (p.variable = newVariable({ address: 200 })))]),
      dashboard(200, [
        panel("lamp", (p) => p.kind === "lamp" && (p.variable = newVariable({ unit: 2, address: 130 }))),
      ]),
    ];
    expect(readPlan().polls.map((p) => [p.unit, p.operation.address, p.operation.quantity, p.intervalMs])).toEqual([
      [1, 0, MAX_REGISTERS, 200],
      [1, 125, 5, 200],
      [1, 0, MAX_BITS, 200],
      [1, 2000, 1, 200],
      [1, 200, 1, 500],
      [2, 130, 1, 200],
    ]);
  });

  it("starts new and changed reads, stops gone ones and drops their last reading", async () => {
    // Apart, so each is its own block.
    const a = newVariable({ address: 1 });
    const b = newVariable({ address: 5 });
    app.project.dashboards = [dashboard(500, [panel("bars", (p) => p.kind === "bars" && (p.variables = [a, b]))])];
    await followReads(readPlan());
    expect(mocks.pollStart).toHaveBeenCalledTimes(2);
    expect(Object.keys(readLayout).toSorted()).toEqual([readKey(a), readKey(b)].toSorted());
    await followReads(readPlan());
    expect(mocks.pollStart).toHaveBeenCalledTimes(2);

    app.project.dashboards[0].periodMs = 100;
    const before = readPlan();
    await followReads(before);
    expect(mocks.pollStart).toHaveBeenCalledTimes(4);
    expect(mocks.pollStart.mock.lastCall?.[0].intervalMs).toBe(100);
    readings[before.polls[0].id] = { values: [1], error: null };

    master.connected = false;
    await followReads(readPlan());
    expect(mocks.pollStop.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(before.polls.map((p) => p.id)));
    expect(readings[before.polls[0].id]).toBeUndefined();
    expect(readLayout).toEqual({});

    // Reconnected: the backend dropped its polls on disconnect, so every read starts again.
    master.connected = true;
    await followReads(readPlan());
    expect(mocks.pollStart).toHaveBeenCalledTimes(6);
  });

  it("keeps applying changes after one failed, and tries a failed start again", async () => {
    app.project.dashboards = [dashboard(500, [panel("lamp")])];
    mocks.pollStart.mockRejectedValueOnce("IPC down");
    await expect(followReads(readPlan())).rejects.toBe("IPC down");
    await followReads(readPlan());
    expect(mocks.pollStart).toHaveBeenCalledTimes(2);
    master.connected = false;
    await followReads(readPlan());
    expect(mocks.pollStop).toHaveBeenCalledTimes(1);
  });
});
