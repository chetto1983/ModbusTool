<script lang="ts">
  import { untrack } from "svelte";
  import uPlot from "uplot";
  import "uplot/dist/uPlot.min.css";
  import { app, master } from "../state.svelte";

  let host: HTMLDivElement;
  let plot: uPlot | null = null;

  const PALETTE_VARS = ["--signal", "--tx", "--rx", "--danger", "--ink-2"];

  function palette(): string[] {
    const style = getComputedStyle(document.documentElement);
    return PALETTE_VARS.map((v) => style.getPropertyValue(v).trim());
  }

  function data(): uPlot.AlignedData {
    if (master.trend.length === 0) return [[]];
    // Series sample at different instants; join aligns them on a shared time axis.
    return uPlot.join(master.trend.map((s) => [s.times, s.values] as uPlot.AlignedData));
  }

  function build() {
    plot?.destroy();
    const colors = palette();
    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue("--ink-3").trim();
    const grid = style.getPropertyValue("--line-soft").trim();
    const axis: uPlot.Axis = {
      stroke: ink,
      grid: { stroke: grid, width: 1 },
      ticks: { stroke: grid, width: 1 },
      font: "11px Martian Mono, monospace",
    };
    plot = new uPlot(
      {
        width: host.clientWidth,
        height: host.clientHeight,
        legend: { show: true },
        cursor: { drag: { x: true, y: false } },
        scales: { x: { time: true } },
        axes: [axis, { ...axis, size: 64 }],
        series: [
          {},
          ...master.trend.map((s, i) => ({
            label: s.label,
            stroke: colors[i % colors.length],
            width: 1.8,
            spanGaps: true,
            points: { show: false },
          })),
        ],
      },
      data(),
      host,
    );
  }

  // Rebuild when the set of series or the theme changes; otherwise just push new data.
  const signature = $derived(master.trend.map((s) => s.key).join("|") + app.theme);
  $effect(() => {
    void signature;
    untrack(build);
    return () => {
      plot?.destroy();
      plot = null;
    };
  });

  $effect(() => {
    void master.trend.map((s) => s.values.length);
    plot?.setData(data());
  });

  $effect(() => {
    const observer = new ResizeObserver(() => plot?.setSize({ width: host.clientWidth, height: host.clientHeight }));
    observer.observe(host);
    return () => observer.disconnect();
  });
</script>

<div class="trend" bind:this={host}>
  {#if master.trend.length === 0}
    <div class="empty"><p>Click the ↗ icon next to a value to plot it here.</p></div>
  {/if}
</div>

<style>
  .trend {
    position: relative;
    height: 100%;
    min-height: 160px;
    overflow: hidden;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--ink-3);
  }
  .trend :global(.u-legend) {
    font-family: var(--font-data);
    font-size: 11px;
    color: var(--ink-2);
  }
  .trend :global(.u-select) {
    background: var(--signal-soft);
  }
</style>
