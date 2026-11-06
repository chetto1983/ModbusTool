<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import { currentLocale } from "../i18n.svelte";
  import type { ComponentProps } from "svelte";
  import Gauge from "svelte-gauge";
  import type { ValuePanel } from "../dashboards";

  // A read value (already scaled by its variable), with its unit and optionally a 240° gauge; the warning and alarm
  // thresholds colour it with the Aura status tokens.
  let { panel, value, stale }: { panel: ValuePanel; value: number | null; stale: boolean } = $props();

  const level = $derived(
    value === null
      ? ""
      : panel.alarm !== null && value >= panel.alarm
        ? "danger"
        : panel.warn !== null && value >= panel.warn
          ? "warning"
          : "",
  );
  const format = (n: number) =>
    new Intl.NumberFormat(currentLocale(), {
      minimumFractionDigits: panel.decimals,
      maximumFractionDigits: panel.decimals,
    }).format(n);
  const text = $derived(value === null ? "—" : format(value));

  // The gauge (svelte-gauge): a 240° dial open at the bottom (its angles start at the bottom and run
  // clockwise), the warning and alarm zones drawn on the arc.
  const zones = $derived(
    [
      panel.warn === null ? null : { start: panel.warn, stop: panel.alarm ?? panel.max, color: "var(--color-warning)" },
      panel.alarm === null ? null : { start: panel.alarm, stop: panel.max, color: "var(--color-danger)" },
    ].filter((zone) => zone !== null && zone.start < zone.stop) as NonNullable<ComponentProps<Gauge>["segments"]>,
  );
  const COLOURS = { "": "var(--color-ring)", warning: "var(--color-warning)", danger: "var(--color-danger)" };
  // The needle stays on the dial: a value beyond either end rests at that end.
  const onDial = $derived(value === null ? undefined : Math.min(panel.max, Math.max(panel.min, value)));
</script>

{#snippet reading()}
  <div class="reading">
    <span class="number data">{text}</span>
    {#if panel.unit}<span class="unit">{panel.unit}</span>{/if}
  </div>
{/snippet}

<div class="value {level}" class:stale title={stale ? m.panel_stale() : undefined}>
  {#if panel.gauge && panel.max > panel.min}
    <div class="dial">
      <Gauge
        value={onDial}
        start={panel.min}
        stop={panel.max}
        startAngle={60}
        stopAngle={300}
        stroke={14}
        color={COLOURS[level]}
        segments={zones}
        labels={[format(panel.min), format(panel.max)]}
      >
        {@render reading()}
      </Gauge>
    </div>
  {:else}
    {@render reading()}
  {/if}
</div>

<style>
  .value {
    position: relative;
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--color-text);
  }
  .value.warning {
    color: var(--color-warning);
  }
  .value.danger {
    color: var(--color-danger);
  }
  .stale {
    opacity: 0.45;
  }
  .dial {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  /* A square as large as the panel allows, centred. */
  .dial :global(.gauge-container) {
    height: 100%;
    max-width: 100%;
    aspect-ratio: 1;
  }
  /* The zones keep the full width of the arc; the level runs thin over them. */
  .dial :global(.gauge-progress) {
    stroke-width: calc(var(--gauge-stroke) / 3);
  }
  /* Sized by the dial, not the page: the panel can be any size. */
  .dial {
    container-type: size;
  }
  .dial .number {
    font-size: 16cqmin;
  }
  .dial .unit {
    font-size: 7cqmin;
  }
  .dial :global(.gauge-background) {
    stroke: var(--color-surface-3);
    opacity: 1;
  }
  .dial :global(.gauge-slot-container) {
    display: grid;
    place-items: center;
  }
  .dial :global(.gauge-labels) {
    font-size: 11px;
    fill: var(--color-text-muted);
  }
  .dial :global(.gauge-pointer) {
    fill: var(--color-surface);
  }
  .reading {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .number {
    font-size: clamp(18px, 4vw, 34px);
    font-weight: 600;
  }
  .unit {
    font-size: 14px;
    color: var(--color-text-muted);
  }
</style>
