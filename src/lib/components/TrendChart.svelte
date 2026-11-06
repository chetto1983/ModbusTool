<script lang="ts">
  import { untrack } from "svelte";
  import uPlot from "uplot";
  import "uplot/dist/uPlot.min.css";
  import { m } from "../../paraglide/messages.js";
  import type { Interpolation } from "../dashboards";
  import { currentLocale } from "../i18n.svelte";
  import { colourValue } from "../colors";
  import { toEngineering, type Scaling } from "../scaling";
  import { app, history } from "../state.svelte";

  // Lines of signals over the last `windowS` seconds, from the shared signal history.
  let {
    series,
    windowS,
    empty,
    interpolation = "step",
  }: {
    /** History keys; samples are shown through `scaling` when given. */
    series: { key: string; label: string; scaling?: Scaling | null; colour?: string | null }[];
    windowS: number;
    empty: string;
    interpolation?: Interpolation;
  } = $props();

  let host: HTMLDivElement;
  let plot: uPlot | null = null;
  let clock: Intl.DateTimeFormat;

  // The legend is rendered below the canvas, inside the same host.
  const LEGEND_HEIGHT = 30;
  const plotHeight = () => Math.max(80, host.clientHeight - LEGEND_HEIGHT);

  function data(): uPlot.AlignedData {
    if (series.length === 0) return [[]];
    // Series sample at different instants; join aligns them on a shared time axis.
    return uPlot.join(
      series.map((s) => {
        const samples = history[s.key];
        const values = samples?.values.map((v) => toEngineering(v, s.scaling ?? null)) ?? [];
        return [samples?.times ?? [], values] as uPlot.AlignedData;
      }),
    );
  }

  // "step" holds a polled value until the next sample: straight lines would turn a square wave
  // sampled once per level into a triangle. "linear" and "spline" suit analogue values.
  const PATHS: Record<Interpolation, uPlot.Series.PathBuilder> = {
    step: uPlot.paths.stepped!({ align: 1 }),
    linear: uPlot.paths.linear!(),
    spline: uPlot.paths.spline!(),
  };
  // Tick steps in whole seconds: labels are HH:MM:SS, so finer steps would repeat a label.
  const CLOCK_STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

  // A window dragged on the chart (uPlot drag-to-zoom) holds while samples arrive, until it is
  // reset (button or double click) or falls out of the history, as the wpt-iot panels do.
  let zoomed = $state(false);

  function resetZoom() {
    zoomed = false;
    plot?.setData(data());
  }

  function build() {
    zoomed = false;
    clock = new Intl.DateTimeFormat(currentLocale(), {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    plot?.destroy();
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
        hooks: {
          // Fires with the dragged area just before uPlot zooms to it.
          setSelect: [(u) => (zoomed = zoomed || u.select.width > 0)],
          // The time window on screen, for whoever reads the page (the E2E checks the zoom holds).
          setScale: [
            (u, key) => {
              if (key !== "x") return;
              host.dataset.xMin = String(u.scales.x.min);
              host.dataset.xMax = String(u.scales.x.max);
            },
          ],
        },
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
            stroke: colourValue(s.colour ?? null, i),
            width: 1.8,
            spanGaps: true,
            paths: PATHS[interpolation],
            points: { show: false },
          })),
        ],
      },
      data(),
      host,
    );
    // uPlot zooms back out on a double click on the plot area.
    plot.over.addEventListener("dblclick", () => (zoomed = false));
  }

  // Rebuild when the series, the theme, the language or the window change; otherwise push new data.
  const signature = $derived(
    [
      series.map((s) => `${s.key}=${s.colour ?? ""}`).join("|"),
      app.theme,
      currentLocale(),
      windowS,
      interpolation,
    ].join(" "),
  );
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
    if (!plot) return;
    const next = data();
    const oldest = next[0][0];
    // A zoomed window wholly older than the history kept shows nothing: back to following.
    if (zoomed && oldest !== undefined && (plot.scales.x.max ?? oldest) < oldest) zoomed = false;
    plot.setData(next, !untrack(() => zoomed));
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
  {#if zoomed}
    <button type="button" class="btn small reset" onclick={resetZoom}>{m.trend_reset_zoom()}</button>
  {/if}
</div>

<style>
  .trend {
    position: relative;
    height: 100%;
    min-height: 160px;
    overflow: hidden;
  }
  .reset {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 1;
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
