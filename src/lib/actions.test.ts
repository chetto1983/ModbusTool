import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: {
    masterConnect: vi.fn(),
    masterDisconnect: vi.fn(),
    masterExecute: vi.fn(),
    pollStart: vi.fn(),
    pollStop: vi.fn(),
    slaveStart: vi.fn(),
    slaveStop: vi.fn(),
    slaveSetUnits: vi.fn(),
    slaveRead: vi.fn(),
    slaveWrite: vi.fn(),
  },
  open: vi.fn(),
  save: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));
vi.mock("./api", () => ({ api: mocks.api }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open, save: mocks.save }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: mocks.readTextFile, writeTextFile: mocks.writeTextFile }));

import * as m from "./masterActions.svelte";
import * as s from "./slaveActions.svelte";
import { fileName, openProject, saveProject } from "./projectActions.svelte";
import { defaultProject, serializeProject } from "./project";
import { app, history, master, slave } from "./state.svelte";

async function addPoll() {
  const poll = m.newPoll();
  await m.savePoll(poll);
  return app.project.master.polls.find((p) => p.id === poll.id)!;
}

const series = (pollId: string) => ({ key: `${pollId}:0`, label: "x", pollId, offset: 0 });

beforeEach(() => {
  for (const fn of Object.values(mocks.api)) fn.mockReset().mockResolvedValue(undefined);
  for (const fn of [mocks.open, mocks.save, mocks.readTextFile, mocks.writeTextFile]) fn.mockReset();
  app.project = defaultProject();
  app.projectPath = null;
  app.notice = null;
  Object.assign(master, { connected: false, busy: false, error: null, selectedPoll: null, runtime: {}, trend: [] });
  Object.assign(slave, { running: false, busy: false, error: null, endpoint: "" });
});

describe("master actions", () => {
  it("connects and reports failures", async () => {
    mocks.api.masterConnect.mockResolvedValueOnce("TCP 127.0.0.1:502");
    await m.connect();
    expect(master.connected).toBe(true);
    expect(master.endpoint).toBe("TCP 127.0.0.1:502");
    mocks.api.masterConnect.mockRejectedValueOnce("refused");
    master.connected = false;
    await m.connect();
    expect(master.error).toBe("refused");
    expect(master.busy).toBe(false);
  });

  it("disconnect stops every poll runtime", async () => {
    const poll = await addPoll();
    await m.startPoll(poll);
    await m.disconnect();
    expect(master.runtime[poll.id].running).toBe(false);
    expect(master.connected).toBe(false);
  });

  it("a new poll joins the project only when saved", async () => {
    const draft = m.newPoll();
    expect(app.project.master.polls).toEqual([]);
    await m.savePoll(draft);
    expect(app.project.master.polls.map((p) => p.id)).toEqual([draft.id]);
    expect(master.selectedPoll).toBe(draft.id);
  });

  it("starts, applies edits and removes polls", async () => {
    const poll = await addPoll();
    await m.startPoll(poll);
    expect(mocks.api.pollStart).toHaveBeenCalledWith({
      id: poll.id,
      unit: 1,
      operation: { kind: "readHoldingRegisters", address: 0, quantity: 10 },
      intervalMs: 1000,
    });
    master.trend.push(series(poll.id));

    // A rename neither restarts the poll nor drops its trend.
    await m.savePoll({ ...poll, name: "Pump" });
    expect(mocks.api.pollStart).toHaveBeenCalledTimes(1);
    expect(master.trend).toHaveLength(1);

    // The type changes what the values mean, not what is read: old samples go too.
    history[`${poll.id}:0`] = { times: [1], values: [1] };
    await m.savePoll({ ...app.project.master.polls[0], dataType: "float32" });
    expect(mocks.api.pollStart).toHaveBeenCalledTimes(1);
    expect(master.trend).toEqual([]);
    expect(history[`${poll.id}:0`]).toBeUndefined();

    // A new range restarts once with the new settings; the trend is kept.
    master.trend.push(series(poll.id));
    await m.savePoll({ ...app.project.master.polls[0], quantity: 2 });
    expect(mocks.api.pollStart).toHaveBeenCalledTimes(2);
    expect(mocks.api.pollStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: { kind: "readHoldingRegisters", address: 0, quantity: 2 } }),
    );
    expect(master.trend).toHaveLength(1);
    expect(app.project.master.polls[0]).toMatchObject({ name: "Pump", dataType: "float32", quantity: 2 });

    // A stopped poll is not started by an edit.
    await m.stopPoll(poll.id);
    await m.savePoll({ ...app.project.master.polls[0], address: 9 });
    expect(mocks.api.pollStart).toHaveBeenCalledTimes(2);

    await m.removePoll(poll.id);
    expect(app.project.master.polls).toEqual([]);
    expect(master.selectedPoll).toBeNull();
  });

  it("reads once and counts errors and timeouts", async () => {
    const poll = await addPoll();
    mocks.api.masterExecute.mockResolvedValueOnce({ values: [5], elapsedMs: 3 });
    await m.readOnce(poll);
    expect(master.runtime[poll.id].values).toEqual([5]);
    mocks.api.masterExecute.mockRejectedValueOnce("Timeout: no response");
    await m.readOnce(poll);
    mocks.api.masterExecute.mockRejectedValueOnce(new Error("Exception 0x02"));
    await m.readOnce(poll);
    expect(master.runtime[poll.id].stats).toEqual({ requests: 3, ok: 1, errors: 2, timeouts: 1, lastMs: 3 });
    expect(master.runtime[poll.id].error).toBe("Exception 0x02");
  });

  it("maps grid writes to FC05, FC06 and FC16", async () => {
    const poll = await addPoll();
    mocks.api.masterExecute.mockResolvedValue({ values: [], elapsedMs: 1 });
    await m.writeValues(poll, 7, [1]);
    await m.writeValues(poll, 7, [1, 2]);
    poll.kind = "readCoils";
    await m.writeValues(poll, 3, [0]);
    const operations = mocks.api.masterExecute.mock.calls.map((c) => c[1]).filter((o) => !o.kind.startsWith("read"));
    expect(operations).toEqual([
      { kind: "writeSingleRegister", address: 7, value: 1 },
      { kind: "writeMultipleRegisters", address: 7, values: [1, 2] },
      { kind: "writeSingleCoil", address: 3, value: false },
    ]);
  });

  it("notifies when a write fails", async () => {
    const poll = await addPoll();
    mocks.api.masterExecute.mockRejectedValueOnce("Exception 0x02: Illegal data address");
    await expect(m.writeValues(poll, 1, [1])).rejects.toBe("Exception 0x02: Illegal data address");
    expect(app.notice?.text).toBe("Write failed: Exception 0x02: Illegal data address");
  });

  it("stores labels per unit and table", async () => {
    const poll = await addPoll();
    m.setLabel(poll, 4, "  Pump  ");
    expect(m.labelFor(poll, 4)).toBe("Pump");
    expect(app.project.labels["master:1:holdingRegisters:4"]).toBe("Pump");
    m.setLabel(poll, 4, "");
    expect(m.labelFor(poll, 4)).toBe("");
    expect(m.isWritable("readInputRegisters")).toBe(false);
    expect(m.tableOf("readDiscreteInputs")).toBe("discreteInputs");
  });
});

describe("slave actions", () => {
  it("starts with the configured units and reports failures", async () => {
    mocks.api.slaveStart.mockResolvedValueOnce("TCP 0.0.0.0:502");
    await s.startSlave();
    expect(mocks.api.slaveSetUnits).toHaveBeenCalledWith([1]);
    expect(slave.running).toBe(true);
    await s.stopSlave();
    expect(slave.running).toBe(false);
    mocks.api.slaveStart.mockRejectedValueOnce("Address in use");
    await s.startSlave();
    expect(slave.error).toBe("Address in use");
  });

  it("applies units and labels", async () => {
    await s.applyUnits([2, 3]);
    expect(app.project.slave.units).toEqual([2, 3]);
    s.setSlaveLabel(2, "coils", 1, "Valve");
    expect(s.slaveLabel(2, "coils", 1)).toBe("Valve");
    s.setSlaveLabel(2, "coils", 1, " ");
    expect(s.slaveLabel(2, "coils", 1)).toBe("");
  });

  it("imports CSV in runs of consecutive addresses with labels", async () => {
    mocks.open.mockResolvedValueOnce("/tmp/in.csv");
    mocks.readTextFile.mockResolvedValueOnce("address,value,label\n10,1,a\n11,2,\n20,3,c\n");
    expect(await s.importCsv(1, "holdingRegisters")).toBe(10);
    expect(mocks.api.slaveWrite.mock.calls).toEqual([
      [1, "holdingRegisters", 10, [1, 2]],
      [1, "holdingRegisters", 20, [3]],
    ]);
    expect(s.slaveLabel(1, "holdingRegisters", 20)).toBe("c");
    mocks.open.mockResolvedValueOnce(null);
    expect(await s.importCsv(1, "holdingRegisters")).toBeNull();
    mocks.open.mockResolvedValueOnce("/tmp/bad.csv");
    mocks.readTextFile.mockResolvedValueOnce("1:99999");
    expect(await s.importCsv(1, "holdingRegisters")).toBeNull();
    expect(app.notice?.kind).toBe("error");
  });

  it("exports the visible range with labels", async () => {
    mocks.save.mockResolvedValueOnce("/tmp/out.csv");
    mocks.api.slaveRead.mockResolvedValueOnce([7, 8]);
    s.setSlaveLabel(1, "inputRegisters", 6, "t");
    await s.exportCsv(1, "inputRegisters", 5, 2);
    expect(mocks.writeTextFile).toHaveBeenCalledWith("/tmp/out.csv", "address,value,label\n5,7,\n6,8,t\n");
    mocks.save.mockResolvedValueOnce("/tmp/out.csv");
    mocks.api.slaveRead.mockRejectedValueOnce("unit 1 is not configured");
    await s.exportCsv(1, "inputRegisters", 5, 2);
    expect(app.notice?.text).toBe("Export failed: unit 1 is not configured");
  });

  it("a generator joins the project only when saved, and is replaced by its edited copy", () => {
    const rule = s.newRule(1, "holdingRegisters", 4);
    expect(app.project.slave.simulations).toEqual([]);
    s.saveRule(rule);
    s.saveRule({ ...rule, kind: "random", max: 50 });
    expect(app.project.slave.simulations).toEqual([{ ...rule, kind: "random", max: 50 }]);
    s.simulationErrors[rule.id] = "old error";
    s.removeRule(rule.id);
    expect(app.project.slave.simulations).toEqual([]);
    expect(s.simulationErrors[rule.id]).toBeUndefined();
  });

  it("simulation loop writes once per period and records errors", async () => {
    vi.useFakeTimers();
    const rule = { ...s.newRule(1, "holdingRegisters", 4), enabled: true, periodMs: 100 };
    const broken = { ...s.newRule(1, "holdingRegisters", 5), enabled: true, min: -5, max: -1, kind: "toggle" as const };
    const coil = s.newRule(1, "coils", 0);
    expect(coil).toMatchObject({ kind: "toggle", max: 1, enabled: false });
    app.project.slave.simulations = [rule, broken, coil];
    const stop = s.startSimulationLoop();
    await vi.advanceTimersByTimeAsync(260);
    stop();
    vi.useRealTimers();
    const writes = mocks.api.slaveWrite.mock.calls.filter((c) => c[2] === 4);
    expect(writes.length).toBeGreaterThanOrEqual(2);
    expect(writes.length).toBeLessThanOrEqual(4);
    expect(s.simulationErrors[broken.id]).toMatch(/outside/);
    expect(mocks.api.slaveWrite.mock.calls.some((c) => c[1] === "coils")).toBe(false);
  });
});

describe("project actions", () => {
  it("opens a project and refuses while connected", async () => {
    const saved = defaultProject();
    saved.slave.units = [4];
    mocks.open.mockResolvedValueOnce("/home/u/plant.json");
    mocks.readTextFile.mockResolvedValueOnce(serializeProject(saved));
    await openProject();
    expect(app.project.slave.units).toEqual([4]);
    expect(mocks.api.slaveSetUnits).toHaveBeenCalledWith([4]);
    expect(app.notice?.text).toBe("Opened plant.json");

    master.connected = true;
    await openProject();
    expect(app.notice?.kind).toBe("error");
    master.connected = false;

    mocks.open.mockResolvedValueOnce("/x.json");
    mocks.readTextFile.mockResolvedValueOnce("{}");
    await openProject();
    expect(app.notice?.text).toMatch(/Invalid project/);
  });

  it("saves to the known path or asks for one", async () => {
    mocks.save.mockResolvedValueOnce("C:\\plants\\a.json");
    await saveProject();
    expect(app.projectPath).toBe("C:\\plants\\a.json");
    await saveProject();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.writeTextFile).toHaveBeenCalledTimes(2);
    mocks.save.mockResolvedValueOnce(null);
    await saveProject(true);
    expect(mocks.writeTextFile).toHaveBeenCalledTimes(2);
    mocks.writeTextFile.mockRejectedValueOnce(new Error("read-only"));
    await saveProject();
    expect(app.notice?.text).toBe("Save failed: read-only");
    expect(fileName("C:\\plants\\a.json")).toBe("a.json");
  });
});
