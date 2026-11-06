<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import { currentLocale } from "../i18n.svelte";
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
  const text = $derived(
    value === null
      ? "—"
      : new Intl.NumberFormat(currentLocale(), {
          minimumFractionDigits: panel.decimals,
          maximumFractionDigits: panel.decimals,
        }).format(value),
  );

  // Gauge geometry: an arc of radius 40 around (50, 50), from 150° to 390° clockwise.
  const START = 150;
  const SWEEP = 240;
  const point = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return `${50 + 40 * Math.cos(radians)} ${50 + 40 * Math.sin(radians)}`;
  };
  const arc = (sweep: number) =>
    `M ${point(START)} A 40 40 0 ${sweep > 180 ? 1 : 0} 1 ${point(START + Math.max(sweep, 0.01))}`;
  const fraction = $derived(
    value === null || panel.max <= panel.min
      ? 0
      : Math.min(1, Math.max(0, (value - panel.min) / (panel.max - panel.min))),
  );
</script>

<div class="value {level}" class:stale title={stale ? m.panel_stale() : undefined}>
  {#if panel.gauge}
    <svg viewBox="0 0 100 86" aria-hidden="true">
      <path class="track" d={arc(SWEEP)} />
      {#if fraction > 0}<path class="level" d={arc(SWEEP * fraction)} />{/if}
    </svg>
  {/if}
  <div class="reading" class:over-gauge={panel.gauge}>
    <span class="number data">{text}</span>
    {#if panel.unit}<span class="unit">{panel.unit}</span>{/if}
  </div>
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
  svg {
    width: 100%;
    height: 100%;
    max-height: 100%;
  }
  path {
    fill: none;
    stroke-width: 9;
    stroke-linecap: round;
  }
  .track {
    stroke: var(--color-surface-3);
  }
  .level {
    stroke: var(--color-accent);
  }
  .warning .level {
    stroke: var(--color-warning);
  }
  .danger .level {
    stroke: var(--color-danger);
  }
  .reading {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .reading.over-gauge {
    position: absolute;
    inset: 0;
    justify-content: center;
    align-items: center;
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
