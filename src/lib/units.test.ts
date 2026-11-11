import { describe, expect, it } from "vitest";
import { parseUnits, runs } from "./units";

describe("unit lists", () => {
  it("parses lists and ranges", () => {
    expect(parseUnits("3, 1, 10-12, 3")).toEqual([1, 3, 10, 11, 12]);
    expect(parseUnits("255, 247-248")).toEqual([247, 248, 255]);
  });
  it("rejects invalid entries", () => {
    for (const bad of ["", "0", "256", "250-256", "1, 5-2", "a", "2, a", "2, 1-x"])
      expect(() => parseUnits(bad), bad).toThrow();
  });
});

describe("write runs", () => {
  it("groups consecutive addresses", () => {
    const entries = [5, 1, 2, 3, 7].map((address) => ({ address, value: address * 10 }));
    expect(runs(entries)).toEqual([
      { address: 1, values: [10, 20, 30] },
      { address: 5, values: [50] },
      { address: 7, values: [70] },
    ]);
  });
});
