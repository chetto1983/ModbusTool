// Typed bridge to the Rust commands (src-tauri/src/commands.rs). Shapes mirror the serde types.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Parity = "none" | "even" | "odd";

export interface SerialConfig {
  port: string;
  baudRate: number;
  dataBits: 7 | 8;
  parity: Parity;
  stopBits: 1 | 2;
}

export type NetworkKind = "tcp" | "udp" | "rtuOverTcp";
export type SerialKind = "rtu" | "ascii";
export type LinkConfig = { kind: NetworkKind; host: string; port: number } | { kind: SerialKind; serial: SerialConfig };

export interface MasterConfig {
  link: LinkConfig;
  timeoutMs: number;
  retries: number;
}

export type ReadKind = "readCoils" | "readDiscreteInputs" | "readHoldingRegisters" | "readInputRegisters";
export type ReadOperation = { kind: ReadKind; address: number; quantity: number };
export type Operation =
  | ReadOperation
  | { kind: "writeSingleCoil"; address: number; value: boolean }
  | { kind: "writeSingleRegister"; address: number; value: number }
  | { kind: "writeMultipleCoils"; address: number; values: boolean[] }
  | { kind: "writeMultipleRegisters"; address: number; values: number[] };

export interface Outcome {
  values: number[];
  elapsedMs: number;
}

export interface PollDefinition {
  id: string;
  unit: number;
  operation: ReadOperation;
  intervalMs: number;
}

export interface PollResult {
  id: string;
  timestampMs: number;
  values: number[] | null;
  error: string | null;
  timeout: boolean;
  elapsedMs: number;
}

export type Table = "coils" | "discreteInputs" | "holdingRegisters" | "inputRegisters";

export interface SlaveConfig {
  link: LinkConfig;
  delayMs: number;
}

export interface FrameSummary {
  unit: number | null;
  function: number | null;
  exception: number | null;
  text: string;
}

export interface TrafficEvent {
  timestampMs: number;
  origin: "master" | "slave";
  direction: "tx" | "rx" | "info";
  peer: string;
  bytes: number[];
  summary: FrameSummary | null;
  message: string | null;
}

export const api = {
  serialPorts: () => invoke<string[]>("serial_ports"),
  masterConnect: (config: MasterConfig) => invoke<string>("master_connect", { config }),
  masterDisconnect: () => invoke<void>("master_disconnect"),
  masterExecute: (unit: number, operation: Operation) => invoke<Outcome>("master_execute", { unit, operation }),
  pollStart: (definition: PollDefinition) => invoke<void>("poll_start", { definition }),
  pollStop: (id: string) => invoke<void>("poll_stop", { id }),
  slaveStart: (config: SlaveConfig) => invoke<string>("slave_start", { config }),
  slaveStop: () => invoke<void>("slave_stop"),
  slaveSetUnits: (units: number[]) => invoke<void>("slave_set_units", { units }),
  slaveRead: (unit: number, table: Table, address: number, count: number) =>
    invoke<number[]>("slave_read", { unit, table, address, count }),
  slaveWrite: (unit: number, table: Table, address: number, values: number[]) =>
    invoke<void>("slave_write", { unit, table, address, values }),
};

export const onTraffic = (cb: (events: TrafficEvent[]) => void): Promise<UnlistenFn> =>
  listen<TrafficEvent[]>("traffic", (e) => cb(e.payload));

export const onPollResults = (cb: (results: PollResult[]) => void): Promise<UnlistenFn> =>
  listen<PollResult[]>("poll-result", (e) => cb(e.payload));
