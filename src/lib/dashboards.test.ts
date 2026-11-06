import { describe, expect, it } from "vitest";
import { freePlace, newDashboard, newPanel, PANEL_KINDS, parseDashboards, type Dashboard } from "./dashboards";
import { defaultProject, parseProject, ProjectError, serializeProject } from "./project";

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
    // trend 6x4 at the top left, then value 3x2 and bars... fill the rest of the 12 columns.
    expect(dashboard.panels.map((p) => [p.place.x, p.place.y])).toEqual([
      [0, 0],
      [6, 0],
      [6, 2],
      [9, 0],
      [10, 2],
      [0, 4],
      [2, 4],
      [0, 6],
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
  });

  it("rejects settings that do not fit the panel kind", () => {
    const bad: [string, (p: Record<string, unknown>) => void][] = [
      ["trend", (p) => (p.signals = [{ pollId: "a", offset: -1 }])],
      ["trend", (p) => (p.windowS = 0)],
      ["trend", (p) => (p.interpolation = "cubic")],
      ["value", (p) => (p.scale = Number.NaN)],
      ["value", (p) => (p.decimals = 11)],
      ["value", (p) => (p.warn = "high")],
      ["value", (p) => (p.signal = { pollId: 3, offset: 0 })],
      ["bars", (p) => (p.signals = "all")],
      ["lamp", (p) => (p.signal = {})],
      ["button", (p) => (p.target = { ...(p.target as object), table: "inputRegisters" })],
      ["button", (p) => (p.target = { ...(p.target as object), dataType: "float16" })],
      ["button", (p) => (p.confirm = "yes")],
      ["switch", (p) => (p.target = null)],
      ["select", (p) => (p.options = [{ label: "On" }])],
      ["select", (p) => (p.options = "On=1")],
      ["select", (p) => (p.signal = 0)],
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
      p.signal = { pollId: "poll", offset: 3 };
      p.warn = 80;
      p.alarm = 95;
      p.gauge = true;
    }, "value");
    expect(parseDashboards(valid)).toEqual(valid);
    const setpoint = withPanel((p) => Object.assign(p, { min: -10, max: 10.5 }), "number");
    expect(parseDashboards(setpoint)).toEqual(setpoint);
  });
});
