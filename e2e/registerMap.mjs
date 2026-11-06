// Register maps against pymodbus (docs/superpowers/specs/2026-11-06-register-maps-logging-design.md):
// a map imported through the native file dialog becomes a dashboard table that reads the reference,
// and the table exports the same map. Reference input register n = 1000 + n, discrete inputs off
// (reference_servers.py); no scenario writes them.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  answerFileDialog,
  button,
  check,
  click,
  dialog,
  eventually,
  expectEqual,
  labelled,
  setField,
  tmp,
} from "./helpers.mjs";

// As a manual prints it: headers in its own words and case, mixed types, a scaled value, a bit.
const MAP = `Name,Table,Address,Type,Byte order,Units,Decimals,Raw min,Raw max,Eng min,Eng max
Inlet temperature,input registers,4,UInt16,,°C,0,,,,
Level,input registers,6,UInt16,,%,1,1000,1010,0,100
Totaliser,input registers,2,UInt32,ABCD,m³,0,,,,
Alarm,discrete inputs,1,,,,0,,,,
`;

// What the table exports: the app's own column names, every default written out.
const EXPORTED = `name,table,address,type,byte_order,units,decimals,raw_min,raw_max,eng_min,eng_max,clamp
Inlet temperature,input registers,4,UInt16,ABCD,°C,0,,,,,
Level,input registers,6,UInt16,ABCD,%,1,1000,1010,0,100,false
Totaliser,input registers,2,UInt32,ABCD,m³,0,,,,,
Alarm,discrete inputs,1,,,,0,,,,,
`;

const rows = (browser) =>
  browser
    .$$("//article//table//tbody/tr")
    .map(async (tr) => (await tr.$$("td").map((td) => td.getProperty("textContent"))).map((t) => t.trim()));

/** Runs with the master connected to the reference; leaves no dashboard behind. */
export async function registerMapScenario(browser) {
  console.log("Register map");
  const source = join(tmp, "drive.csv");
  const exported = join(tmp, "drive-exported.csv");
  writeFileSync(source, MAP);
  await click(browser, "//nav//button[.//span[normalize-space()='Dashboard']]");

  await check("Register map: an imported map reads every register, scaled, with its units", async () => {
    await click(browser, button("", "Import register map"));
    await setField(browser, dialog, "Device unit id", 1);
    await click(browser, button(dialog, "Choose file"));
    await answerFileDialog("Open File", source);
    await eventually(
      async () =>
        expectEqual(
          await rows(browser),
          [
            ["Inlet temperature", "1,004", "°C"],
            ["Level", "60.0", "%"],
            // Registers 2 and 3, high word first: 1002 * 65536 + 1003.
            ["Totaliser", "65,668,075", "m³"],
            ["Alarm", "0", ""],
          ],
          "table",
        ),
      "table",
    );
  });

  await check("Register map: a table exports the map it was imported from", async () => {
    await click(browser, button("", "Edit"));
    await click(browser, labelled("Edit drive"));
    await click(browser, button(dialog, "Export register map"));
    await answerFileDialog("Save File", exported);
    await eventually(() => expectEqual(readFileSync(exported, "utf8"), EXPORTED, "exported map"), "export");
    await click(browser, button(dialog, "Cancel"));
    await click(browser, button("", "Done"));
  });

  await click(browser, labelled("Delete dashboard"));
  await click(browser, button(dialog, "Yes"));
  await click(browser, "//nav//button[.//span[normalize-space()='Master']]");
}
