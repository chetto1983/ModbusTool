<script lang="ts">
  import LinkForm from "./LinkForm.svelte";
  import LinkPanel from "./LinkPanel.svelte";
  import PollList from "./PollList.svelte";
  import RegisterGrid from "./RegisterGrid.svelte";
  import TrendChart from "./TrendChart.svelte";
  import { app, master, toggleTrend } from "../state.svelte";
  import { connect, disconnect, isWritable, labelFor, readOnce, setLabel, writeValues } from "../masterActions.svelte";

  const config = $derived(app.project.master.config);
  const poll = $derived(app.project.master.polls.find((p) => p.id === master.selectedPoll) ?? null);
  const runtime = $derived(poll ? master.runtime[poll.id] : undefined);
  const bits = $derived(poll?.kind === "readCoils" || poll?.kind === "readDiscreteInputs");

  function age(ms: number | null | undefined): string {
    if (!ms) return "never";
    const seconds = Math.max(0, (Date.now() - ms) / 1000);
    return seconds < 1 ? "just now" : `${seconds.toFixed(0)} s ago`;
  }
</script>

<div class="master">
  <aside class="side">
    <LinkPanel title="Connection" active={master.connected}>
      <LinkForm bind:link={config.link} disabled={master.connected || master.busy} />
      <div class="grid-2">
        <label class="field">
          Timeout ms
          <input type="number" min="50" step="50" bind:value={config.timeoutMs} disabled={master.connected} />
        </label>
        <label class="field">
          Retries
          <input type="number" min="0" max="10" bind:value={config.retries} disabled={master.connected} />
        </label>
      </div>
      {#if master.connected}
        <div class="row">
          <span class="data muted endpoint">{master.endpoint}</span>
          <span class="spacer"></span>
          <button class="btn danger" onclick={disconnect}>Disconnect</button>
        </div>
      {:else}
        <button class="btn primary" disabled={master.busy} onclick={connect}>
          {master.busy ? "Connecting…" : "Connect"}
        </button>
      {/if}
      {#if master.error}<div class="error-line">{master.error}</div>{/if}
    </LinkPanel>
    <PollList />
  </aside>

  <section class="panel values" style="--i: 2">
    {#if poll}
      <header class="panel-head">
        <h2 class="panel-title">{poll.name}</h2>
        <span class="data muted">unit {poll.unit} · {poll.address}–{poll.address + poll.quantity - 1}</span>
        <span class="spacer"></span>
        <button class="btn small" disabled={!master.connected} onclick={() => readOnce(poll)}>Read once</button>
      </header>
      <div class="stats data">
        <span><b>{runtime?.stats.requests ?? 0}</b> req</span>
        <span class="ok"><b>{runtime?.stats.ok ?? 0}</b> ok</span>
        <span class="bad"><b>{runtime?.stats.errors ?? 0}</b> err</span>
        <span class="bad"><b>{runtime?.stats.timeouts ?? 0}</b> timeout</span>
        <span><b>{runtime?.stats.lastMs?.toFixed(1) ?? "—"}</b> ms</span>
        <span class="spacer"></span>
        <span class="muted">updated {age(runtime?.updatedMs)}</span>
      </div>
      {#if runtime?.error}<div class="error-line flush">{runtime.error}</div>{/if}
      <div class="grid-host">
        <RegisterGrid
          start={poll.address}
          values={runtime?.values ?? null}
          count={poll.quantity}
          {bits}
          dataType={poll.dataType}
          byteOrder={poll.byteOrder}
          editable={master.connected && isWritable(poll.kind)}
          labelFor={(address) => labelFor(poll, address)}
          onLabel={(address, label) => setLabel(poll, address, label)}
          onWrite={(address, registers) => writeValues(poll, address, registers)}
          trended={(offset) => master.trend.some((s) => s.key === `${poll.id}:${offset}`)}
          onTrend={(offset, label) => toggleTrend(poll.id, offset, `${poll.name} · ${label}`)}
        />
      </div>
    {:else}
      <div class="placeholder">
        <svg viewBox="0 0 120 40" aria-hidden="true"><path d="M2 30 H22 V10 H42 V30 H62 V10 H82 V30 H118" /></svg>
        <p>Connect to a device, then add a poll to watch its registers.</p>
      </div>
    {/if}
  </section>

  <section class="panel trend" style="--i: 3">
    <header class="panel-head">
      <h2 class="panel-title">Trend</h2>
      <span class="spacer"></span>
      {#if master.trend.length}
        <button class="btn small ghost" onclick={() => (master.trend = [])}>Clear</button>
      {/if}
    </header>
    <div class="trend-host"><TrendChart /></div>
  </section>
</div>

<style>
  .master {
    display: grid;
    grid-template-columns: 340px 1fr;
    grid-template-rows: 1fr 240px;
    gap: 14px;
    height: 100%;
    min-height: 0;
  }
  .side {
    grid-row: 1 / span 2;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    overflow: auto;
  }
  .endpoint {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .values {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .stats {
    display: flex;
    gap: 20px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--color-border);
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .stats b {
    color: var(--color-text);
    font-weight: 400;
  }
  .stats .ok b {
    color: var(--color-success);
  }
  .stats .bad b {
    color: var(--color-danger);
  }
  .error-line.flush {
    margin: 0;
    border-radius: 0;
  }
  .grid-host {
    flex: 1;
    min-height: 0;
  }
  .placeholder {
    flex: 1;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    color: var(--color-text-faint);
  }
  .placeholder svg {
    width: 180px;
    fill: none;
    stroke: var(--color-ring);
    stroke-width: 2.5;
    stroke-dasharray: 260;
    animation: draw 2.4s ease-in-out infinite alternate;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 260;
    }
  }
  .trend {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .trend-host {
    flex: 1;
    min-height: 0;
    padding: 6px 10px 10px;
  }
</style>
