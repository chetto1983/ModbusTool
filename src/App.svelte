<script lang="ts">
  import { onMount } from "svelte";
  import { m } from "./paraglide/messages.js";
  import { currentLocale, languageName, locales, setLanguage, type Locale } from "./lib/i18n.svelte";
  import MasterView from "./lib/components/MasterView.svelte";
  import SlaveView from "./lib/components/SlaveView.svelte";
  import TrafficView from "./lib/components/TrafficView.svelte";
  import DashboardView from "./lib/components/DashboardView.svelte";
  import UpdatesDialog from "./lib/components/UpdatesDialog.svelte";
  import { startUpdateChecks, updates } from "./lib/updates.svelte";
  import { api, onPollResults, onTraffic } from "./lib/api";
  import { startSimulationLoop } from "./lib/slaveActions.svelte";
  import { followReads, wantedReads } from "./lib/dashboardReads.svelte";
  import {
    app,
    applyPollResults,
    master,
    pushTraffic,
    setTheme,
    slave,
    traffic,
    watchUnexpectedErrors,
    type View,
  } from "./lib/state.svelte";
  import { fileName, openProject, saveProject } from "./lib/projectActions.svelte";

  const NAV: { id: View; label: () => string; glyph: string }[] = [
    { id: "master", label: m.nav_master, glyph: "M 3 12 H 7 V 5 H 12 V 12 H 17 V 5 H 21" },
    { id: "slave", label: m.nav_slave, glyph: "M 4 4 H 20 V 10 H 4 Z M 4 14 H 20 V 20 H 4 Z M 7 7 H 9 M 7 17 H 9" },
    {
      id: "dashboard",
      label: m.nav_dashboard,
      glyph: "M 4 4 H 11 V 11 H 4 Z M 13 4 H 20 V 8 H 13 Z M 13 10 H 20 V 20 H 13 Z M 4 13 H 11 V 20 H 4 Z",
    },
    { id: "traffic", label: m.nav_traffic, glyph: "M 3 7 H 17 L 14 4 M 21 17 H 7 L 10 20" },
  ];

  const status = (id: View) =>
    id === "master" ? master.connected : id === "slave" ? slave.running : id === "traffic" && traffic.events.length > 0;

  function shortcuts(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveProject(e.shiftKey);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
      e.preventDefault();
      openProject();
    }
  }

  // Dashboards read their variables while the master is connected, whatever the view (spec D14).
  $effect(() => {
    void followReads(wantedReads());
  });

  onMount(() => {
    setTheme(app.theme);
    api.slaveSetUnits($state.snapshot(app.project.slave.units));
    const stopSimulation = startSimulationLoop();
    const stopUpdateChecks = startUpdateChecks();
    const stopWatchingErrors = watchUnexpectedErrors();
    const listeners = [onTraffic(pushTraffic), onPollResults(applyPollResults)];
    window.addEventListener("keydown", shortcuts);
    return () => {
      window.removeEventListener("keydown", shortcuts);
      stopSimulation();
      stopUpdateChecks();
      stopWatchingErrors();
      listeners.forEach((l) => l.then((unlisten) => unlisten()));
    };
  });
</script>

<div class="shell">
  <nav class="side" aria-label={m.nav_sections()}>
    <div class="brand">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 16 H6 V8 H10 V16 H14 V8 H18 V16 H22" /></svg>
      <span>ModbusTool</span>
    </div>
    {#each NAV as item (item.id)}
      <button class="nav" aria-current={app.view === item.id ? "page" : undefined} onclick={() => (app.view = item.id)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.glyph} /></svg>
        <span>{item.label()}</span>
        <i
          class="led"
          class:on={status(item.id) && item.id !== "traffic"}
          class:warn={item.id === "traffic" && status(item.id)}
        ></i>
      </button>
    {/each}
    <span class="spacer"></span>
    <button class="nav" onclick={() => (updates.settingsOpen = true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 V15 M7 10 L12 15 L17 10 M5 20 H19" /></svg>
      <span>{m.updates_title()}</span>
      <i class="led on" class:hidden={!updates.available}></i>
    </button>
    <label class="nav language">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 A9 9 0 1 1 12 21 A9 9 0 1 1 12 3 M3 12 H21 M12 3 C8 8 8 16 12 21 M12 3 C16 8 16 16 12 21" />
      </svg>
      <select
        aria-label={m.language()}
        value={currentLocale()}
        onchange={(e) => setLanguage(e.currentTarget.value as Locale)}
      >
        {#each locales as locale (locale)}<option value={locale}>{languageName(locale)}</option>{/each}
      </select>
    </label>
    <button
      class="nav theme"
      title={m.theme_switch()}
      onclick={() => setTheme(app.theme === "dark" ? "light" : "dark")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {#if app.theme === "dark"}
          <path d="M20 14 A8 8 0 1 1 10 4 A6.5 6.5 0 0 0 20 14 Z" />
        {:else}
          <path
            d="M12 4 V2 M12 22 V20 M4 12 H2 M22 12 H20 M6 6 L4.5 4.5 M18 18 L19.5 19.5 M6 18 L4.5 19.5 M18 6 L19.5 4.5 M16 12 A4 4 0 1 1 8 12 A4 4 0 1 1 16 12"
          />
        {/if}
      </svg>
      <span>{app.theme === "dark" ? m.theme_dark() : m.theme_light()}</span>
    </button>
  </nav>

  <div class="main">
    <header class="top">
      <h1>{NAV.find((n) => n.id === app.view)?.label()}</h1>
      <span class="spacer"></span>
      <span class="file">{app.projectPath ? fileName(app.projectPath) : m.project_unsaved()}</span>
      <button class="btn small" onclick={openProject} title="Ctrl+O">{m.project_open()}</button>
      <button class="btn small" onclick={() => saveProject()} title="Ctrl+S">{m.project_save()}</button>
      <button class="btn small ghost" onclick={() => saveProject(true)} title="Ctrl+Shift+S"
        >{m.project_save_as()}</button
      >
    </header>
    <main class="content">
      {#if app.view === "master"}
        <MasterView />
      {:else if app.view === "slave"}
        <SlaveView />
      {:else if app.view === "dashboard"}
        <DashboardView />
      {:else}
        <TrafficView />
      {/if}
    </main>
  </div>

  <UpdatesDialog />

  {#if app.notice}
    <div class="notice {app.notice.kind}" role="status">{app.notice.text}</div>
  {/if}
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 15rem 1fr;
    height: 100%;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
    border-right: 1px solid var(--color-border);
    background: var(--color-surface);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 10px;
    margin-bottom: 12px;
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
  }
  .brand svg {
    width: 26px;
    fill: none;
    stroke: var(--color-ring);
    stroke-width: 2.4;
    stroke-linejoin: round;
  }
  .nav {
    all: unset;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-muted);
    transition:
      background var(--motion-fast),
      color var(--motion-fast);
  }
  .nav span {
    flex: 1;
  }
  .nav svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .nav:hover {
    background: var(--color-surface-2);
    color: var(--color-text);
  }
  .nav[aria-current="page"] {
    background: var(--color-surface-2);
    color: var(--color-text);
  }
  .nav:focus-visible {
    box-shadow: 0 0 0 2px var(--color-ring);
  }
  .language select {
    flex: 1;
    height: 32px;
    border-color: transparent;
    background-color: transparent;
    color: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .nav .led.hidden,
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
    min-height: 64px;
    padding: 0 24px;
    border-bottom: 1px solid var(--color-border);
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 600;
  }
  .file {
    margin-right: 8px;
    font-size: 13px;
    color: var(--color-text-faint);
  }
  .content {
    flex: 1;
    min-height: 0;
    padding: 20px 24px 24px;
  }
  .notice {
    position: fixed;
    right: 24px;
    bottom: 24px;
    max-width: 420px;
    padding: 12px 16px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface-2);
    box-shadow: var(--shadow-popover);
    animation: enter var(--motion-base) var(--motion-ease-out) both;
  }
  .notice.ok {
    border-color: var(--color-success);
  }
  .notice.error {
    border-color: var(--color-danger);
    background: color-mix(in oklab, var(--color-danger) 12%, var(--color-surface-2));
  }
</style>
