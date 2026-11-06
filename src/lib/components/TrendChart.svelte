<script lang="ts">
  import { untrack } from "svelte";
  import uPlot from "uplot";
  import "uplot/dist/uPlot.min.css";
  import { m } from "../../paraglide/messages.js";
  import { currentLocale } from "../i18n.svelte";
  import { app, history } from "../state.svelte";

  // Stepped lines of signals over the last `windowS` seconds, from the shared signal history.
  let { series, windowS, empty }: { series: { key: string; label: string }[]; windowS: number; empty: string } =
    $props();

  let host: HTMLDivElement;
  let plot: uPlot | null = null;
  let clock: Intl.DateTimeFormat;

  const PALETTE_VARS = ["--color-ring", "--color-success", "--color-warning", "--color-danger", "--color-text-muted"];

  function palette(): string[] {
    const style = getComputedStyle(document.documentElement);
    return PALETTE_VARS.map((v) => style.getPropertyValue(v).trim());
  }

  // The legend is rendered below the canvas, inside the same host.
  const LEGEND_HEIGHT = 30;
  const plotHeight = () => Math.max(80, host.clientHeight - LEGEND_HEIGHT);

  function data(): uPlot.AlignedData {
    if (series.length === 0) return [[]];
    // Series sample at different instants; join aligns them on a shared time axis.
    return uPlot.join(
      series.map((s) => [history[s.key]?.times ?? [], history[s.key]?.values ?? []] as uPlot.AlignedData),
    );
  }

  const stepped = uPlot.paths.stepped!({ align: 1 });
  // Tick steps in whole seconds: labels are HH:MM:SS, so finer steps would repeat a label.
  const CLOCK_STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

  function build() {
    clock = new Intl.DateTimeFormat(currentLocale(), {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    plot?.destroy();
    const colors = palette();
    const style = getComputedStyle(document.documentElement);
    const ink = style.getPropertyValue("--color-text-faint").trim();
    const grid = style.getPropertyValue("--color-border").trim();
    const axis: uPlot.Axis = {
      stroke: ink,
      grid: { stroke: grid, width: 1 },
      ticks: { stroke: grid, width: 1 },
      font: "11px Commit Mono, monospace",
    };
    plot = new uPlot(
      {
        width: host.clientWidth,
        height: plotHeight(),
        legend: { show: true },
        cursor: { drag: { x: true, y: false } },
        scales: {
          // The newest sample at the right edge, the chosen window to its left.
          x: {
            time: true,
            range: (_u, min, max) => (max == null ? [min, max] : [Math.max(min, max - windowS), max]),
          },
        },
        axes: [
          {
            ...axis,
            space: 90,
            incrs: CLOCK_STEPS_S,
            values: (_u, splits) => splits.map((t) => clock.format(t * 1000)),
          },
          { ...axis, size: 64 },
        ],
        series: [
          { label: m.trend_time(), value: (_u, t) => (t == null ? "--" : clock.format(t * 1000)) },
          ...series.map((s, i) => ({
            label: s.label,
            stroke: colors[i % colors.length],
            width: 1.8,
            spanGaps: true,
            // A polled value holds until the next sample: lines between samples would turn a
            // square wave sampled once per level into a triangle.
            paths: stepped,
            points: { show: false },
          })),
        ],
      },
      data(),
      host,
    );
  }

  // Rebuild when the series, the theme, the language or the window change; otherwise push new data.
  const signature = $derived([series.map((s) => s.key).join("|"), app.theme, currentLocale(), windowS].join(" "));
  $effect(() => {
    void signature;
    untrack(build);
    return () => {
      plot?.destroy();
      plot = null;
    };
  });

  $effect(() => {
    void series.map((s) => history[s.key]?.values.length);
    plot?.setData(data());
  });

  $effect(() => {
    const observer = new ResizeObserver(() => plot?.setSize({ width: host.clientWidth, height: plotHeight() }));
    observer.observe(host);
    return () => observer.disconnect();
  });
</script>

<div class="trend" bind:this={host}>
  {#if series.length === 0}
    <div class="empty"><p>{empty}</p></div>
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
    color: var(--color-text-faint);
  }
  .trend :global(.u-legend) {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .trend :global(.u-select) {
    background: var(--color-accent-soft);
  }
</style>
