import { describe, expect, it } from "vitest";
import { newDashboard, newPanel, newTableRow, newVariable, type Panel, type Variable } from "./dashboards";
import { dayFileName, headerLine, localTime, recordColumns, rowDue, rowLine } from "./recording";

const label = (v: Variable) => v.name || `HR ${v.address}`;

function dashboardOf(...panels: Panel[]) {
  const dashboard = newDashboard("d", "Line 1");
  dashboard.panels = panels;
  return dashboard;
}

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0) =>
  new Date(y, mo - 1, d, h, mi, s, ms).getTime();

describe("recordColumns", () => {
  it("has one column per location, in panel order, with the units the dashboard shows", () => {
    const flow = newVariable({ name: "Flow", address: 1 });
    const table = newPanel("t", "table", "Map", []);
    if (table.kind !== "table") throw new Error("table");
    table.rows = [{ ...newTableRow(flow), units: "m³/h" }, newTableRow(newVariable({ address: 2 }))];
    const value = newPanel("v", "value", "Level", []);
    if (value.kind !== "value") throw new Error("value");
    value.variable = newVariable({ name: "Level", address: 3 });
    value.unit = "%";
    const trend = newPanel("tr", "trend", "History", []);
    if (trend.kind !== "trend") throw new Error("trend");
    // The same location again, under another name: one column, the first name.
    trend.variables = [{ ...flow, name: "Flow again" }, value.variable];
    const columns = recordColumns(dashboardOf(table, value, trend), label);
    expect(columns.map((c) => c.header)).toEqual(["Flow [m³/h]", "HR 2", "Level [%]"]);
  });

  it("calls an unnamed variable by the title of the panel that shows only it", () => {
    const value = newPanel("v", "value", "Pressure", []);
    if (value.kind !== "value") throw new Error("value");
    value.variable = newVariable({ address: 2 });
    value.unit = "bar";
    const bars = newPanel("b", "bars", "Tanks", []);
    if (bars.kind !== "bars") throw new Error("bars");
    bars.variables = [newVariable({ address: 5 })];
    const lamp = newPanel("l", "lamp", " ", []);
    if (lamp.kind !== "lamp") throw new Error("lamp");
    lamp.variable = newVariable({ address: 6 });
    // A panel of several variables names none of them; a blank title names nothing.
    expect(recordColumns(dashboardOf(value, bars, lamp), label).map((c) => c.header)).toEqual([
      "Pressure [bar]",
      "HR 5",
      "HR 6",
    ]);
  });

  it("records nothing for a dashboard of buttons only", () => {
    expect(recordColumns(dashboardOf(newPanel("b", "button", "Go", [])), label)).toEqual([]);
  });
});

describe("rows", () => {
  it("writes a header with quoted names and a time column", () => {
    const columns = [{ variable: newVariable(), header: "Pressure, inlet [bar]" }];
    expect(headerLine(columns)).toBe('time,"Pressure, inlet [bar]"\n');
  });

  it("writes local time as spreadsheets read it, and empty cells for values not read", () => {
    const ms = at(2026, 3, 7, 9, 5, 4, 32);
    expect(localTime(ms)).toBe("2026-03-07 09:05:04.032");
    expect(rowLine(ms, [12.5, null, -3])).toBe("2026-03-07 09:05:04.032,12.5,,-3\n");
  });
});

describe("dayFileName", () => {
  it("names the file after the dashboard and the local day, with a copy number when needed", () => {
    expect(dayFileName("Line 1", at(2026, 12, 31, 23, 59, 59, 999))).toBe("Line 1_2026-12-31.csv");
    expect(dayFileName("Line 1", at(2027, 1, 1))).toBe("Line 1_2027-01-01.csv");
    expect(dayFileName("Line 1", at(2027, 1, 1), 2)).toBe("Line 1_2027-01-01_2.csv");
  });

  it("keeps the name to characters every file system accepts", () => {
    expect(dayFileName('Pump 3/4: "A"\t', at(2026, 1, 2))).toBe("Pump 3_4_ _A___2026-01-02.csv");
    expect(dayFileName("  ", at(2026, 1, 2))).toBe("dashboard_2026-01-02.csv");
  });
});

describe("rowDue", () => {
  it("starts with a row, then one per period, tolerating readings that arrive a little early", () => {
    expect(rowDue(null, 0, 1000)).toBe(true);
    expect(rowDue(0, 950, 1000)).toBe(true);
    // The other blocks of the same cycle arrive milliseconds later: no second row.
    expect(rowDue(950, 960, 1000)).toBe(false);
    expect(rowDue(950, 1449, 1000)).toBe(false);
    expect(rowDue(950, 1450, 1000)).toBe(true);
  });
});
