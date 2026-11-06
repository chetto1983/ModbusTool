import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { defaultScaling, effectiveScaling, isScaling, sameEngineering, toEngineering, toRaw } from "./scaling";

const span = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });
const scalings = fc
  .record({ rawMin: span, rawMax: span, engMin: span, engMax: span, clamp: fc.boolean() })
  .filter((s) => Math.abs(s.rawMax - s.rawMin) > 1e-3 && Math.abs(s.engMax - s.engMin) > 1e-3);

describe("scaling", () => {
  it("maps a 4-20 mA input of an S7 (0..27648) to 0..100 and back", () => {
    const s = defaultScaling();
    expect(toEngineering(13824, s)).toBe(50);
    expect(toRaw(50, s, "int16")).toBe(13824);
    expect(toRaw(12.3, s, "uint16")).toBe(3401);
    expect(toRaw(12.3, s, "float32")).toBeCloseTo(3400.704);
    expect(toEngineering(30000, s)).toBeCloseTo(108.507);
    expect(toEngineering(30000, { ...s, clamp: true })).toBe(100);
    expect(toRaw(-5, { ...s, clamp: true }, "int16")).toBe(0);
    expect(toEngineering(7, null)).toBe(7);
    expect(toRaw(7.5, null, "int16")).toBe(7.5);
  });

  it("clamps to the engineering range also when it runs downwards", () => {
    const falling = { rawMin: 0, rawMax: 10, engMin: 100, engMax: 0, clamp: true };
    expect(toEngineering(-1, falling)).toBe(100);
    expect(toEngineering(11, falling)).toBe(0);
  });

  it("gives back the raw value written for any engineering value it showed (float types)", () => {
    fc.assert(
      fc.property(scalings, span, (s, raw) => {
        const unclamped = { ...s, clamp: false };
        const back = toRaw(toEngineering(raw, unclamped), unclamped, "float64");
        expect(Math.abs(back - raw)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(raw)));
      }),
    );
  });

  it("rounds to a raw value that shows within half a raw step of what was typed", () => {
    fc.assert(
      fc.property(scalings, span, (s, typed) => {
        const unclamped = { ...s, clamp: false };
        const shown = toEngineering(toRaw(typed, unclamped, "int32"), unclamped);
        expect(sameEngineering(shown, typed, unclamped) || Math.abs(shown - typed) < 1e-6).toBe(true);
      }),
    );
  });

  it("scales numbers only, never bits, hex, binary or text", () => {
    const s = defaultScaling();
    expect(effectiveScaling(s, "float32")).toBe(s);
    for (const type of ["bit", "hex", "binary", "ascii"] as const) expect(effectiveScaling(s, type)).toBeNull();
    expect(sameEngineering(1, 1, null)).toBe(true);
    expect(sameEngineering(1, 1.0000001, null)).toBe(false);
  });

  it("accepts a scaling from a file only with a raw span, and an engineering one when inverted", () => {
    expect(isScaling(null, true)).toBe(true);
    expect(isScaling(defaultScaling(), true)).toBe(true);
    expect(isScaling({ ...defaultScaling(), rawMax: 0 }, false)).toBe(false);
    expect(isScaling({ ...defaultScaling(), engMax: 0 }, false)).toBe(true);
    expect(isScaling({ ...defaultScaling(), engMax: 0 }, true)).toBe(false);
    expect(isScaling({ ...defaultScaling(), clamp: "no" }, false)).toBe(false);
    expect(isScaling({ rawMin: 0 }, false)).toBe(false);
  });
});
