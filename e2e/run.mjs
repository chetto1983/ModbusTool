// End-to-end run of the real app (tauri-driver) against pymodbus as an independent reference
// implementation, on Linux (WebKitWebDriver) and Windows (msedgedriver matching WebView2).
// tauri-driver has no macOS driver.
//
//   npx tauri build --debug --no-bundle && node e2e/run.mjs [screenshot-dir]
//
// Needs: tauri-driver, the platform's WebDriver, python with pymodbus; on Linux also socat (the
// serial checks) and an X display. Windows runs every check but the serial ones.

import { remote } from "webdriverio";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  button,
  check,
  click,
  dialog,
  editCell,
  editPoll,
  eventually,
  expectEqual,
  gridValues,
  labelled,
  panel,
  python,
  reference,
  results,
  root,
  saveDialog,
  serial,
  setField,
  tmp,
  track,
} from "./helpers.mjs";
import { dashboardScenario } from "./dashboard.mjs";
import { typesMaster, typesSlave } from "./types.mjs";

const APP = process.platform === "win32" ? "modbus-tool.exe" : "modbus-tool";
const shots = process.argv[2] ? resolve(process.argv[2]) : null;
const children = [];

function background(command, args) {
  const child = spawn(command, args, { stdio: "ignore" });
  children.push(child);
  return child;
}

async function screenshot(browser, name) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await browser.saveScreenshot(join(shots, `${name}.png`));
}

// ---------- scenario ----------

/**
 * The app has started once its theme is set. A cold start on a fresh CI runner takes longer than
 * the 5 s default; when it never starts, what the webview shows is kept for the CI artifact.
 */
async function whenStarted(browser) {
  try {
    await browser.waitUntil(async () => Boolean(await browser.execute(() => document.documentElement.dataset.theme)), {
      timeout: 30_000,
    });
  } catch (e) {
    await browser.saveScreenshot(join(tmp, "not-started.png")).catch(() => {});
    const state = await browser
      .execute(() => ({
        url: location.href,
        ready: document.readyState,
        agent: navigator.userAgent,
        body: document.body?.innerHTML.slice(0, 800),
      }))
      .catch((err) => ({ error: String(err) }));
    // Importing the app's module again surfaces the error that stopped it, if it threw.
    const load = await browser
      .executeAsync((done) => {
        const src = document.querySelector("script[type=module]")?.getAttribute("src");
        if (!src) return done("no module script");
        import(src).then(
          () => done(`module ${src} loaded`),
          (err) => done(`module ${src}: ${err?.stack ?? err}`),
        );
      })
      .catch((err) => `import check failed: ${err}`);
    console.error("Module:", load);
    console.error("App not started:", JSON.stringify(state));
    throw e;
  }
}

async function masterScenario(browser, ports, serialRef) {
  const conn = panel("Connection");
  console.log("Master against pymodbus");
  // The theme persists across runs; start from the dark one so screenshots are comparable.
  if ((await browser.execute(() => document.documentElement.dataset.theme)) === "light") {
    await click(browser, "//nav//button[contains(@class,'theme')]");
  }
  // First start asks about update checks: no, the run must not reach GitHub.
  const consent = await browser.$(button(dialog, "No, I will check myself"));
  if (await consent.isExisting()) await consent.click();
  await setField(browser, conn, "Port", ports.tcp);
  await click(browser, button(conn, "Connect"));
  await browser.$(button(conn, "Disconnect")).waitForExist({ timeout: 5000 });

  await click(browser, button(panel("Polls"), "+ Add"));
  await saveDialog(browser, { "Every ms": 200 });
  await click(browser, labelled("Start Poll 1"));

  await check("TCP poll FC03 shows the reference values", () =>
    eventually(
      async () => expectEqual((await gridValues(browser)).slice(0, 4), ["111", "222", "333", "444"], "grid"),
      "poll",
    ),
  );

  await check("TCP write FC06 from the grid reaches the reference", async () => {
    await editCell(browser, 3, 4242);
    await eventually(
      async () =>
        expectEqual(reference("read", "tcp", `127.0.0.1:${ports.tcp}`, "holding", 3, 1).values, [4242], "reference"),
      "write",
    );
  });

  await check("TCP float32 CDAB display of a written value", async () => {
    reference("write", "tcp", `127.0.0.1:${ports.tcp}`, "holding", 0, "0xE979,0x42F6".split(",").map(Number).join(","));
    await editPoll(browser, { Type: "Float32", Order: "CDAB" });
    await eventually(async () => expectEqual((await gridValues(browser))[0], "123.456", "float"), "float");
    await editPoll(browser, { Type: "UInt16", Order: "ABCD" });
  });

  await click(browser, "//button[@aria-label='Plot 4']");
  await sleep(1500);
  await screenshot(browser, "master-dark");

  await check("TCP coils FC01 toggle writes FC05", async () => {
    await editPoll(browser, { Function: "FC01 · Coils" });
    await eventually(
      async () => expectEqual((await gridValues(browser)).slice(0, 4), ["ON", "OFF", "ON", "OFF"], "coils"),
      "coils",
    );
    await click(browser, "//button[@aria-label='Toggle 1']");
    await eventually(
      async () =>
        expectEqual(
          reference("read", "tcp", `127.0.0.1:${ports.tcp}`, "coils", 0, 4).values,
          [1, 1, 1, 0],
          "reference",
        ),
      "toggle",
    );
  });

  await click(browser, labelled("Stop Poll 1"));
  await editPoll(browser, { Function: "FC03 · Holding registers" });
  await typesMaster(browser, `127.0.0.1:${ports.tcp}`, 40);
  await dashboardScenario(browser, `127.0.0.1:${ports.tcp}`);
  await editPoll(browser, {
    Function: "FC04 · Input registers",
    Address: 0,
    Quantity: 10,
    Type: "UInt16",
    Order: "ABCD",
  });

  const others = [
    ["UDP", "Modbus UDP", { Port: ports.udp }],
    ["RTU over TCP", "RTU over TCP", { Port: ports.rtuOverTcp }],
    ...(serial ? [["ASCII serial", "ASCII · serial", { "Serial port": serialRef, "Data bits": "8" }]] : []),
  ];
  for (const [name, protocol, fields] of others) {
    await check(`${name}: read once FC04 matches the reference`, async () => {
      await click(browser, button(conn, "Disconnect"));
      await browser.$(button(conn, "Connect")).waitForClickable({ timeout: 5000 });
      await setField(browser, conn, "Protocol", protocol);
      for (const [label, value] of Object.entries(fields)) await setField(browser, conn, label, value);
      await click(browser, button(conn, "Connect"));
      await browser.$(button(conn, "Disconnect")).waitForExist({ timeout: 5000 });
      await click(browser, "//button[normalize-space()='Read once']");
      await eventually(
        async () => expectEqual((await gridValues(browser)).slice(0, 3), ["1000", "1001", "1002"], "grid"),
        "read",
      );
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
    await eventually(
      () => expectEqual(reference("read", "tcp", target, "holding", 11, 1).values, [555], "read"),
      "edit",
    );
  });

  await check("TCP: coils written by the reference (FC15) read back (FC01)", () => {
    expectEqual(reference("write", "tcp", target, "coils", 3, "1,0,1"), { ok: true }, "write");
    expectEqual(reference("read", "tcp", target, "coils", 3, 3).values, [1, 0, 1], "read");
  });

  await typesSlave(browser, target, 300);
  const toolbar = "//div[contains(@class,'toolbar')]";
  for (const [label, value] of [
    ["Type", "UInt16"],
    ["Order", "ABCD"],
    ["Start", 10],
    ["Count", 100],
  ]) {
    await setField(browser, toolbar, label, value);
  }

  await check("Simulation: sine generator changes the register seen by the reference", async () => {
    await click(browser, button(panel("Simulation"), "+ Add"));
    await saveDialog(browser, { Address: 50, "Period ms": 100 });
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
    [
      "RTU over TCP",
      "RTU over TCP",
      { Port: ports.slaveRtuOverTcp },
      ["rtuovertcp", `127.0.0.1:${ports.slaveRtuOverTcp}`],
    ],
    ...(serial ? [["RTU serial", "RTU · serial", { "Serial port": slaveSerial }, ["rtu", clientSerial]]] : []),
  ];
  for (const [name, protocol, fields, client] of others) {
    await check(`${name}: reference reads FC03 from the slave`, async () => {
      await click(browser, button(listener, "Stop"));
      // The fields stay disabled until the listener has stopped.
      await browser.$(button(listener, "Start listening")).waitForClickable({ timeout: 5000 });
      await setField(browser, listener, "Protocol", protocol);
      for (const [label, value] of Object.entries(fields)) await setField(browser, listener, label, value);
      await click(browser, button(listener, "Start listening"));
      await browser.$(button(listener, "Stop")).waitForExist({ timeout: 5000 });
      await eventually(
        () => expectEqual(reference("read", ...client, "holding", 10, 3).values, [7, 555, 9], "read"),
        "read",
      );
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
    for (const expected of [
      "Read Holding Registers",
      "Write Single Register",
      "Write Multiple Coils",
      "MASTER",
      "SLAVE",
    ]) {
      if (!text.toUpperCase().includes(expected.toUpperCase())) throw new Error(`missing "${expected}"`);
    }
  });
  await screenshot(browser, "traffic-dark");
  await click(browser, "//nav//button[contains(@class,'theme')]");
  await click(browser, "//nav//button[.//span[normalize-space()='Master']]");
  await sleep(800);
  await screenshot(browser, "master-light");
}

const trafficLines = (browser) => browser.$$("//div[contains(@class,'body')]/div[contains(@class,'line')]").length;

async function languageScenario(browser) {
  console.log("Interface language");
  const language = "//nav//select";
  await click(browser, "//nav//button[.//span[normalize-space()='Traffic']]");
  await check("Italian applies at once and keeps the session (no reload)", async () => {
    const before = await trafficLines(browser);
    await (await browser.$(language)).selectByVisibleText("Italiano");
    await browser.$(panel("Monitor del traffico")).waitForExist({ timeout: 3000 });
    expectEqual(await browser.$("//header//h1").getText(), "Traffico", "title");
    expectEqual(await browser.execute(() => document.documentElement.lang), "it", "lang");
    const after = await trafficLines(browser);
    if (after < before) throw new Error(`traffic lost on switch: ${before} -> ${after}`);
    await click(browser, "//nav//button[.//span[normalize-space()='Master']]");
    await browser.$(panel("Connessione")).waitForExist({ timeout: 3000 });
  });
  await (await browser.$(language)).selectByVisibleText("English");
  await browser.$(panel("Connection")).waitForExist({ timeout: 3000 });
}

async function main() {
  const ports = { tcp: 15020, udp: 15022, rtuOverTcp: 15021, slaveTcp: 15030, slaveUdp: 15031, slaveRtuOverTcp: 15032 };
  const pty = (a, b) =>
    background("socat", [`pty,raw,echo=0,link=${join(tmp, a)}`, `pty,raw,echo=0,link=${join(tmp, b)}`]);
  if (serial) {
    pty("refA", "refB");
    pty("slaveA", "slaveB");
    await sleep(800);
  } else {
    console.log("Not run on this platform (no socat): ASCII serial master, RTU serial slave\n");
  }
  background(python, [
    join(root, "e2e/reference_servers.py"),
    ports.tcp,
    ports.udp,
    ports.rtuOverTcp,
    ...(serial ? [join(tmp, "refA")] : []),
  ]);
  background("tauri-driver", []);
  await sleep(2000);

  const browser = await remote({
    hostname: "127.0.0.1",
    port: 4444,
    logLevel: "error",
    capabilities: { "tauri:options": { application: join(root, "src-tauri/target/debug", APP) } },
  });
  track(browser);
  try {
    await whenStarted(browser);
    await masterScenario(browser, ports, join(tmp, "refB"));
    await slaveScenario(browser, ports, join(tmp, "slaveA"), join(tmp, "slaveB"));
    await trafficScenario(browser);
    await languageScenario(browser);
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
