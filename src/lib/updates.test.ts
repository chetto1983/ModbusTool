import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  relaunch: vi.fn(),
  getVersion: vi.fn(),
  disconnect: vi.fn(),
  stopSlave: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("./masterActions.svelte", () => ({ disconnect: mocks.disconnect }));
vi.mock("./slaveActions.svelte", () => ({ stopSlave: mocks.stopSlave }));

import {
  CHECK_EVERY_MS,
  checkForUpdates,
  installUpdate,
  offered,
  postpone,
  setUpdateMode,
  startUpdateChecks,
  updates,
} from "./updates.svelte";
import { app, master, slave } from "./state.svelte";

type Events = (event: { event: string; data?: Record<string, number> }) => void;

// A class, as the plugin's Update is: $state keeps class instances as they are (no proxy).
class FakeUpdate {
  currentVersion = "3.0.0";
  body = "Notes";
  close = vi.fn();
  downloadAndInstall = vi.fn(async (onEvent: Events) => this.events.forEach(onEvent));
  constructor(
    public version = "3.1.0",
    private events: Parameters<Events>[0][] = [],
  ) {}
}

const fakeUpdate = (version?: string, events?: Parameters<Events>[0][]) => new FakeUpdate(version, events);

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getVersion.mockResolvedValue("3.0.0");
  Object.assign(updates, {
    mode: null,
    currentVersion: "3.0.0",
    available: null,
    postponed: null,
    checking: false,
    installing: false,
    progress: null,
  });
  Object.assign(master, { connected: false });
  Object.assign(slave, { running: false });
  app.notice = null;
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("update checks", () => {
  it("offers a found update until it is put off for the session", async () => {
    const update = fakeUpdate();
    mocks.check.mockResolvedValue(update);
    await checkForUpdates();
    expect(offered()).toBe(update);
    postpone();
    expect(offered()).toBeNull();
    await checkForUpdates();
    expect(offered()).toBeNull();
    await checkForUpdates(true);
    expect(offered()).toBe(update);
  });

  it("releases a superseded update", async () => {
    const old = fakeUpdate("3.1.0");
    mocks.check.mockResolvedValueOnce(old).mockResolvedValueOnce(fakeUpdate("3.2.0"));
    await checkForUpdates();
    await checkForUpdates();
    expect(old.close).toHaveBeenCalled();
    expect(offered()?.version).toBe("3.2.0");
  });

  it("reports results only for a check the user asked for", async () => {
    mocks.check.mockResolvedValueOnce(null);
    await checkForUpdates();
    expect(app.notice).toBeNull();
    mocks.check.mockRejectedValueOnce(new Error("offline"));
    await checkForUpdates();
    expect(app.notice).toBeNull();

    mocks.check.mockResolvedValueOnce(null);
    await checkForUpdates(true);
    expect(app.notice?.text).toBe("ModbusTool 3.0.0 is the latest version");
    mocks.check.mockRejectedValueOnce("offline");
    await checkForUpdates(true);
    expect(app.notice).toEqual({ kind: "error", text: "Update check failed: offline" });
  });

  it("remembers the choice and checks at once when automatic", async () => {
    mocks.check.mockResolvedValue(null);
    setUpdateMode("manual");
    expect(localStorage.getItem("updates")).toBe("manual");
    expect(mocks.check).not.toHaveBeenCalled();
    setUpdateMode("auto");
    expect(localStorage.getItem("updates")).toBe("auto");
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it("checks at start and every period only in automatic mode", async () => {
    vi.useFakeTimers();
    mocks.check.mockResolvedValue(null);
    updates.mode = "manual";
    let stop = startUpdateChecks();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(mocks.check).not.toHaveBeenCalled();
    stop();

    updates.mode = "auto";
    stop = startUpdateChecks();
    await vi.advanceTimersByTimeAsync(2 * CHECK_EVERY_MS);
    expect(mocks.check).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(mocks.check).toHaveBeenCalledTimes(3);
    expect(updates.currentVersion).toBe("3.0.0");
  });
});

describe("installing", () => {
  it("stops the Modbus work, reports progress, installs and restarts", async () => {
    const update = fakeUpdate("3.1.0", [
      { event: "Started", data: { contentLength: 200 } },
      { event: "Progress", data: { chunkLength: 50 } },
      { event: "Finished" },
    ]);
    mocks.check.mockResolvedValue(update);
    await checkForUpdates();
    master.connected = true;
    slave.running = true;
    await installUpdate();
    expect(mocks.disconnect).toHaveBeenCalled();
    expect(mocks.stopSlave).toHaveBeenCalled();
    expect(updates.progress).toBe(0.25);
    expect(mocks.relaunch).toHaveBeenCalled();
  });

  it("leaves Modbus alone when idle and shows no share for an unknown size", async () => {
    const update = fakeUpdate("3.1.0", [
      { event: "Started", data: {} },
      { event: "Progress", data: { chunkLength: 9 } },
    ]);
    mocks.check.mockResolvedValue(update);
    await checkForUpdates();
    await installUpdate();
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(mocks.stopSlave).not.toHaveBeenCalled();
    expect(updates.progress).toBeNull();
  });

  it("reports a failed install and lets the user try again", async () => {
    const update = fakeUpdate();
    update.downloadAndInstall.mockRejectedValueOnce(new Error("signature mismatch"));
    mocks.check.mockResolvedValue(update);
    await checkForUpdates();
    await installUpdate();
    expect(app.notice?.text).toBe("Update failed: signature mismatch");
    expect(updates.installing).toBe(false);
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });

  it("does nothing without an update", async () => {
    await installUpdate();
    expect(updates.installing).toBe(false);
  });
});
