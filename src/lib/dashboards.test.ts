import { describe, expect, it } from "vitest";
import {
  followTarget,
  freePlace,
  newDashboard,
  newPanel,
  newVariable,
  PANEL_KINDS,
  variableKey,
  type Dashboard,
} from "./dashboards";
import { parseDashboards as parseWithPolls } from "./dashboardsFile";
import { defaultScaling } from "./scaling";
import { defaultProject, parseProject, ProjectError, serializeProject, type PollConfig } from "./project";

const parseDashboards = (v: unknown) => parseWithPolls(v, []);

function dashboardWithEveryPanel(): Dashboard {
  const dashboard = newDashboard("d1", "Plant");
  PANEL_KINDS.forEach((kind, i) => dashboard.panels.push(newPanel(`p${i}`, kind, kind, dashboard.panels)));
  return dashboard;
}

const withPanel = (change: (panel: Record<string, unknown>) => void, kind = PANEL_KINDS[0]) => {
  const dashboard = newDashboard("d", "D");
  const panel = newPanel("p", kind, "t", []) as unknown as Record<string, unknown>;
  change(panel);
  dashboard.panels.push(panel as never);
  return [dashboard];
};

describe("dashboards", () => {
  it("every new panel survives a save and an open of the project", () => {
    const project = defaultProject();
    project.dashboards.push(dashboardWithEveryPanel());
    expect(parseProject(serializeProject(project)).dashboards).toEqual(project.dashboards);
  });

  it("opens projects saved before dashboards existed", () => {
    const old = { ...defaultProject() } as Record<string, unknown>;
    delete old.dashboards;
    expect(parseProject(JSON.stringify(old)).dashboards).toEqual([]);
  });

  it("puts new panels in the first free spot, row by row, without overlaps", () => {
    const dashboard = dashboardWithEveryPanel();
    // trend 6x4 at the top left, value 3x2 beside it, the 6x5 table under the value, then the
    // smaller panels in the first gaps, row by row.
    expect(dashboard.panels.map((p) => [p.place.x, p.place.y])).toEqual([
      [0, 0],
      [6, 0],
      [6, 2],
      [0, 4],
      [9, 0],
      [4, 4],
      [4, 6],
      [6, 7],
      [9, 7],
    ]);
    const places = dashboard.panels.map((p) => p.place);
    for (const a of places)
      for (const b of places)
        if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    expect(freePlace([], { w: 12, h: 1 })).toEqual({ x: 0, y: 0, w: 12, h: 1 });
  });

  it("rejects malformed dashboards with the reason", () => {
    expect(() => parseDashboards({})).toThrow(/dashboards/);
    expect(() => parseDashboards([{ id: 1, name: "x", panels: [] }])).toThrow(/dashboard id\/name/);
    expect(() => parseDashboards([{ id: "d", name: "x" }])).toThrow(/dashboard panels/);
    expect(() => parseDashboards([{ id: "d", name: "x", panels: [3] }])).toThrow(/panel must be an object/);
    expect(() => parseDashboards(withPanel((p) => (p.title = 4)))).toThrow(/panel id\/title/);
    expect(() => parseDashboards(withPanel((p) => (p.kind = "pie")))).toThrow(/panel kind pie/);
    expect(() => parseDashboards(withPanel((p) => (p.place = { x: 12, y: 0, w: 1, h: 1 })))).toThrow(/panel place/);
    expect(() => parseDashboards(withPanel((p) => (p.place = { x: 0, y: 0, w: 0, h: 1 })))).toThrow(/panel place/);
    expect(() => parseDashboards([{ ...newDashboard("d", "D"), periodMs: 10 }])).toThrow(/dashboard period/);
  });

  it("rejects settings that do not fit the panel kind", () => {
    const bad: [string, (p: Record<string, unknown>) => void][] = [
      ["trend", (p) => (p.variables = [{ ...newVariable(), table: "registers" }])],
      ["trend", (p) => (p.variables = [{ ...newVariable(), name: undefined }])],
      ["trend", (p) => (p.windowS = 0)],
      ["trend", (p) => (p.interpolation = "cubic")],
      ["value", (p) => (p.scale = Number.NaN)],
      ["value", (p) => (p.decimals = 11)],
      ["value", (p) => (p.warn = "high")],
      ["value", (p) => (p.variable = null)],
      ["value", (p) => (p.variable = { ...newVariable(), address: 70_000 })],
      ["bars", (p) => (p.variables = "all")],
      ["table", (p) => (p.rows = "all")],
      ["table", (p) => (p.rows = [{ variable: newVariable(), units: 1, decimals: 1 }])],
      ["table", (p) => (p.rows = [{ variable: newVariable(), units: "", decimals: 11 }])],
      ["table", (p) => (p.rows = [{ variable: { ...newVariable(), table: "registers" }, units: "", decimals: 1 }])],
      ["lamp", (p) => (p.variable = {})],
      ["button", (p) => (p.target = { ...(p.target as object), table: "inputRegisters" })],
      ["button", (p) => (p.target = { ...(p.target as object), dataType: "float16" })],
      ["button", (p) => (p.confirm = "yes")],
      ["switch", (p) => (p.target = null)],
      ["select", (p) => (p.options = [{ label: "On" }])],
      ["select", (p) => (p.options = "On=1")],
      ["select", (p) => (p.state = 0)],
      ["switch", (p) => (p.state = { ...newVariable(), byteOrder: "ZYXW" })],
      ["trend", (p) => (p.variables = [{ ...newVariable(), colour: "chartreuse" }])],
      ["value", (p) => (p.variable = { ...newVariable(), scaling: { ...defaultScaling(), rawMax: 0 } })],
      ["number", (p) => (p.target = { ...(p.target as object), scaling: { ...defaultScaling(), engMax: 0 } })],
      ["button", (p) => (p.target = { ...(p.target as object), scaling: { rawMin: 0 } })],
      ["number", (p) => (p.min = "0")],
      ["number", (p) => (p.max = Number.POSITIVE_INFINITY)],
      ["number", (p) => (p.target = {})],
    ];
    for (const [kind, change] of bad) {
      expect(() => parseDashboards(withPanel(change, kind as never)), kind).toThrow(ProjectError);
    }
  });

  it("draws trends saved before the interpolation choice in steps, as they were", () => {
    const old = withPanel((p) => delete p.interpolation, "trend");
    expect(parseDashboards(JSON.parse(JSON.stringify(old)))[0].panels[0]).toMatchObject({ interpolation: "step" });
    expect(newPanel("t", "trend", "T", [])).toMatchObject({ interpolation: "linear" });
  });

  it("accepts the optional parts set", () => {
    const valid = withPanel((p) => {
      p.warn = 80;
      p.alarm = 95;
      p.gauge = true;
    }, "value");
    expect(parseDashboards(valid)).toEqual(valid);
    const setpoint = withPanel((p) => Object.assign(p, { min: -10, max: 10.5, state: null }), "number");
    // A read-only variable may scale to a single value; a write target may not (it is inverted).
    const flat = withPanel(
      (p) => (p.variable = { ...newVariable(), scaling: { ...defaultScaling(), engMax: 0 } }),
      "lamp",
    );
    expect(parseDashboards(flat)).toEqual(flat);
    expect(parseDashboards(setpoint)).toEqual(setpoint);
  });

  it("reads each command's state at first from the location it writes", () => {
    const valve = newPanel("s", "switch", "Valve", []);
    if (valve.kind !== "switch") throw new Error(valve.kind);
    expect(valve.state).toEqual({ ...valve.target, name: "", colour: null });
  });

  it("moves a command's state with its target only while the state reads the written location", () => {
    const before = {
      unit: 1,
      table: "coils" as const,
      address: 0,
      dataType: "uint16" as const,
      byteOrder: "ABCD" as const,
      scaling: null,
    };
    const after = { ...before, address: 7 };
    const same = { ...newVariable({ table: "coils" }), name: "Valve", colour: "danger" };
    expect(followTarget(same, before, after)).toEqual({ ...same, address: 7 });
    const feedback = newVariable({ table: "discreteInputs", address: 3 });
    expect(followTarget(feedback, before, after)).toBe(feedback);
    expect(followTarget(null, before, after)).toBeNull();
  });

  it("keys a variable by what is read: not its name, and not the type of a bit", () => {
    const flow = newVariable({ unit: 2, address: 40, dataType: "float32", byteOrder: "CDAB" });
    expect(variableKey(flow)).toBe("2:holdingRegisters:40:float32:CDAB");
    expect(variableKey({ ...flow, name: "Flow" })).toBe(variableKey(flow));
    expect(variableKey({ ...flow, table: "coils" })).toBe("2:coils:40");
  });
});

const poll = (over: Partial<PollConfig>): PollConfig => ({
  id: "p",
  name: "Pumps",
  unit: 2,
  kind: "readHoldingRegisters",
  address: 100,
  quantity: 10,
  intervalMs: 500,
  dataType: "int32",
  byteOrder: "CDAB",
  ...over,
});

describe("dashboards saved by 3.2.0, read through the master's polls", () => {
  const polls = [poll({}), poll({ id: "c", kind: "readCoils", address: 8, dataType: "uint16", byteOrder: "ABCD" })];
  const place = { x: 0, y: 0, w: 2, h: 2 };
  const target = { unit: 2, table: "coils", address: 9, dataType: "uint16", byteOrder: "ABCD" };
  const saved = [
    {
      id: "d",
      name: "Plant",
      panels: [
        {
          id: "t",
          kind: "trend",
          title: "T",
          place,
          windowS: 60,
          signals: [
            { pollId: "p", offset: 2 },
            { pollId: "gone", offset: 0 },
          ],
        },
        {
          id: "v",
          kind: "value",
          title: "V",
          place,
          signal: { pollId: "p", offset: 0 },
          unit: "bar",
          scale: 1,
          offset: 0,
          decimals: 1,
          gauge: false,
          min: 0,
          max: 100,
          warn: null,
          alarm: null,
        },
        { id: "l", kind: "lamp", title: "L", place, signal: null },
        { id: "s", kind: "switch", title: "S", place, target, signal: { pollId: "c", offset: 1 } },
      ],
    },
  ];

  const valueWith = (scale: unknown, offset: unknown) => [
    {
      ...saved[0],
      panels: [{ ...saved[0].panels[1], scale, offset }],
    },
  ];

  it("turns every signal into the variable its poll read, and keeps the steps of the trends", () => {
    const [dashboard] = parseWithPolls(JSON.parse(JSON.stringify(saved)), polls);
    const pumps = {
      name: "",
      unit: 2,
      table: "holdingRegisters",
      dataType: "int32",
      byteOrder: "CDAB",
      scaling: null,
      colour: null,
    };
    expect(dashboard.periodMs).toBe(1000);
    expect(dashboard.panels).toEqual([
      {
        id: "t",
        kind: "trend",
        place,
        title: "T",
        windowS: 60,
        interpolation: "step",
        variables: [{ ...pumps, address: 102 }],
      },
      expect.objectContaining({ id: "v", variable: { ...pumps, address: 100 } }),
      { id: "l", kind: "lamp", title: "L", place, variable: newVariable() },
      {
        id: "s",
        kind: "switch",
        place,
        title: "S",
        target: { ...target, scaling: null },
        state: { ...target, name: "", scaling: null, colour: null },
      },
    ]);
  });

  it("opens a 3.2.0 project file whole", () => {
    const project = { ...defaultProject(), dashboards: saved };
    project.master.polls = polls;
    expect(parseProject(JSON.stringify(project)).dashboards[0].panels).toHaveLength(4);
  });

  it("turns a value panel's scale and offset into its variable's scaling", () => {
    const [scaled] = parseWithPolls(valueWith(2, 10), polls)[0].panels;
    expect(scaled).not.toHaveProperty("scale");
    expect(scaled).toMatchObject({
      variable: { scaling: { rawMin: 0, rawMax: 1, engMin: 10, engMax: 12, clamp: false } },
    });
    expect(parseWithPolls(valueWith(1, 0), polls)[0].panels[0]).toMatchObject({ variable: { scaling: null } });
    expect(() => parseWithPolls(valueWith("2", 0), polls)).toThrow(/value panel settings/);
  });

  it("rejects signals that are not a list instead of dropping them", () => {
    const broken = [{ ...saved[0], panels: [{ id: "b", kind: "bars", title: "B", place, signals: "broken" }] }];
    expect(() => parseWithPolls(broken, polls)).toThrow(/bars panel settings/);
  });
});
