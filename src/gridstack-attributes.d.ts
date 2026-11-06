// gridstack reads a grid item's position from gs-* attributes (gridstack 14 README, "DOM created
// items"); Svelte's element types do not know them.
// An empty export makes this file a module, which a module augmentation requires.
// oxlint-disable-next-line unicorn/require-module-specifiers
export {};

declare module "svelte/elements" {
  interface HTMLAttributes<T> {
    "gs-id"?: string;
    "gs-x"?: number;
    "gs-y"?: number;
    "gs-w"?: number;
    "gs-h"?: number;
    "gs-min-w"?: number;
    "gs-min-h"?: number;
  }
}
