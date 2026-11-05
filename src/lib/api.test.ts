import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, listen } = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { api, onPollResults, onTraffic } from "./api";

describe("api bridge", () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue(undefined);
    listen.mockReset().mockResolvedValue(() => {});
  });

  it("calls the Rust commands registered in lib.rs with their argument names", async () => {
    const link = { kind: "tcp", host: "h", port: 1 } as const;
    const operation = { kind: "readCoils", address: 1, quantity: 2 } as const;
    await api.serialPorts();
    await api.masterConnect({ link, timeoutMs: 1, retries: 0 });
    await api.masterDisconnect();
    await api.masterExecute(3, operation);
    await api.pollStart({ id: "p", unit: 1, operation, intervalMs: 10 });
    await api.pollStop("p");
    await api.slaveStart({ link, delayMs: 0 });
    await api.slaveStop();
    await api.slaveSetUnits([1]);
    await api.slaveRead(1, "coils", 2, 3);
    await api.slaveWrite(1, "coils", 2, [1]);
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      "serial_ports",
      "master_connect",
      "master_disconnect",
      "master_execute",
      "poll_start",
      "poll_stop",
      "slave_start",
      "slave_stop",
      "slave_set_units",
      "slave_read",
      "slave_write",
    ]);
    expect(invoke.mock.calls[3][1]).toEqual({ unit: 3, operation });
    expect(invoke.mock.calls[9][1]).toEqual({ unit: 1, table: "coils", address: 2, count: 3 });
  });

  it("unwraps event payloads", async () => {
    const traffic = vi.fn();
    const results = vi.fn();
    await onTraffic(traffic);
    await onPollResults(results);
    expect(listen.mock.calls.map((c) => c[0])).toEqual(["traffic", "poll-result"]);
    listen.mock.calls[0][1]({ payload: [1] });
    listen.mock.calls[1][1]({ payload: [2] });
    expect(traffic).toHaveBeenCalledWith([1]);
    expect(results).toHaveBeenCalledWith([2]);
  });
});
