import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrafficEvent } from "./api";
import { defaultProject, type PollConfig } from "./project";
import {
  app,
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
  TREND_POINTS,
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

const result = (values: number[] | null, error: string | null = null, timeout = false) => ({
  id: "p",
  timestampMs: 1000,
  values,
  error,
  timeout,
  elapsedMs: 2,
});

describe("state", () => {
  beforeEach(() => {
    app.project = defaultProject();
    master.runtime = {};
    master.trend = [];
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
    for (let i = 0; i < TREND_POINTS + 3; i++) applyPollResults([result([0, 0, 0xffff, 0xffff])]);
    expect(master.trend[0].values).toHaveLength(TREND_POINTS);
    expect(master.trend[0].values[0]).toBe(-1);
    toggleTrend("p", 2, "x");
    expect(master.trend).toEqual([]);
  });

  it("trends bit polls as 0/1 and skips incomplete values", () => {
    app.project.master.polls = [poll({ kind: "readCoils", dataType: "float32" })];
    master.runtime.p = emptyRuntime(true);
    toggleTrend("p", 1, "coil");
    toggleTrend("p", 9, "missing");
    applyPollResults([result([0, 1])]);
    expect(master.trend[0].values).toEqual([1]);
    expect(master.trend[1].values).toEqual([]);
    expect(isBitPoll(poll())).toBe(false);
  });

  it("ignores results of deleted polls", () => {
    master.runtime.p = emptyRuntime(true);
    toggleTrend("p", 0, "x");
    applyPollResults([result([1])]);
    expect(master.trend[0].values).toEqual([]);
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
});
