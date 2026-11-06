import { describe, expect, it } from "vitest";
import { bottom, newDashboard, newPanel, PANEL_KINDS, parseDashboards, type Dashboard } from "./dashboards";
import { defaultProject, parseProject, ProjectError, serializeProject } from "./project";

function dashboardWithEveryPanel(): Dashboard {
  const dashboard = newDashboard("d1", "Plant");
  PANEL_KINDS.forEach((kind, i) => dashboard.panels.push(newPanel(`p${i}`, kind, kind, bottom(dashboard))));
  return dashboard;
}

const withPanel = (change: (panel: Record<string, unknown>) => void, kind = PANEL_KINDS[0]) => {
  const dashboard = newDashboard("d", "D");
  const panel = newPanel("p", kind, "t", 0) as unknown as Record<string, unknown>;
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

  it("stacks new panels below the others", () => {
    const dashboard = dashboardWithEveryPanel();
    const ys = dashboard.panels.map((p) => p.place.y);
    expect(ys).toEqual(ys.toSorted((a, b) => a - b));
    expect(bottom(newDashboard("e", "E"))).toBe(0);
    const last = dashboard.panels.at(-1)!;
    expect(bottom(dashboard)).toBe(last.place.y + last.place.h);
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
    ];
    for (const [kind, change] of bad) {
      expect(() => parseDashboards(withPanel(change, kind as never)), kind).toThrow(ProjectError);
    }
  });

  it("accepts the optional parts set", () => {
    const valid = withPanel((p) => {
      p.signal = { pollId: "poll", offset: 3 };
      p.warn = 80;
      p.alarm = 95;
      p.gauge = true;
    }, "value");
    expect(parseDashboards(valid)).toEqual(valid);
  });
});
