// End-to-end run of the real app (tauri-driver + WebKitWebDriver) against pymodbus as an
// independent reference implementation. Linux only (tauri-driver has no macOS driver).
//
//   npx tauri build --debug --no-bundle && node e2e/run.mjs [screenshot-dir]
//
// Needs: tauri-driver, WebKitWebDriver, socat, python3 with pymodbus, an X display.

import { remote } from "webdriverio";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const shots = process.argv[2] ? resolve(process.argv[2]) : null;
const tmp = mkdtempSync(join(tmpdir(), "modbustool-e2e-"));
const children = [];
const results = [];

function background(command, args) {
  const child = spawn(command, args, { stdio: "ignore" });
  children.push(child);
  return child;
}

function reference(...args) {
  const out = execFileSync("python3", [join(root, "e2e/reference_client.py"), ...args.map(String)], { encoding: "utf8" });
  return JSON.parse(out.trim().split("\n").pop());
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

function expectEqual(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function eventually(fn, what, timeoutMs = 5000) {
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

const panel = (title) => `//section[.//h2[normalize-space()="${title}"]]`;
const fieldIn = (scope, label) =>
  `${scope}//label[contains(@class,"field")][starts-with(normalize-space(), "${label}")]//*[self::input or self::select]`;

async function setField(browser, scope, label, value) {
  const el = await browser.$(fieldIn(scope, label));
  if ((await el.getTagName()) === "select") {
    await el.selectByVisibleText(value);
  } else {
    await el.clearValue();
    await el.setValue(String(value));
    await browser.keys("Tab");
  }
}

async function click(browser, xpath) {
  const el = await browser.$(xpath);
  await el.waitForClickable({ timeout: 5000 });
  await el.click();
}

const button = (scope, text) => `${scope}//button[normalize-space()="${text}"]`;

async function gridValues(browser) {
  return browser.$$("//div[@role='row' and contains(@class,'line')]/span[@role='cell'][4]").map((c) => c.getText());
}

async function editCell(browser, index, value) {
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

async function screenshot(browser, name) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await browser.saveScreenshot(join(shots, `${name}.png`));
}

// ---------- scenario ----------

async function masterScenario(browser, ports, serialRef) {
  const conn = panel("Connection");
  console.log("Master against pymodbus");
  // The theme persists across runs; start from the dark one so screenshots are comparable.
  if ((await browser.execute(() => document.documentElement.dataset.theme)) === "light") {
    await click(browser, "//nav//button[contains(@class,'theme')]");
  }
  await setField(browser, conn, "Port", ports.tcp);
  await click(browser, button(conn, "Connect"));
  await browser.$(button(conn, "Disconnect")).waitForExist({ timeout: 5000 });

  await click(browser, button(panel("Polls"), "+ Add"));
  await setField(browser, panel("Polls"), "Every ms", 200);
  await click(browser, button(panel("Polls"), "▶ Start"));

  await check("TCP poll FC03 shows the reference values", () =>
    eventually(async () => expectEqual((await gridValues(browser)).slice(0, 4), ["111", "222", "333", "444"], "grid"), "poll"),
  );

  await check("TCP write FC06 from the grid reaches the reference", async () => {
    await editCell(browser, 3, 4242);
    await eventually(async () => expectEqual(reference("read", "tcp", `127.0.0.1:${ports.tcp}`, "holding", 3, 1).values, [4242], "reference"), "write");
  });

  await check("TCP float32 CDAB display of a written value", async () => {
    reference("write", "tcp", `127.0.0.1:${ports.tcp}`, "holding", 0, "0xE979,0x42F6".split(",").map(Number).join(","));
    await setField(browser, panel("Polls"), "Type", "Float32");
    await setField(browser, panel("Polls"), "Order", "CDAB");
    await eventually(async () => expectEqual((await gridValues(browser))[0], "123.456", "float"), "float");
    await setField(browser, panel("Polls"), "Type", "UInt16");
    await setField(browser, panel("Polls"), "Order", "ABCD");
  });

  await click(browser, "//button[@aria-label='Plot 4']");
  await sleep(1500);
  await screenshot(browser, "master-dark");

  await check("TCP coils FC01 toggle writes FC05", async () => {
    await setField(browser, panel("Polls"), "Function", "FC01 · Coils");
    await eventually(async () => expectEqual((await gridValues(browser)).slice(0, 4), ["ON", "OFF", "ON", "OFF"], "coils"), "coils");
    await click(browser, "//button[@aria-label='Toggle 1']");
    await eventually(async () => expectEqual(reference("read", "tcp", `127.0.0.1:${ports.tcp}`, "coils", 0, 4).values, [1, 1, 1, 0], "reference"), "toggle");
  });

  await click(browser, button(panel("Polls"), "■ Stop"));
  await setField(browser, panel("Polls"), "Function", "FC04 · Input registers");

  const others = [
    ["UDP", "Modbus UDP", { Port: ports.udp }],
    ["RTU over TCP", "RTU over TCP", { Port: ports.rtuOverTcp }],
    ["ASCII serial", "ASCII · serial", { "Serial port": serialRef, "Data bits": "8" }],
  ];
  for (const [name, protocol, fields] of others) {
    await check(`${name}: read once FC04 matches the reference`, async () => {
      await click(browser, button(conn, "Disconnect"));
      await setField(browser, conn, "Protocol", protocol);
      for (const [label, value] of Object.entries(fields)) await setField(browser, conn, label, value);
      await click(browser, button(conn, "Connect"));
      await browser.$(button(conn, "Disconnect")).waitForExist({ timeout: 5000 });
      await click(browser, "//button[normalize-space()='Read once']");
      await eventually(async () => expectEqual((await gridValues(browser)).slice(0, 3), ["1000", "1001", "1002"], "grid"), "read");
    });
  }
  await click(browser, button(conn, "Disconnect"));
}

async function slaveScenario(browser, ports, slaveSerial, clientSerial) {
  console.log("Slave against pymodbus client");
  await click(browser, "//nav//button[.//span[normalize-space()='Slave']]");
  const listener = panel("Listener");
  await setField(browser, listener, "Port", ports.slaveTcp);
  await click(browser, button(listener, "Start listening"));
  await browser.$(button(listener, "Stop")).waitForExist({ timeout: 5000 });
  const target = `127.0.0.1:${ports.slaveTcp}`;

  await check("TCP: reference writes FC16 and reads it back", () => {
    expectEqual(reference("write", "tcp", target, "holding", 10, "7,8,9"), { ok: true }, "write");
    expectEqual(reference("read", "tcp", target, "holding", 10, 3).values, [7, 8, 9], "read");
  });

  await check("TCP: the grid shows values written by the reference", async () => {
    await setField(browser, "//div[contains(@class,'toolbar')]", "Start", 10);
    await eventually(async () => expectEqual((await gridValues(browser)).slice(0, 3), ["7", "8", "9"], "grid"), "grid");
  });

  await check("TCP: a value edited in the grid is read by the reference", async () => {
    await editCell(browser, 1, 555);
    await eventually(() => expectEqual(reference("read", "tcp", target, "holding", 11, 1).values, [555], "read"), "edit");
  });

  await check("TCP: coils written by the reference (FC15) read back (FC01)", () => {
    expectEqual(reference("write", "tcp", target, "coils", 3, "1,0,1"), { ok: true }, "write");
    expectEqual(reference("read", "tcp", target, "coils", 3, 3).values, [1, 0, 1], "read");
  });

  await check("Simulation: sine generator changes the register seen by the reference", async () => {
    await click(browser, button(panel("Simulation"), "+ Add"));
    await setField(browser, panel("Simulation"), "Address", 50);
    await setField(browser, panel("Simulation"), "Period ms", 100);
    await click(browser, `${panel("Simulation")}//input[@aria-label='Enabled']`);
    const samples = [];
    for (let i = 0; i < 5; i++) {
      samples.push(reference("read", "tcp", target, "holding", 50, 1).values[0]);
      await sleep(250);
    }
    if (new Set(samples).size < 2) throw new Error(`no change: ${samples}`);
    if (samples.some((v) => v < 0 || v > 100)) throw new Error(`out of range: ${samples}`);
  });

  await screenshot(browser, "slave-dark");

  const others = [
    ["UDP", "Modbus UDP", { Port: ports.slaveUdp }, ["udp", `127.0.0.1:${ports.slaveUdp}`]],
    ["RTU over TCP", "RTU over TCP", { Port: ports.slaveRtuOverTcp }, ["rtuovertcp", `127.0.0.1:${ports.slaveRtuOverTcp}`]],
    ["RTU serial", "RTU · serial", { "Serial port": slaveSerial }, ["rtu", clientSerial]],
  ];
  for (const [name, protocol, fields, client] of others) {
    await check(`${name}: reference reads FC03 from the slave`, async () => {
      await click(browser, button(listener, "Stop"));
      await setField(browser, listener, "Protocol", protocol);
      for (const [label, value] of Object.entries(fields)) await setField(browser, listener, label, value);
      await click(browser, button(listener, "Start listening"));
      await browser.$(button(listener, "Stop")).waitForExist({ timeout: 5000 });
      await eventually(() => expectEqual(reference("read", ...client, "holding", 10, 3).values, [7, 555, 9], "read"), "read");
    });
  }
  await click(browser, button(listener, "Stop"));
}

async function trafficScenario(browser) {
  console.log("Traffic monitor");
  await click(browser, "//nav//button[.//span[normalize-space()='Traffic']]");
  await check("Traffic monitor lists master and slave frames with descriptions", async () => {
    const lines = await browser.$$("//div[contains(@class,'body')]/div[contains(@class,'line')]");
    if (lines.length < 20) throw new Error(`only ${lines.length} lines`);
    // Off-screen rows use content-visibility: auto, so getText would only see the visible ones.
    const text = await browser.$("//div[contains(@class,'body')]").getProperty("textContent");
    for (const expected of ["Read Holding Registers", "Write Single Register", "Write Multiple Coils", "MASTER", "SLAVE"]) {
      if (!text.toUpperCase().includes(expected.toUpperCase())) throw new Error(`missing "${expected}"`);
    }
  });
  await screenshot(browser, "traffic-dark");
  await click(browser, "//nav//button[contains(@class,'theme')]");
  await click(browser, "//nav//button[.//span[normalize-space()='Master']]");
  await sleep(800);
  await screenshot(browser, "master-light");
}

async function main() {
  const ports = { tcp: 15020, udp: 15022, rtuOverTcp: 15021, slaveTcp: 15030, slaveUdp: 15031, slaveRtuOverTcp: 15032 };
  const pty = (a, b) => background("socat", [`pty,raw,echo=0,link=${join(tmp, a)}`, `pty,raw,echo=0,link=${join(tmp, b)}`]);
  pty("refA", "refB");
  pty("slaveA", "slaveB");
  await sleep(800);
  background("python3", [join(root, "e2e/reference_servers.py"), ports.tcp, ports.udp, ports.rtuOverTcp, join(tmp, "refA")]);
  background("tauri-driver", []);
  await sleep(2000);

  const browser = await remote({
    hostname: "127.0.0.1",
    port: 4444,
    logLevel: "error",
    capabilities: { "tauri:options": { application: join(root, "src-tauri/target/debug/modbus-tool") } },
  });
  try {
    await masterScenario(browser, ports, join(tmp, "refB"));
    await slaveScenario(browser, ports, join(tmp, "slaveA"), join(tmp, "slaveB"));
    await trafficScenario(browser);
  } finally {
    await browser.deleteSession().catch(() => {});
    children.forEach((c) => c.kill());
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  children.forEach((c) => c.kill());
  process.exit(1);
});
