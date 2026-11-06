// Application state shared by the views (Svelte 5 runes).

import type { PollResult, TrafficEvent } from "./api";
import { defaultProject, type PollConfig, type Project } from "./project";
import type { Signal } from "./dashboards";
import { numeric, registerCount } from "./datatypes";
import { readPreference, writePreference } from "./preferences";
import { m } from "../paraglide/messages.js";

export type View = "master" | "slave" | "dashboard" | "traffic";
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

/** A signal plotted in the master's trend; its samples are in `history`. */
export interface TrendSeries extends Signal {
  key: string;
  label: string;
}

/** Samples of one signal: times in seconds, oldest first. */
export interface Samples {
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

/** Samples of every watched signal (see watchedSignals), by signalKey, for TREND_RETENTION_S. */
export const history = $state<Record<string, Samples>>({});

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

export const signalKey = (signal: Signal) => `${signal.pollId}:${signal.offset}`;

/** The value of the register at `offset` in a poll's values, decoded with the poll's type. */
function decodeAt(poll: PollConfig, values: number[], offset: number): number | null {
  const bits = isBitPoll(poll);
  const registers = values.slice(offset, offset + (bits ? 1 : registerCount(poll.dataType)));
  if (registers.length < (bits ? 1 : registerCount(poll.dataType))) return null;
  return bits ? registers[0] : numeric(registers, poll.dataType, poll.byteOrder);
}

/** The signal's last read value, or null when its poll has not read it. */
export function signalValue(signal: Signal): number | null {
  const poll = pollById(signal.pollId);
  const values = master.runtime[signal.pollId]?.values;
  return poll && values ? decodeAt(poll, values, signal.offset) : null;
}

/** Signals whose history is kept: the master's trend and every trend panel of every dashboard. */
function watchedSignals(): Signal[] {
  const panels = app.project.dashboards.flatMap((d) => d.panels);
  return [...master.trend, ...panels.flatMap((p) => (p.kind === "trend" ? p.signals : []))];
}

function appendTrend(pollId: string, timeMs: number, values: number[]): void {
  const poll = pollById(pollId);
  if (!poll) return;
  const time = timeMs / 1000;
  const seen = new Set<string>();
  for (const signal of watchedSignals()) {
    const key = signalKey(signal);
    if (signal.pollId !== pollId || seen.has(key)) continue;
    seen.add(key);
    const value = decodeAt(poll, values, signal.offset);
    if (value === null) continue;
    const samples = (history[key] ??= { times: [], values: [] });
    samples.times.push(time);
    samples.values.push(value);
    const expired = samples.times.findIndex((t) => t >= time - TREND_RETENTION_S);
    if (expired > 0) {
      samples.times.splice(0, expired);
      samples.values.splice(0, expired);
    }
  }
}

/** Drops the history of signals nothing watches any more. */
export function pruneHistory(): void {
  const watched = new Set(watchedSignals().map(signalKey));
  for (const key of Object.keys(history)) if (!watched.has(key)) delete history[key];
}

/** Drops a poll's history: after a change of what its values mean, old samples mean something else. */
export function forgetPollHistory(pollId: string): void {
  for (const key of Object.keys(history)) if (key.startsWith(`${pollId}:`)) delete history[key];
}

export function toggleTrend(pollId: string, offset: number, label: string): void {
  const key = signalKey({ pollId, offset });
  const index = master.trend.findIndex((s) => s.key === key);
  if (index >= 0) master.trend.splice(index, 1);
  else master.trend.push({ key, label, pollId, offset });
  pruneHistory();
}

export function clearMasterTrend(): void {
  master.trend = [];
  pruneHistory();
}
