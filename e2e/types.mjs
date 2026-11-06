// Every data type in every byte order, both ways, against pymodbus: the reference writes the
// registers e2e/typed_values.py computes and the grid must show the values (decode); a value
// typed in the grid must reach the reference as those registers (encode).

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  check,
  click,
  editCell,
  editPoll,
  eventually,
  expectEqual,
  gridValues,
  reference,
  root,
  setField,
} from "./helpers.mjs";

const groups = JSON.parse(execFileSync("python3", [join(root, "e2e/typed_values.py")], { encoding: "utf8" }));

function shows(text, expect) {
  if (expect.kind === "text") return text === expect.text;
  const value = Number(text);
  return value === expect.value || Math.abs(value - expect.value) <= expect.rel * Math.abs(expect.value);
}

async function expectDecoded(browser, group) {
  const shown = (await gridValues(browser)).slice(0, group.cases.length);
  group.cases.forEach((c, i) => {
    if (!shows(shown[i], c.expect)) {
      throw new Error(`value ${i}: expected ${JSON.stringify(c.expect)}, the grid shows ${JSON.stringify(shown[i])}`);
    }
  });
}

/**
 * The grid shows group.cases from `address`; typing the second value into the first row must
 * write the second value's registers there.
 */
async function checkGroup(browser, side, group, target, address, show) {
  await check(`${side}: ${group.type} ${group.order} decodes the reference and encodes edits`, async () => {
    reference("write", "tcp", target, "holding", address, group.cases.flatMap((c) => c.registers).join(","));
    await show(group);
    await eventually(() => expectDecoded(browser, group), "decode");
    await editCell(browser, 0, group.cases[1].input);
    await eventually(
      () =>
        expectEqual(
          reference("read", "tcp", target, "holding", address, group.width).values,
          group.cases[1].registers,
          "registers",
        ),
      "encode",
    );
  });
}

/** Master connected over TCP to the reference server, Poll 1 stopped on FC03. */
export async function typesMaster(browser, target, address) {
  for (const group of groups) {
    await checkGroup(browser, "master", group, target, address, async (g) => {
      await editPoll(browser, { Address: address, Quantity: g.cases.length * g.width, Type: g.type, Order: g.order });
      await click(browser, "//button[normalize-space()='Read once']");
    });
  }
}

/** Slave listening over TCP, holding registers shown. */
export async function typesSlave(browser, target, address) {
  const toolbar = "//div[contains(@class,'toolbar')]";
  for (const group of groups) {
    await checkGroup(browser, "slave", group, target, address, async (g) => {
      await setField(browser, toolbar, "Start", address);
      await setField(browser, toolbar, "Count", g.cases.length * g.width);
      await setField(browser, toolbar, "Type", g.type);
      await setField(browser, toolbar, "Order", g.order);
    });
  }
}
