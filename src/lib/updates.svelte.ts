// Application updates (docs/superpowers/specs/2026-11-06-updater-design.md), on Aura's model:
// look for new versions freely, install one only when the user says so.

import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { m } from "../paraglide/messages.js";
import { disconnect } from "./masterActions.svelte";
import { readPreference, writePreference } from "./preferences";
import { stopSlave } from "./slaveActions.svelte";
import { master, notify, slave } from "./state.svelte";

export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** "auto": check at start and every CHECK_EVERY_MS; null: not asked yet (first start). */
export type UpdateMode = "auto" | "manual";

const PREFERENCE = "updates";

function savedMode(): UpdateMode | null {
  const saved = readPreference(PREFERENCE);
  return saved === "auto" || saved === "manual" ? saved : null;
}

export const updates = $state({
  mode: savedMode(),
  currentVersion: "",
  available: null as Update | null,
  /** The version the user put off with "Later": not offered again this session. */
  postponed: null as string | null,
  checking: false,
  installing: false,
  /** Downloaded share 0..1, null while the size is unknown. */
  progress: null as number | null,
  settingsOpen: false,
});

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The update to offer now: available and not put off. */
export const offered = (): Update | null =>
  updates.available && updates.available.version !== updates.postponed ? updates.available : null;

export async function checkForUpdates(manual = false): Promise<void> {
  if (updates.checking || updates.installing) return;
  updates.checking = true;
  try {
    const update = await check();
    if (update) {
      if (updates.available !== update) await updates.available?.close();
      updates.available = update;
      if (manual) updates.postponed = null;
    } else if (manual) {
      notify("ok", m.updates_latest({ version: updates.currentVersion }));
    }
  } catch (e) {
    // A background check that fails (offline, GitHub down) is not worth an interruption.
    if (manual) notify("error", m.updates_check_failed({ error: message(e) }));
  } finally {
    updates.checking = false;
  }
}

export function setUpdateMode(mode: UpdateMode): void {
  updates.mode = mode;
  writePreference(PREFERENCE, mode);
  if (mode === "auto") void checkForUpdates();
}

export function postpone(): void {
  updates.postponed = updates.available?.version ?? null;
}

/** Stops the Modbus work, installs and restarts. On Windows the installer closes the app itself. */
export async function installUpdate(): Promise<void> {
  const update = updates.available;
  if (!update || updates.installing) return;
  updates.installing = true;
  updates.progress = null;
  try {
    if (master.connected) await disconnect();
    if (slave.running) await stopSlave();
    let total = 0;
    let received = 0;
    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      if (event.event === "Progress") {
        received += event.data.chunkLength;
        updates.progress = total ? Math.min(1, received / total) : null;
      }
    });
    await relaunch();
  } catch (e) {
    notify("error", m.updates_install_failed({ error: message(e) }));
    updates.installing = false;
  }
}

/** Reads the running version and, if the user chose so, checks now and every CHECK_EVERY_MS. */
export function startUpdateChecks(): () => void {
  void getVersion().then((version) => (updates.currentVersion = version));
  if (updates.mode === "auto") void checkForUpdates();
  const timer = setInterval(() => {
    if (updates.mode === "auto") void checkForUpdates();
  }, CHECK_EVERY_MS);
  return () => clearInterval(timer);
}
