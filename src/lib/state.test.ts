import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrafficEvent } from "./api";
import { defaultProject, type PollConfig } from "./project";
import { newDashboard, newPanel, newVariable, type Variable } from "./dashboards";
import {
  app,
  clearMasterTrend,
  forgetPollHistory,
  history,
  pruneHistory,
  readings,
  readKey,
  readLayout,
  READ_PREFIX,
  variableStale,
  variableValue,
  applyPollResults,
  emptyRuntime,
  isBitPoll,
  master,
  notify,
  pushTraffic,
  setTheme,
  toggleTrend,
  traffic,
  TRAFFIC_LIMIT,
  TREND_RETENTION_S,
  watchUnexpectedErrors,
} from "./state.svelte";

const poll = (over: Partial<PollConfig> = {}): PollConfig => ({
  id: "p",
  name: "P",
  unit: 1,
  kind: "readHoldingRegisters",
  address: 0,
  quantity: 4,
  intervalMs: 100,
  dataType: "uint16",
  byteOrder: "ABCD",
  ...over,
});

const event = (n: number): TrafficEvent => ({
  timestampMs: n,
  origin: "master",
  direction: "tx",
  peer: "p",
  bytes: [],
  summary: null,
  message: null,
});

const result = (values: number[] | null, error: string | null = null, timeout = false, timestampMs = 1000) => ({
  id: "p",
  timestampMs,
  values,
  error,
  timeout,
  elapsedMs: 2,
});

/** A variable read on its own: a block of just it, started with no reading yet. */
function alone(variable: Variable): void {
  readings[readKey(variable)] = { values: null, error: null };
  readLayout[readKey(variable)] = { block: readKey(variable), offset: 0 };
}

describe("state", () => {
  beforeEach(() => {
    app.project = defaultProject();
    master.runtime = {};
    master.trend = [];
    for (const key of Object.keys(history)) delete history[key];
    for (const key of Object.keys(readings)) delete readings[key];
    for (const key of Object.keys(readLayout)) delete readLayout[key];
    traffic.events = [];
    traffic.paused = false;
  });

  it("keeps the traffic log bounded and honours pause", () => {
    pushTraffic(Array.from({ length: TRAFFIC_LIMIT + 5 }, (_, i) => event(i)));
    expect(traffic.events).toHaveLength(TRAFFIC_LIMIT);
    expect(traffic.events[0].timestampMs).toBe(5);
    traffic.paused = true;
    pushTraffic([event(-1)]);
    expect(traffic.events.at(-1)?.timestampMs).toBe(TRAFFIC_LIMIT + 4);
  });

  it("counts poll results and ignores stopped polls", () => {
    app.project.master.polls = [poll()];
    applyPollResults([result([1])]);
    expect(master.runtime.p).toBeUndefined();
    master.runtime.p = emptyRuntime(true);
    applyPollResults([result([1, 2, 3, 4]), result(null, "Timeout: no response", true), result(null, "Exception")]);
    expect(master.runtime.p.stats).toEqual({ requests: 3, ok: 1, errors: 2, timeouts: 1, lastMs: 2 });
    expect(master.runtime.p.values).toEqual([1, 2, 3, 4]);
    expect(master.runtime.p.error).toBe("Exception");
  });

  it("appends typed values to trend series and caps their length", () => {
    app.project.master.polls = [poll({ dataType: "int32" })];
    master.runtime.p = emptyRuntime(true);
    toggleTrend("p", 2, "x");
    // One sample a second for longer than the retention: only the last TREND_RETENTION_S remain.
    for (let s = 0; s <= TREND_RETENTION_S + 5; s++)
      applyPollResults([result([0, 0, 0xffff, 0xffff], null, false, s * 1000)]);
    expect(history["p:2"].times[0]).toBe(5);
    expect(history["p:2"].times).toHaveLength(TREND_RETENTION_S + 1);
    expect(history["p:2"].values[0]).toBe(-1);
    toggleTrend("p", 2, "x");
    expect(master.trend).toEqual([]);
    expect(history["p:2"]).toBeUndefined();
  });

  it("trends bit polls as 0/1 and skips incomplete values", () => {
    app.project.master.polls = [poll({ kind: "readCoils", dataType: "float32" })];
    master.runtime.p = emptyRuntime(true);
    toggleTrend("p", 1, "coil");
    toggleTrend("p", 9, "missing");
    applyPollResults([result([0, 1])]);
    expect(history["p:1"].values).toEqual([1]);
    expect(history["p:9"]).toBeUndefined();
    expect(isBitPoll(poll())).toBe(false);
  });

  it("ignores results of deleted polls", () => {
    master.runtime.p = emptyRuntime(true);
    toggleTrend("p", 0, "x");
    applyPollResults([result([1])]);
    expect(history["p:0"]).toBeUndefined();
  });

  it("keeps dashboard readings by variable, decoded with the variable's own type", () => {
    const signed = newVariable({ address: 7, dataType: "int16" });
    const coil = newVariable({ table: "coils", address: 3, dataType: "float32" });
    const wide = newVariable({ address: 9, dataType: "float32" });
    expect(variableValue(signed)).toBeNull();
    expect(variableStale(signed)).toBe(true);
    const read = (variable: typeof signed, values: number[] | null, error: string | null = null) => ({
      ...result(values, error),
      id: readKey(variable),
    });
    // Results of reads not started (or already stopped) are dropped.
    applyPollResults([read(signed, [0xfffe])]);
    expect(variableValue(signed)).toBeNull();
    for (const v of [signed, coil, wide]) alone(v);
    expect(variableStale(signed)).toBe(true);
    applyPollResults([read(signed, [0xfffe]), read(coil, [1]), read(wide, [1])]);
    expect(variableValue(signed)).toBe(-2);
    expect(variableStale(signed)).toBe(false);
    // A coil is a bit whatever type is left on the variable; a short read decodes to nothing.
    expect(variableValue(coil)).toBe(1);
    expect(variableValue(wide)).toBeNull();
    applyPollResults([read(signed, null, "Timeout: no response")]);
    expect(variableValue(signed)).toBeNull();
    expect(variableStale(signed)).toBe(true);
    expect(master.runtime).toEqual({});
  });

  it("shows a variable scaled, and a bit or a hex value as read", () => {
    const scaling = { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, clamp: false };
    const level = newVariable({ address: 1, scaling });
    const coil = newVariable({ table: "coils", address: 1, scaling });
    const code = newVariable({ address: 2, dataType: "hex", scaling });
    for (const v of [level, coil, code]) alone(v);
    applyPollResults([
      { ...result([13824]), id: readKey(level) },
      { ...result([1]), id: readKey(coil) },
      { ...result([0x1f]), id: readKey(code) },
    ]);
    expect(variableValue(level)).toBe(50);
    expect(variableValue(coil)).toBe(1);
    expect(variableValue(code)).toBe(0x1f);
  });

  it("takes each variable's registers from its place in a block read at once", () => {
    const low = newVariable({ address: 10 });
    const wide = newVariable({ address: 11, dataType: "int32" });
    const block = `${READ_PREFIX}1:holdingRegisters:10+3@200`;
    readings[block] = { values: null, error: null };
    readLayout[readKey(low)] = { block, offset: 0 };
    readLayout[readKey(wide)] = { block, offset: 1 };
    applyPollResults([{ ...result([7, 0xffff, 0xfffe]), id: block }]);
    expect(variableValue(low)).toBe(7);
    expect(variableValue(wide)).toBe(-2);
    applyPollResults([{ ...result(null, "Exception 0x02"), id: block }]);
    expect(variableStale(wide)).toBe(true);
  });

  it("keeps history only for variables a trend panel shows, once per location", () => {
    const flow = newVariable({ address: 7 });
    const dashboard = newDashboard("d", "D");
    const panel = newPanel("t", "trend", "T", []);
    if (panel.kind === "trend") panel.variables = [flow, { ...flow, name: "Same register" }];
    dashboard.panels.push(panel);
    app.project.dashboards = [dashboard];
    const lamp = newVariable({ address: 8 });
    for (const v of [flow, lamp]) alone(v);
    applyPollResults([
      { ...result([42]), id: readKey(flow) },
      { ...result([1]), id: readKey(lamp) },
    ]);
    expect(history[readKey(flow)].values).toEqual([42]);
    expect(history[readKey(lamp)]).toBeUndefined();
    app.project.dashboards = [];
    pruneHistory();
    expect(history[readKey(flow)]).toBeUndefined();
  });

  it("clears the master's trend and its history", () => {
    app.project.master.polls = [poll()];
    master.runtime.p = emptyRuntime(true);
    toggleTrend("p", 0, "x");
    applyPollResults([result([3])]);
    expect(history["p:0"].values).toEqual([3]);
    clearMasterTrend();
    expect(master.trend).toEqual([]);
    expect(history["p:0"]).toBeUndefined();
  });

  it("forgets one poll's history", () => {
    history["p:0"] = { times: [1], values: [1] };
    history["q:0"] = { times: [1], values: [2] };
    forgetPollHistory("p");
    expect(Object.keys(history)).toEqual(["q:0"]);
  });

  it("applies and stores the theme", () => {
    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    setTheme("dark");
    expect(app.theme).toBe("dark");
  });

  it("clears a notice after a while", () => {
    vi.useFakeTimers();
    notify("ok", "saved");
    expect(app.notice?.text).toBe("saved");
    vi.advanceTimersByTime(4000);
    expect(app.notice).toBeNull();
    vi.useRealTimers();
  });

  it("shows uncaught errors and rejections as notices until stopped", () => {
    const stop = watchUnexpectedErrors();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    expect(app.notice).toEqual({ kind: "error", text: "Unexpected error: boom" });
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejection, "reason", { value: new Error("lost") });
    window.dispatchEvent(rejection);
    expect(app.notice?.text).toBe("Unexpected error: lost");
    const plain = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(plain, "reason", { value: "nope" });
    window.dispatchEvent(plain);
    expect(app.notice?.text).toBe("Unexpected error: nope");
    stop();
    app.notice = null;
    window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(app.notice).toBeNull();
  });
});
