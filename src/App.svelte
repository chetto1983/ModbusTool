<script lang="ts">
  import { onMount } from "svelte";
  import MasterView from "./lib/components/MasterView.svelte";
  import SlaveView from "./lib/components/SlaveView.svelte";
  import TrafficView from "./lib/components/TrafficView.svelte";
  import { api, onPollResults, onTraffic } from "./lib/api";
  import { startSimulationLoop } from "./lib/slaveActions.svelte";
  import { app, applyPollResults, master, pushTraffic, setTheme, slave, traffic, type View } from "./lib/state.svelte";
  import { fileName, openProject, saveProject } from "./lib/projectActions.svelte";

  const NAV: { id: View; label: string; glyph: string }[] = [
    { id: "master", label: "Master", glyph: "M 3 12 H 7 V 5 H 12 V 12 H 17 V 5 H 21" },
    { id: "slave", label: "Slave", glyph: "M 4 4 H 20 V 10 H 4 Z M 4 14 H 20 V 20 H 4 Z M 7 7 H 9 M 7 17 H 9" },
    { id: "traffic", label: "Traffic", glyph: "M 3 7 H 17 L 14 4 M 21 17 H 7 L 10 20" },
  ];

  const status = (id: View) =>
    id === "master" ? master.connected : id === "slave" ? slave.running : traffic.events.length > 0;

  onMount(() => {
    setTheme(app.theme);
    api.slaveSetUnits($state.snapshot(app.project.slave.units));
    const stopSimulation = startSimulationLoop();
    const listeners = [onTraffic(pushTraffic), onPollResults(applyPollResults)];
    const shortcuts = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject(e.shiftKey);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openProject();
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => {
      window.removeEventListener("keydown", shortcuts);
      stopSimulation();
      listeners.forEach((l) => l.then((unlisten) => unlisten()));
    };
  });
</script>

<div class="shell">
  <nav class="rail">
    <div class="brand" title="ModbusTool">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 16 H6 V8 H10 V16 H14 V8 H18 V16 H22" /></svg>
    </div>
    {#each NAV as item (item.id)}
      <button class="nav" class:active={app.view === item.id} onclick={() => (app.view = item.id)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.glyph} /></svg>
        <span>{item.label}</span>
        <i class="led" class:on={status(item.id) && item.id !== "traffic"} class:warn={item.id === "traffic" && status(item.id)}></i>
      </button>
    {/each}
    <span class="spacer"></span>
    <button
      class="nav theme"
      title="Switch theme"
      onclick={() => setTheme(app.theme === "dark" ? "light" : "dark")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {#if app.theme === "dark"}
          <path d="M20 14 A8 8 0 1 1 10 4 A6.5 6.5 0 0 0 20 14 Z" />
        {:else}
          <path d="M12 4 V2 M12 22 V20 M4 12 H2 M22 12 H20 M6 6 L4.5 4.5 M18 18 L19.5 19.5 M6 18 L4.5 19.5 M18 6 L19.5 4.5 M16 12 A4 4 0 1 1 8 12 A4 4 0 1 1 16 12" />
        {/if}
      </svg>
      <span>{app.theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  </nav>

  <div class="main">
    <header class="top">
      <h1>
        <span class="mark">ModbusTool</span>
        <span class="view">/ {app.view}</span>
      </h1>
      <span class="spacer"></span>
      <span class="file data">{app.projectPath ? fileName(app.projectPath) : "unsaved project"}</span>
      <button class="btn small" onclick={openProject} title="Ctrl+O">Open</button>
      <button class="btn small" onclick={() => saveProject()} title="Ctrl+S">Save</button>
      <button class="btn small ghost" onclick={() => saveProject(true)} title="Ctrl+Shift+S">Save as</button>
    </header>
    <main class="content">
      {#if app.view === "master"}
        <MasterView />
      {:else if app.view === "slave"}
        <SlaveView />
      {:else}
        <TrafficView />
      {/if}
    </main>
  </div>

  {#if app.notice}
    <div class="notice {app.notice.kind}" role="status">{app.notice.text}</div>
  {/if}
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 84px 1fr;
    height: 100%;
  }
  .rail {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 14px 8px;
    border-right: 1px solid var(--line);
    background: color-mix(in srgb, var(--panel) 85%, transparent);
    backdrop-filter: blur(6px);
  }
  .brand {
    display: grid;
    place-items: center;
    height: 48px;
    margin-bottom: 14px;
  }
  .brand svg {
    width: 34px;
    fill: none;
    stroke: var(--signal);
    stroke-width: 2.6;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 6px var(--signal-soft));
  }
  .nav {
    all: unset;
    position: relative;
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 11px 0 9px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--ink-3);
    font-family: var(--font-display);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    transition: color 120ms, background 120ms;
  }
  .nav svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .nav:hover {
    color: var(--ink);
    background: var(--panel-2);
  }
  .nav.active {
    color: var(--signal);
    background: var(--signal-soft);
  }
  .nav.active::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--signal);
  }
  .nav .led {
    position: absolute;
    top: 9px;
    right: 14px;
    width: 6px;
    height: 6px;
  }
  .nav .led:not(.on):not(.warn) {
    display: none;
  }
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 58px;
    padding: 0 20px;
    border-bottom: 1px solid var(--line-soft);
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .mark {
    color: var(--ink);
  }
  .view {
    color: var(--ink-3);
    font-weight: 500;
    text-transform: capitalize;
  }
  .file {
    margin-right: 8px;
    color: var(--ink-3);
    font-size: 11px;
  }
  .content {
    flex: 1;
    min-height: 0;
    padding: 16px 20px 20px;
  }
  .notice {
    position: fixed;
    right: 20px;
    bottom: 20px;
    max-width: 420px;
    padding: 11px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
    background: var(--panel-3);
    box-shadow: var(--shadow);
    animation: rise 260ms ease-out both;
  }
  .notice.ok {
    border-left: 3px solid var(--rx);
  }
  .notice.error {
    border-left: 3px solid var(--danger);
    color: var(--danger);
  }
</style>
