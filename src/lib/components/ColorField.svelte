<script lang="ts">
  import { Color, ColorInput, type Position } from "color-picker-svelte";
  import { m } from "../../paraglide/messages.js";
  import { colourCss, FIXED_COLOURS, type FixedColour } from "../colors";

  // A variable's colour (spec D22): automatic, one of the fixed theme colours, or a custom one
  // picked with color-picker-svelte.
  let { colour = $bindable() }: { colour: string | null } = $props();

  const NAMES: Record<FixedColour, () => string> = {
    ring: m.colour_blue,
    success: m.colour_green,
    warning: m.colour_amber,
    danger: m.colour_red,
    "text-muted": m.colour_grey,
  };

  const isCustom = $derived(colour !== null && colour.startsWith("#"));
  // The picker edits a Color of its own; a change the user makes there becomes the custom colour.
  const start = new Color(colour?.startsWith("#") ? colour : "#4a90e2");
  let picked = $state(start);
  let shown = start.toHexString();
  // color-picker-svelte 2.0.4 always opens below on Position.Auto (ColorPicker's showAbove never
  // returns its result) and measures against the window, not the dialog the editor scrolls in:
  // above, then, when the dialog has no room for the picker (210 px plus its border) below.
  const PICKER_PX = 230;
  // Position is a const enum in the package's types (Above = 1, Below = 2 in its utils.js), which
  // verbatimModuleSyntax cannot import as a value.
  const ABOVE = 1 as Position;
  const BELOW = 2 as Position;
  let host: HTMLDivElement;
  let isOpen = $state(false);
  let position = $state(BELOW);
  $effect(() => {
    if (!isOpen) return;
    const box = host.getBoundingClientRect();
    const frame = host.closest("dialog")?.getBoundingClientRect() ?? { y: 0, height: window.innerHeight };
    const roomBelow = frame.y + frame.height - (box.y + box.height) >= PICKER_PX;
    position = !roomBelow && box.y - frame.y >= PICKER_PX ? ABOVE : BELOW;
  });

  $effect(() => {
    const hex = picked.toHexString();
    if (hex === shown) return;
    shown = hex;
    colour = hex;
  });
</script>

<div class="colour" role="radiogroup" aria-label={m.colour_label()}>
  <span class="label">{m.colour_label()}</span>
  <button
    type="button"
    class="swatch auto"
    role="radio"
    aria-checked={colour === null}
    aria-label={m.colour_auto()}
    title={m.colour_auto()}
    onclick={() => (colour = null)}>A</button
  >
  {#each FIXED_COLOURS as fixed (fixed)}
    <button
      type="button"
      class="swatch"
      role="radio"
      aria-checked={colour === fixed}
      aria-label={NAMES[fixed]()}
      title={NAMES[fixed]()}
      style:background={colourCss(fixed, 0)}
      onclick={() => (colour = fixed)}
    ></button>
  {/each}
  <div class="custom" class:selected={isCustom} bind:this={host}>
    <ColorInput bind:color={picked} bind:isOpen {position} title={m.colour_custom()} />
  </div>
</div>

<style>
  .colour {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .label {
    margin-right: 4px;
    font-size: 13px;
    font-weight: 600;
  }
  .swatch {
    all: unset;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 2px solid var(--color-border);
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .swatch[aria-checked="true"] {
    border-color: var(--color-text);
    box-shadow: 0 0 0 2px var(--color-ring);
  }
  .swatch:focus-visible {
    box-shadow: 0 0 0 2px var(--color-ring);
  }
  .custom {
    --picker-background: var(--color-surface-2);
    --input-width: 9.5rem;
    border-radius: var(--radius-sm);
  }
  .custom.selected {
    box-shadow: 0 0 0 2px var(--color-ring);
  }
  .custom :global(.input),
  .custom :global(.color-picker) {
    border-color: var(--color-border);
    color: var(--color-text);
  }
  .custom :global(input) {
    color: var(--color-text);
  }
</style>
