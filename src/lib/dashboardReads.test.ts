import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pollStart: vi.fn(), pollStop: vi.fn() }));
vi.mock("./api", () => ({ api: { pollStart: mocks.pollStart, pollStop: mocks.pollStop } }));

import { followReads, panelVariables, wantedReads } from "./dashboardReads.svelte";
import { newDashboard, newPanel, newVariable, type Dashboard, type Panel } from "./dashboards";
import { defaultProject } from "./project";
import { app, master, readings, readKey } from "./state.svelte";

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

beforeEach(async () => {
  mocks.pollStart.mockResolvedValue(undefined);
  mocks.pollStop.mockResolvedValue(undefined);
  // Stop what the previous test left started.
  master.connected = false;
  await followReads(wantedReads());
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

  it("asks one backend poll per location, sized by the type, at the shortest period using it", () => {
    const flow = newVariable({ unit: 3, address: 40, dataType: "float64" });
    const coil = newVariable({ table: "coils", address: 7, dataType: "float64" });
    app.project.dashboards = [
      dashboard(1000, [panel("value", (p) => p.kind === "value" && (p.variable = flow))]),
      dashboard(250, [panel("trend", (p) => p.kind === "trend" && (p.variables = [{ ...flow, name: "Flow" }, coil]))]),
    ];
    expect(wantedReads()).toEqual([
      {
        id: readKey(flow),
        unit: 3,
        operation: { kind: "readHoldingRegisters", address: 40, quantity: 4 },
        intervalMs: 250,
      },
      { id: readKey(coil), unit: 1, operation: { kind: "readCoils", address: 7, quantity: 1 }, intervalMs: 250 },
    ]);
    master.connected = false;
    expect(wantedReads()).toEqual([]);
  });

  it("starts new and changed reads, stops gone ones and drops their last reading", async () => {
    const a = newVariable({ address: 1 });
    const b = newVariable({ address: 2 });
    app.project.dashboards = [dashboard(500, [panel("bars", (p) => p.kind === "bars" && (p.variables = [a, b]))])];
    await followReads(wantedReads());
    expect(mocks.pollStart).toHaveBeenCalledTimes(2);
    await followReads(wantedReads());
    expect(mocks.pollStart).toHaveBeenCalledTimes(2);

    app.project.dashboards[0].periodMs = 100;
    readings[readKey(a)] = { values: [1], error: null };
    await followReads(wantedReads());
    expect(mocks.pollStart).toHaveBeenCalledTimes(4);
    expect(mocks.pollStart.mock.lastCall?.[0].intervalMs).toBe(100);

    master.connected = false;
    await followReads(wantedReads());
    expect(mocks.pollStop.mock.calls.map((c) => c[0]).toSorted()).toEqual([readKey(a), readKey(b)].toSorted());
    expect(readings[readKey(a)]).toBeUndefined();

    // Reconnected: the backend dropped its polls on disconnect, so every read starts again.
    master.connected = true;
    await followReads(wantedReads());
    expect(mocks.pollStart).toHaveBeenCalledTimes(6);
  });

  it("keeps applying changes after one failed, and tries a failed start again", async () => {
    app.project.dashboards = [dashboard(500, [panel("lamp")])];
    mocks.pollStart.mockRejectedValueOnce("IPC down");
    await expect(followReads(wantedReads())).rejects.toBe("IPC down");
    await followReads(wantedReads());
    expect(mocks.pollStart).toHaveBeenCalledTimes(2);
    master.connected = false;
    await followReads(wantedReads());
    expect(mocks.pollStop).toHaveBeenCalledTimes(1);
  });
});
