// Project file: everything needed to restore a session (connections, polls, slave setup, labels).

import type { MasterConfig, ReadKind, SlaveConfig, Table } from "./api";
import { BYTE_ORDERS, DATA_TYPES, type ByteOrder, type DataType } from "./datatypes";

export const PROJECT_VERSION = 1;

export interface PollConfig {
  id: string;
  name: string;
  unit: number;
  kind: ReadKind;
  address: number;
  quantity: number;
  intervalMs: number;
  dataType: DataType;
  byteOrder: ByteOrder;
}

export type SimulationKind = "increment" | "random" | "sine" | "toggle";

export interface SimulationRule {
  id: string;
  enabled: boolean;
  unit: number;
  table: Table;
  address: number;
  dataType: DataType;
  byteOrder: ByteOrder;
  kind: SimulationKind;
  min: number;
  max: number;
  step: number;
  periodMs: number;
}

export interface Project {
  version: typeof PROJECT_VERSION;
  master: { config: MasterConfig; polls: PollConfig[] };
  slave: { config: SlaveConfig; units: number[]; simulations: SimulationRule[] };
  /** Register labels, keyed by `labelKey`. */
  labels: Record<string, string>;
}

export class ProjectError extends Error {}

export function labelKey(scope: "master" | "slave", unit: number, table: Table, address: number): string {
  return `${scope}:${unit}:${table}:${address}`;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultProject(): Project {
  return {
    version: PROJECT_VERSION,
    master: {
      config: { link: { kind: "tcp", host: "127.0.0.1", port: 502 }, timeoutMs: 1000, retries: 0 },
      polls: [],
    },
    slave: {
      config: { link: { kind: "tcp", host: "0.0.0.0", port: 502 }, delayMs: 0 },
      units: [1],
      simulations: [],
    },
    labels: {},
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function check(condition: boolean, what: string): void {
  if (!condition) throw new ProjectError(`Invalid project: ${what}`);
}

function checkPoll(p: unknown): void {
  check(isObject(p), "poll must be an object");
  const poll = p as Record<string, unknown>;
  check(typeof poll.id === "string" && typeof poll.name === "string", "poll id/name");
  check(isInt(poll.unit, 0, 255) && isInt(poll.address, 0, 0xffff), "poll unit/address");
  check(isInt(poll.quantity, 1, 2000) && isInt(poll.intervalMs, 10, 3_600_000), "poll quantity/interval");
  check(
    DATA_TYPES.some((t) => t.id === poll.dataType) && BYTE_ORDERS.includes(poll.byteOrder as ByteOrder),
    "poll data type",
  );
}

export function parseProject(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProjectError("Invalid project: not JSON");
  }
  check(isObject(raw), "root must be an object");
  const data = raw as Record<string, unknown>;
  check(data.version === PROJECT_VERSION, `unsupported version ${String(data.version)}`);
  check(isObject(data.master) && isObject(data.slave), "missing master/slave sections");
  const master = data.master as Record<string, unknown>;
  const slave = data.slave as Record<string, unknown>;
  check(isObject(master.config) && Array.isArray(master.polls), "master section");
  check(isObject(slave.config) && Array.isArray(slave.units) && Array.isArray(slave.simulations), "slave section");
  (master.polls as unknown[]).forEach(checkPoll);
  check(
    (slave.units as unknown[]).every((u) => isInt(u, 1, 247)),
    "slave units must be 1..247",
  );
  check(data.labels === undefined || isObject(data.labels), "labels");
  return {
    ...defaultProject(),
    ...(data as unknown as Project),
    labels: (data.labels as Record<string, string>) ?? {},
  };
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2) + "\n";
}
