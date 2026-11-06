import { describe, expect, it } from "vitest";
import { colourCss, colourValue, FIXED_COLOURS, isColour } from "./colors";

describe("variable colours", () => {
  it("accepts automatic, the fixed theme colours and a custom #rrggbb, nothing else", () => {
    for (const ok of [null, ...FIXED_COLOURS, "#1a2B3c"]) expect(isColour(ok), String(ok)).toBe(true);
    for (const bad of ["accent", "#abc", "#12345g", "red", 3, undefined])
      expect(isColour(bad), String(bad)).toBe(false);
  });

  it("draws a fixed colour from the theme, a custom one as is, none by its position", () => {
    expect(colourCss("danger", 0)).toBe("var(--color-danger)");
    expect(colourCss("#112233", 4)).toBe("#112233");
    expect(colourCss(null, 1)).toBe("var(--color-success)");
    expect(colourCss(null, FIXED_COLOURS.length)).toBe("var(--color-ring)");
  });

  it("reads a token's value from the page for a canvas", () => {
    document.documentElement.style.setProperty("--color-warning", "#fdd663");
    expect(colourValue("warning", 0)).toBe("#fdd663");
    expect(colourValue("#010203", 0)).toBe("#010203");
  });
});
