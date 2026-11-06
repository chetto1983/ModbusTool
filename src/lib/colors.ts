// Colours of dashboard variables (docs/superpowers/specs/2026-11-06-dashboards-design.md, D22): a
// fixed Aura token that follows the theme, a custom #rrggbb, or null for the automatic palette.

/** The fixed colours, as Aura token names (--color-<name>), in the automatic palette's order. */
export const FIXED_COLOURS = ["ring", "success", "warning", "danger", "text-muted"] as const;
export type FixedColour = (typeof FIXED_COLOURS)[number];

const HEX = /^#[0-9a-f]{6}$/i;

export const isColour = (v: unknown): boolean =>
  v === null || (typeof v === "string" && (HEX.test(v) || FIXED_COLOURS.includes(v as FixedColour)));

/** A CSS colour for a variable's colour, the automatic one by its position when it has none. */
export function colourCss(colour: string | null, index: number): string {
  if (colour !== null && HEX.test(colour)) return colour;
  const token = colour ?? FIXED_COLOURS[index % FIXED_COLOURS.length];
  return `var(--color-${token})`;
}

/** The same colour as a value a canvas can draw with: a token is read from the page's theme. */
export function colourValue(colour: string | null, index: number): string {
  const css = colourCss(colour, index);
  const token = /^var\((--[a-z-]+)\)$/.exec(css)?.[1];
  return token ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : css;
}
