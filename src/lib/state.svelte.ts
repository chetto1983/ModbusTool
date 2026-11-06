// Application state shared by the views (Svelte 5 runes).

import type { PollResult, TrafficEvent } from "./api";
import { defaultProject, type PollConfig, type Project } from "./project";
import { numeric, registerCount } from "./datatypes";
import { readPreference, writePreference } from "./preferences";
import { m } from "../paraglide/messages.js";

export type View = "master" | "slave" | "traffic";
export type Theme = "dark" | "light";

export const TRAFFIC_LIMIT = 5000;
/** Trend history kept per series; also the widest time window offered. */
export const TREND_RETENTION_S = 600;
export const TREND_WINDOWS_S = [10, 30, 60, 300, TREND_RETENTION_S];

export interface PollStats {
  requests: number;
  ok: number;
  errors: number;
  timeouts: number;
  lastMs: number | null;
}

export interface PollRuntime {
  running: boolean;
  values: number[] | null;
  error: string | null;
  updatedMs: number | null;
  stats: PollStats;
}

export interface TrendSeries {
  key: string;
  label: string;
  pollId: string;
  offset: number;
  times: number[];
  values: number[];
}

export const app = $state({
  view: "master" as View,
  theme: (readPreference("theme") === "light" ? "light" : "dark") as Theme,
  project: defaultProject() as Project,
  projectPath: null as string | null,
  notice: null as { kind: "ok" | "error"; text: string } | null,
});

export const master = $state({
  connected: false,
  endpoint: "",
  busy: false,
  error: null as string | null,
  selectedPoll: null as string | null,
  runtime: {} as Record<string, PollRuntime>,
  trend: [] as TrendSeries[],
  trendWindowS: 60,
});

export const slave = $state({
  running: false,
  endpoint: "",
  busy: false,
  error: null as string | null,
});

export const traffic = $state({
  events: [] as TrafficEvent[],
  paused: false,
});

export function setTheme(theme: Theme): void {
  app.theme = theme;
  document.documentElement.dataset.theme = theme;
  writePreference("theme", theme);
}

const onUncaughtError = (event: ErrorEvent) => notify("error", m.unexpected_error({ error: event.message }));

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  notify("error", m.unexpected_error({ error: reason }));
}

/**
 * Shows any uncaught error or rejected promise as an error notice instead of letting it pass
 * silently: in the installed app there is no console to read it from.
 */
export function watchUnexpectedErrors(): () => void {
  window.addEventListener("error", onUncaughtError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onUncaughtError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

export function notify(kind: "ok" | "error", text: string): void {
  app.notice = { kind, text };
  setTimeout(() => {
    if (app.notice?.text === text) app.notice = null;
  }, 4000);
}

export function emptyRuntime(running = false): PollRuntime {
  return {
    running,
    values: null,
    error: null,
    updatedMs: null,
    stats: { requests: 0, ok: 0, errors: 0, timeouts: 0, lastMs: null },
  };
}

export function pushTraffic(events: TrafficEvent[]): void {
  if (traffic.paused) return;
  const merged = traffic.events.concat(events);
  traffic.events = merged.length > TRAFFIC_LIMIT ? merged.slice(merged.length - TRAFFIC_LIMIT) : merged;
}

export function isBitPoll(poll: PollConfig): boolean {
  return poll.kind === "readCoils" || poll.kind === "readDiscreteInputs";
}

function pollById(id: string): PollConfig | undefined {
  return app.project.master.polls.find((p) => p.id === id);
}

export function applyPollResults(results: PollResult[]): void {
  for (const result of results) {
    const runtime = master.runtime[result.id];
    if (!runtime?.running) continue;
    runtime.stats.requests++;
    if (result.values) {
      runtime.stats.ok++;
      runtime.stats.lastMs = result.elapsedMs;
      runtime.values = result.values;
      runtime.error = null;
      runtime.updatedMs = result.timestampMs;
      appendTrend(result.id, result.timestampMs, result.values);
    } else {
      runtime.stats.errors++;
      if (result.timeout) runtime.stats.timeouts++;
      runtime.error = result.error;
    }
  }
}

function appendTrend(pollId: string, timeMs: number, values: number[]): void {
  const poll = pollById(pollId);
  if (!poll) return;
  const bits = isBitPoll(poll);
  const width = bits ? 1 : registerCount(poll.dataType);
  for (const series of master.trend) {
    if (series.pollId !== pollId) continue;
    const registers = values.slice(series.offset, series.offset + width);
    if (registers.length < width) continue;
    const value = bits ? registers[0] : numeric(registers, poll.dataType, poll.byteOrder);
    series.times.push(timeMs / 1000);
    series.values.push(value);
    const expired = series.times.findIndex((t) => t >= timeMs / 1000 - TREND_RETENTION_S);
    if (expired > 0) {
      series.times.splice(0, expired);
      series.values.splice(0, expired);
    }
  }
}

export function toggleTrend(pollId: string, offset: number, label: string): void {
  const key = `${pollId}:${offset}`;
  const index = master.trend.findIndex((s) => s.key === key);
  if (index >= 0) master.trend.splice(index, 1);
  else master.trend.push({ key, label, pollId, offset, times: [], values: [] });
}
