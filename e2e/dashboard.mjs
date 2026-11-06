// Dashboard against pymodbus (docs/superpowers/specs/2026-11-06-dashboards-design.md): panels read
// what a running poll reads from the reference server, and buttons and switches write to it.
// Reference holding register n = 111 * (n + 1), even coils ON (reference_servers.py).

import { setTimeout as sleep } from "node:timers/promises";
import {
  button,
  check,
  click,
  dialog,
  editPoll,
  eventually,
  expectEqual,
  labelled,
  reference,
  saveDialog,
} from "./helpers.mjs";

const panelBody = (title) => `//article[.//h3[normalize-space()="${title}"]]`;

async function addPanel(browser, kind, fields) {
  await click(browser, button("", "Add panel"));
  await click(browser, button(dialog, kind));
  await browser.$(button(dialog, "Save")).waitForExist({ timeout: 3000 });
  await saveDialog(browser, fields);
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

/** Master connected over TCP to the reference server; Poll 1 is stopped. */
export async function dashboardScenario(browser, target) {
  console.log("Dashboard");
  await editPoll(browser, {
    Function: "FC03 · Holding registers",
    Address: 0,
    Quantity: 10,
    Type: "UInt16",
    Order: "ABCD",
    "Every ms": 200,
  });
  await click(browser, labelled("Start Poll 1"));
  await click(browser, "//nav//button[.//span[normalize-space()='Dashboard']]");
  await click(browser, button("", "New dashboard"));
  await saveDialog(browser, { Name: "Plant" });
  await addPanel(browser, "Value", { Title: "Pressure", Value: "Poll 1 · FC03 2", Unit: "bar", Decimals: 0 });
  await addPanel(browser, "Lamp", { Title: "Running", Value: "Poll 1 · FC03 0" });
  await addPanel(browser, "Button", { Title: "Set 4242", Address: 5, "Value to write": "4242" });
  await addPanel(browser, "Switch", { Title: "Valve 7", Address: 7 });

  await check("Dashboard: panels are placed side by side without overlaps", async () => {
    const places = await Promise.all(["Pressure", "Running", "Set 4242", "Valve 7"].map((t) => place(browser, t)));
    expectEqual(new Set(places.map(String)).size, 4, "distinct places");
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

  await check("Dashboard: a value panel shows the register a running poll reads", () =>
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
  });

  await sleep(500);
  await click(browser, "//nav//button[.//span[normalize-space()='Master']]");
  await click(browser, labelled("Stop Poll 1"));
}
