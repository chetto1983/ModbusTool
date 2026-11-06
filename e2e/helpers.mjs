// Shared helpers of the end-to-end run: checks, the pymodbus reference client and the
// WebDriver UI helpers (see run.mjs).

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const root = resolve(import.meta.dirname, "..");
/** Windows names the interpreter `python`; elsewhere `python3` is the one with pymodbus. */
export const python = process.platform === "win32" ? "python" : "python3";
/**
 * Serial checks need socat's pty pairs, which Windows does not have: there they are not run, and
 * the run says so, rather than counting them as passed.
 */
export const serial = process.platform !== "win32";
/** Failure screenshots and the run's files; E2E_OUT names a folder CI uploads when a run fails. */
export const tmp = process.env.E2E_OUT
  ? (mkdirSync(process.env.E2E_OUT, { recursive: true }), process.env.E2E_OUT)
  : mkdtempSync(join(tmpdir(), "modbustool-e2e-"));
export const results = [];
let currentBrowser = null;

/** The session whose screen a failed check saves. */
export function track(browser) {
  currentBrowser = browser;
}

export function reference(...args) {
  const out = execFileSync(python, [join(root, "e2e/reference_client.py"), ...args.map(String)], {
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").pop());
}

export async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ✗ ${name}\n      ${e.message}`);
    await currentBrowser?.saveScreenshot(join(tmp, `failure-${results.length}.png`)).catch(() => {});
    console.log(`      screenshot: ${join(tmp, `failure-${results.length}.png`)}`);
  }
}

export function expectEqual(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export async function eventually(fn, what, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(150);
    }
  }
  throw new Error(`${what}: ${last?.message}`);
}

// ---------- UI helpers ----------

export const panel = (title) => `//section[.//h2[normalize-space()="${title}"]]`;
const fieldIn = (scope, label) =>
  `${scope}//label[contains(@class,"field")][starts-with(normalize-space(), "${label}")]//*[self::input or self::select]`;

export async function setField(browser, scope, label, value) {
  const el = await browser.$(fieldIn(scope, label));
  if ((await el.getTagName()) === "select") {
    await el.selectByVisibleText(value);
  } else {
    await el.clearValue();
    await el.setValue(String(value));
    await browser.keys("Tab");
  }
}

export async function click(browser, xpath) {
  const el = await browser.$(xpath);
  await el.waitForClickable({ timeout: 5000 });
  await el.click();
}

export const button = (scope, text) => `${scope}//button[normalize-space()="${text}"]`;
export const labelled = (label) => `//button[@aria-label="${label}"]`;
export const dialog = "//dialog[@open]";

/** Sets the fields of the open editor modal and saves it. */
export async function saveDialog(browser, fields) {
  for (const [label, value] of Object.entries(fields)) await setField(browser, dialog, label, value);
  await click(browser, button(dialog, "Save"));
  await browser.$(dialog).waitForExist({ timeout: 3000, reverse: true });
}

export async function editPoll(browser, fields) {
  await click(browser, labelled("Edit Poll 1"));
  await saveDialog(browser, fields);
}

export async function gridValues(browser) {
  return browser.$$("//div[@role='row' and contains(@class,'line')]/span[@role='cell'][4]").map((c) => c.getText());
}

export async function editCell(browser, index, value) {
  const cell = await browser.$(`(//div[contains(@class,'line')]//button[contains(@class,'cell')])[${index + 1}]`);
  await cell.waitForClickable({ timeout: 5000 });
  await cell.click();
  const input = await browser.$("input.edit");
  await input.waitForExist({ timeout: 3000 });
  // setValue would run WebDriver "Element Clear", which blurs the input and cancels the edit.
  // The current text is selected on focus, so typing replaces it, as for a user.
  await input.addValue(String(value));
  await browser.keys("Enter");
}
