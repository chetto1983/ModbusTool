<script lang="ts">
  import { tick } from "svelte";
  import { save } from "@tauri-apps/plugin-dialog";
  import { writeTextFile } from "@tauri-apps/plugin-fs";
  import { hex, trafficCsv } from "../csv";
  import { notify, traffic, TRAFFIC_LIMIT } from "../state.svelte";
  import type { TrafficEvent } from "../api";

  let origin = $state<"all" | "master" | "slave">("all");
  let showInfo = $state(true);
  let search = $state("");
  let follow = $state(true);
  let body: HTMLDivElement;

  const visible = $derived(
    traffic.events.filter((e) => {
      if (origin !== "all" && e.origin !== origin) return false;
      if (!showInfo && e.direction === "info") return false;
      if (!search) return true;
      const text = `${e.peer} ${e.summary?.text ?? e.message ?? ""} ${hex(e.bytes)}`.toLowerCase();
      return text.includes(search.toLowerCase());
    }),
  );

  $effect(() => {
    void visible.length;
    if (follow) tick().then(() => body?.scrollTo({ top: body.scrollHeight }));
  });

  function onScroll() {
    follow = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
  }

  const time = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
  };

  const arrow = (e: TrafficEvent) => (e.direction === "tx" ? "→" : e.direction === "rx" ? "←" : "•");

  async function exportCsv() {
    const path = await save({ filters: [{ name: "CSV", extensions: ["csv"] }], defaultPath: "modbus-traffic.csv" });
    if (!path) return;
    try {
      await writeTextFile(path, trafficCsv(visible));
      notify("ok", `Exported ${visible.length} frames`);
    } catch (e) {
      notify("error", `Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
</script>

<section class="panel traffic" style="--i: 0">
  <header class="panel-head">
    <h2 class="panel-title">Traffic monitor</h2>
    <div class="segmented">
      {#each ["all", "master", "slave"] as const as o (o)}
        <button class:active={origin === o} onclick={() => (origin = o)}>{o}</button>
      {/each}
    </div>
    <label class="check"><input type="checkbox" bind:checked={showInfo} /> Status lines</label>
    <input class="search" placeholder="Filter: unit, function, bytes…" bind:value={search} />
    <span class="spacer"></span>
    <span class="data muted count">{visible.length} / {traffic.events.length} (max {TRAFFIC_LIMIT})</span>
    <button class="btn small" class:primary={traffic.paused} onclick={() => (traffic.paused = !traffic.paused)}>
      {traffic.paused ? "▶ Resume" : "❚❚ Pause"}
    </button>
    <button class="btn small" onclick={() => (traffic.events = [])}>Clear</button>
    <button class="btn small" disabled={visible.length === 0} onclick={exportCsv}>Export CSV</button>
  </header>
  <div class="cols">
    <span>Time</span><span>Origin</span><span></span><span>Peer</span><span>Description</span><span>Bytes</span>
  </div>
  <div class="body" bind:this={body} onscroll={onScroll}>
    {#each visible as e, i (i)}
      <div class="line {e.direction}" class:exception={e.summary?.exception != null}>
        <span class="muted">{time(e.timestampMs)}</span>
        <span class="origin">{e.origin}</span>
        <span class="dir">{arrow(e)}</span>
        <span class="peer" title={e.peer}>{e.peer}</span>
        <span class="desc">
          {#if e.summary?.unit != null}<b>U{e.summary.unit}</b>{/if}
          {e.summary?.text ?? e.message}
        </span>
        <span class="bytes" title={hex(e.bytes)}>{hex(e.bytes)}</span>
      </div>
    {:else}
      <p class="empty muted">Frames sent and received by the master and the slave appear here.</p>
    {/each}
  </div>
</section>

<style>
  .traffic {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .panel-head {
    flex-wrap: wrap;
  }
  .segmented {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .segmented button {
    all: unset;
    padding: 5px 11px;
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    cursor: pointer;
  }
  .segmented button.active {
    background: var(--signal);
    color: var(--signal-ink);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--ink-2);
  }
  .search {
    width: 240px;
    height: 28px;
  }
  .count {
    font-size: 11px;
  }
  .cols,
  .line {
    display: grid;
    grid-template-columns: 112px 58px 18px minmax(120px, 0.9fr) minmax(220px, 2fr) minmax(160px, 1.6fr);
    gap: 12px;
    padding: 0 14px;
    align-items: center;
  }
  .cols {
    height: 28px;
    font-family: var(--font-display);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-3);
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    font-family: var(--font-data);
    font-size: 11.5px;
  }
  .line {
    min-height: 26px;
    border-bottom: 1px solid var(--line-soft);
    content-visibility: auto;
    contain-intrinsic-size: auto 26px;
  }
  .line > span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .origin {
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--ink-3);
  }
  .tx .dir {
    color: var(--tx);
  }
  .rx .dir {
    color: var(--rx);
  }
  .info {
    color: var(--ink-2);
    background: color-mix(in srgb, var(--panel-2) 60%, transparent);
  }
  .info .dir {
    color: var(--signal);
  }
  .exception .desc {
    color: var(--danger);
  }
  .desc b {
    margin-right: 6px;
    color: var(--signal);
    font-weight: 500;
  }
  .bytes {
    color: var(--ink-3);
  }
  .empty {
    padding: 30px;
    text-align: center;
    font-family: var(--font-ui);
    font-size: 14px;
  }
</style>
