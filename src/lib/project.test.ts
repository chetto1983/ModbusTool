import { describe, expect, it } from "vitest";
import { ProjectError, defaultProject, labelKey, parseProject, serializeProject, type SimulationRule } from "./project";
import { registersUsed, simulatedRegisters, simulatedValue } from "./simulation";
import { decode } from "./datatypes";

describe("project files", () => {
  it("round-trips", () => {
    const project = defaultProject();
    project.master.polls.push({
      id: "a",
      name: "Boiler",
      unit: 1,
      kind: "readHoldingRegisters",
      address: 4100,
      quantity: 10,
      intervalMs: 1000,
      dataType: "float32",
      byteOrder: "CDAB",
    });
    project.labels[labelKey("master", 1, "holdingRegisters", 4100)] = "Temperature";
    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it("rejects broken or foreign files", () => {
    expect(() => parseProject("{")).toThrow(ProjectError);
    expect(() => parseProject('{"version":2}')).toThrow(/unsupported version/);
    const bad = defaultProject();
    bad.slave.units = [0];
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/units/);
    const badPoll = defaultProject() as unknown as { master: { polls: unknown[] } };
    badPoll.master.polls.push({
      id: "x",
      name: "y",
      unit: 1,
      address: 0,
      quantity: 0,
      intervalMs: 100,
      dataType: "uint16",
      byteOrder: "ABCD",
    });
    expect(() => parseProject(JSON.stringify(badPoll))).toThrow(/quantity/);
  });
});

const rule = (over: Partial<SimulationRule>): SimulationRule => ({
  id: "r",
  enabled: true,
  unit: 1,
  table: "holdingRegisters",
  address: 0,
  dataType: "uint16",
  byteOrder: "ABCD",
  kind: "increment",
  min: 0,
  max: 9,
  step: 4,
  periodMs: 100,
  ...over,
});

describe("simulation", () => {
  it("increments with wrap-around", () => {
    expect([0, 100, 200, 300].map((t) => simulatedValue(rule({}), t))).toEqual([0, 4, 8, 2]);
  });

  it("random stays in range and rounds integers", () => {
    expect(simulatedValue(rule({ kind: "random", min: 10, max: 20 }), 0, () => 0.55)).toBe(16);
    expect(simulatedValue(rule({ kind: "random", min: 0, max: 1, dataType: "float32" }), 0, () => 0.25)).toBe(0.25);
  });

  it("sine spans min..max", () => {
    const sine = rule({ kind: "sine", min: 0, max: 100 });
    const values = Array.from({ length: 20 }, (_, k) => simulatedValue(sine, k * 100));
    expect(Math.min(...values)).toBe(0);
    expect(Math.max(...values)).toBe(100);
  });

  it("toggles bits and encodes typed registers", () => {
    const coil = rule({ table: "coils", kind: "toggle", min: 0, max: 1 });
    expect([simulatedRegisters(coil, 0), simulatedRegisters(coil, 100)]).toEqual([[0], [1]]);
    expect(registersUsed(coil)).toBe(1);
    const float = rule({ kind: "toggle", min: 1.5, max: -2, dataType: "float32", byteOrder: "CDAB" });
    expect(decode(simulatedRegisters(float, 100), "float32", "CDAB")).toBe("-2");
    expect(registersUsed(float)).toBe(2);
  });

  it("degenerate range returns min", () => {
    expect(simulatedValue(rule({ min: 5, max: 4 }), 300)).toBe(5);
  });
});
