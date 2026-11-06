// Dashboard against pymodbus (docs/superpowers/specs/2026-11-06-dashboards-design.md): panels read
// their own variables from the reference server, and command panels write to it.
// Reference holding register n = 111 * (n + 1), even coils ON (reference_servers.py).

import {
  button,
  check,
  click,
  dialog,
  eventually,
  expectEqual,
  labelled,
  panel,
  reference,
  saveDialog,
} from "./helpers.mjs";

const panelBody = (title) => `//article[.//h3[normalize-space()="${title}"]]`;

/** Adds a panel; `writeTo` is the address a command writes, the first of its address fields. */
async function addPanel(browser, kind, fields, writeTo = null) {
  await click(browser, button("", "Add panel"));
  await click(browser, button(dialog, kind));
  await browser.$(button(dialog, "Save")).waitForExist({ timeout: 3000 });
  if (writeTo !== null) await setFirst(browser, "Address", writeTo);
  await saveDialog(browser, fields);
}

/** Sets the first field of the open editor whose label starts with `label`. */
async function setFirst(browser, label, value) {
  const input = await browser.$(`(${dialog}//label[starts-with(normalize-space(),"${label}")]//input)[1]`);
  await input.clearValue();
  await input.setValue(String(value));
}

/** Turns on the first scaling of the open editor (a command's target) and sets its two points. */
async function scaleFirst(browser, [rawMin, rawMax, engMin, engMax]) {
  await click(browser, `(${dialog}//label[starts-with(normalize-space(),"Scale:")]//input)[1]`);
  for (const [label, value] of Object.entries({
    "Raw min": rawMin,
    "Raw max": rawMax,
    "Engineering min": engMin,
    "Engineering max": engMax,
  })) {
    await setFirst(browser, label, value);
  }
}

const place = (browser, title) =>
  browser.execute((t) => {
    const header = [...document.querySelectorAll("article h3")].find((h) => h.textContent.trim() === t);
    const item = header?.closest(".grid-stack-item");
    return item ? [Number(item.getAttribute("gs-x")), Number(item.getAttribute("gs-y"))] : null;
  }, title);

/**
 * Presses on a panel's title and moves right by `columns` grid columns in small steps, as a hand
 * does. The grid packs panels upwards (gridstack float off): only a sideways move into free columns
 * sticks. Viewport coordinates, taken once: the panel itself moves under the pointer.
 */
async function dragRight(browser, title, columns) {
  // Panels glide to their place (gridstack animate): measure once they are there.
  await browser.execute(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const [x, y, cell] = await browser.execute((t) => {
    const header = [...document.querySelectorAll("article h3")].find((h) => h.textContent.trim() === t);
    const box = header.getBoundingClientRect();
    return [box.x + box.width / 2, box.y + box.height / 2, document.querySelector(".grid-stack").offsetWidth / 12];
  }, title);
  const at = (dx) => ({ type: "pointerMove", duration: 20, x: Math.round(x + dx), y: Math.round(y) });
  const steps = Array.from({ length: 10 }, (_, i) => at(((i + 1) * columns * cell) / 10));
  await browser.performActions([
    {
      type: "pointer",
      id: "mouse",
      parameters: { pointerType: "mouse" },
      actions: [at(0), { type: "pointerDown", button: 0 }, ...steps, { type: "pointerUp", button: 0 }],
    },
  ]);
  await browser.releaseActions();
}

/**
 * Master connected over TCP to the reference server, and no poll of the master running: the
 * dashboard reads its own variables (spec D13-D14).
 */
export async function dashboardScenario(browser, target) {
  console.log("Dashboard");
  await click(browser, "//nav//button[.//span[normalize-space()='Dashboard']]");
  await click(browser, button("", "New dashboard"));
  await saveDialog(browser, { Name: "Plant" });
  const period = await browser.$("//header//label[contains(normalize-space(),'Read every ms')]//input");
  await period.clearValue();
  await period.setValue("200");
  await addPanel(browser, "Value", { Title: "Pressure", Address: 2, "Unit of measure": "bar", Decimals: 0 });
  await addPanel(browser, "Lamp", { Title: "Running", "Read from": "Coils", Address: 0 });
  await addPanel(browser, "Button", { Title: "Set 4242", Address: 5, "Value to write": "4242" });
  // The state of a command is read at first from the address it writes.
  await addPanel(browser, "Switch", { Title: "Valve 7" }, 7);
  await addPanel(browser, "Selector", { Title: "Mode" }, 8);
  await addPanel(browser, "Number input", { Title: "Speed", Min: 0, Max: 5000 }, 9);
  // Scaling (spec D16-D17): register 2 holds 333, 0..1000 raw is 0..100 %.
  await click(browser, button("", "Add panel"));
  await click(browser, button(dialog, "Value"));
  await scaleFirst(browser, [0, 1000, 0, 100]);
  await saveDialog(browser, { Title: "Level", Address: 2, "Unit of measure": "%", Decimals: 1 });
  // A setpoint typed in % is written raw (0..27648, the S7 analogue range) to register 11.
  await click(browser, button("", "Add panel"));
  await click(browser, button(dialog, "Number input"));
  await setFirst(browser, "Address", 11);
  await scaleFirst(browser, [0, 27648, 0, 100]);
  await saveDialog(browser, { Title: "Level SP" });

  await check("Dashboard: panels are placed side by side without overlaps", async () => {
    const places = await Promise.all(
      ["Pressure", "Running", "Set 4242", "Valve 7", "Mode", "Speed", "Level", "Level SP"].map((t) =>
        place(browser, t),
      ),
    );
    expectEqual(new Set(places.map(String)).size, 8, "distinct places");
    if (places.some((p) => p === null)) throw new Error(`missing panel: ${JSON.stringify(places)}`);
  });

  await check("Dashboard: dragging a panel by its title in edit mode moves it", async () => {
    const [x, y] = await place(browser, "Valve 7");
    await dragRight(browser, "Valve 7", 2);
    await eventually(async () => {
      const [toX, toY] = await place(browser, "Valve 7");
      if (toX <= x || toY !== y) throw new Error(`at ${[toX, toY]}, was ${[x, y]}`);
    }, "drag");
  });

  await click(browser, "//button[normalize-space()='Done']");

  await check("Dashboard: a value panel reads its own variable, with no poll of the master running", () =>
    eventually(
      async () =>
        expectEqual(
          await browser.$(`${panelBody("Pressure")}//span[contains(@class,'number')]`).getText(),
          "333",
          "value",
        ),
      "value",
    ),
  );

  await check("Dashboard: a lamp lights on a non-zero register", async () => {
    const lamp = await browser.$(`${panelBody("Running")}//span[contains(@class,'lamp')]`);
    await eventually(async () => {
      if (!(await lamp.getAttribute("class")).includes("on")) throw new Error("lamp off");
    }, "lamp");
  });

  await check("Dashboard: a button writes its value (FC06) to the reference", async () => {
    await click(browser, `${panelBody("Set 4242")}//button[normalize-space()='Set 4242']`);
    await eventually(
      () => expectEqual(reference("read", "tcp", target, "holding", 5, 1).values, [4242], "register 5"),
      "write",
    );
  });

  await check("Dashboard: a switch writes its coil (FC05) to the reference", async () => {
    expectEqual(reference("read", "tcp", target, "coils", 7, 1).values, [0], "coil 7 before");
    await click(browser, `${panelBody("Valve 7")}//button[@role='switch']`);
    await eventually(
      () => expectEqual(reference("read", "tcp", target, "coils", 7, 1).values, [1], "coil 7"),
      "switch",
    );
    // The switch shows the coil it writes, read back from the device.
    const toggle = await browser.$(`${panelBody("Valve 7")}//button[@role='switch']`);
    await eventually(
      async () => expectEqual(await toggle.getAttribute("aria-checked"), "true", "shown state"),
      "state",
    );
  });

  await check("Dashboard: a selector writes the chosen option and shows the value read", async () => {
    const mode = await browser.$(`${panelBody("Mode")}//select`);
    const shows = (value) =>
      eventually(async () => expectEqual(await mode.getValue(), value, "selector shows"), "selector");
    await shows(""); // 999 matches no option
    await mode.selectByVisibleText("1");
    await eventually(
      () => expectEqual(reference("read", "tcp", target, "holding", 8, 1).values, [1], "register 8"),
      "select",
    );
    await shows("1");
    // Changed elsewhere, then the same option chosen again: it must write again (WebKit, spec D9).
    reference("write", "tcp", target, "holding", 8, "0");
    await shows("0");
    await mode.selectByVisibleText("1");
    await eventually(
      () => expectEqual(reference("read", "tcp", target, "holding", 8, 1).values, [1], "register 8 again"),
      "select again",
    );
  });

  await check("Dashboard: a number input writes a setpoint in range and refuses one out of range", async () => {
    const input = await browser.$(`${panelBody("Speed")}//input`);
    const set = async (value) => {
      await input.clearValue();
      await input.setValue(value);
      await click(browser, `${panelBody("Speed")}//button[normalize-space()='Set']`);
    };
    await set("6000");
    expectEqual(await input.getProperty("validationMessage"), "Above the maximum 5000", "out of range");
    await set("1234");
    await eventually(
      () => expectEqual(reference("read", "tcp", target, "holding", 9, 1).values, [1234], "register 9"),
      "setpoint",
    );
    await eventually(
      async () =>
        expectEqual(await browser.$(`${panelBody("Speed")}//span[contains(@class,'read')]`).getText(), "1234", "read"),
      "setpoint read",
    );
  });

  await check("Dashboard: a scaled variable shows its engineering value", () =>
    eventually(
      async () =>
        expectEqual(
          await browser.$(`${panelBody("Level")}//span[contains(@class,'number')]`).getText(),
          "33.3",
          "level",
        ),
      "scaled value",
    ),
  );

  await check("Dashboard: a scaled setpoint is written raw and read back in engineering units", async () => {
    const input = await browser.$(`${panelBody("Level SP")}//input`);
    await input.clearValue();
    await input.setValue("50");
    await click(browser, `${panelBody("Level SP")}//button[normalize-space()='Set']`);
    await eventually(
      () => expectEqual(reference("read", "tcp", target, "holding", 11, 1).values, [13824], "register 11"),
      "raw write",
    );
    await eventually(
      async () =>
        expectEqual(await browser.$(`${panelBody("Level SP")}//span[contains(@class,'read')]`).getText(), "50", "read"),
      "scaled read",
    );
  });

  await check("Dashboard: reads stop when the master disconnects", async () => {
    await click(browser, "//nav//button[.//span[normalize-space()='Master']]");
    await click(browser, button(panel("Connection"), "Disconnect"));
    await click(browser, "//nav//button[.//span[normalize-space()='Dashboard']]");
    await eventually(async () => {
      const cls = await browser.$(`${panelBody("Pressure")}//div[contains(@class,'value')]`).getAttribute("class");
      if (!cls.includes("stale")) throw new Error(`not stale: ${cls}`);
    }, "stale");
  });
  // Delete the dashboard: its reads would add traffic to the scenarios that follow.
  await click(browser, labelled("Delete dashboard"));
  await click(browser, button(dialog, "Yes"));
  await click(browser, "//nav//button[.//span[normalize-space()='Master']]");
  await click(browser, button(panel("Connection"), "Connect"));
  await browser.$(button(panel("Connection"), "Disconnect")).waitForExist({ timeout: 5000 });
}
