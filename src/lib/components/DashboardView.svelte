<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import DashboardGrid from "./DashboardGrid.svelte";
  import Modal from "./Modal.svelte";
  import PanelBody from "./PanelBody.svelte";
  import PanelForm from "./PanelForm.svelte";
  import PanelFrame from "./PanelFrame.svelte";
  import {
    addDashboard,
    currentDashboard,
    dashboardUi,
    newPanelDraft,
    PANEL_TITLES,
    placePanels,
    removeDashboard,
    removePanel,
    renameDashboard,
    savePanel,
  } from "../dashboardActions.svelte";
  import { PANEL_KINDS, type Panel, type PanelKind } from "../dashboards";
  import { importMap } from "../mapActions.svelte";
  import { app } from "../state.svelte";

  const dashboard = $derived(currentDashboard());
  const fullscreen = $derived(dashboard?.panels.find((p) => p.id === dashboardUi.fullscreen) ?? null);

  // The panel being edited: a copy, applied by savePanel.
  let draft = $state<Panel | null>(null);
  const isNew = $derived(draft !== null && !dashboard?.panels.some((p) => p.id === draft?.id));
  // The dashboard name being typed: for a new one (id null) or a rename.
  let naming = $state<{ id: string | null; name: string } | null>(null);
  let deleting = $state(false);
  // The kind picker of "Add panel": a list of buttons, since WebKit fires no change event when a
  // <select> used as a menu is chosen again with the same option.
  let picking = $state(false);
  // The unit id of the device whose register map is imported; null while not asked.
  let mapUnit = $state<number | null>(null);

  function startNew() {
    naming = { id: null, name: m.dashboard_default_name({ number: app.project.dashboards.length + 1 }) };
  }

  function saveName() {
    if (!naming) return;
    if (naming.id === null) addDashboard(naming.name);
    else renameDashboard(naming.id, naming.name);
    naming = null;
  }

  function addPanel(kind: PanelKind) {
    picking = false;
    if (dashboard) draft = newPanelDraft(dashboard, kind);
  }

  function save() {
    if (dashboard && draft) savePanel(dashboard, draft);
    draft = null;
  }

  function remove() {
    if (dashboard && draft && !isNew) removePanel(dashboard, draft.id);
    draft = null;
  }
</script>

<div class="dashboards">
  <header class="toolbar">
    {#if dashboard}
      <select
        class="choose"
        aria-label={m.dashboard_select()}
        value={dashboard.id}
        onchange={(e) => (dashboardUi.selected = e.currentTarget.value)}
      >
        {#each app.project.dashboards as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
      </select>
      <button
        class="btn small ghost icon"
        aria-label={m.dashboard_rename()}
        onclick={() => (naming = { id: dashboard.id, name: dashboard.name })}>✎</button
      >
      <button class="btn small ghost icon" aria-label={m.dashboard_delete()} onclick={() => (deleting = true)}>✕</button
      >
    {/if}
    <button class="btn small" onclick={startNew}>{m.dashboard_new()}</button>
    <button class="btn small" onclick={() => (mapUnit = 1)}>{m.map_import()}</button>
    <span class="spacer"></span>
    {#if dashboard}
      {#if dashboardUi.editing}
        <label class="period">
          {m.dashboard_period()}
          <input type="number" min="50" max="3600000" step="50" required bind:value={dashboard.periodMs} />
        </label>
        <button class="btn small" onclick={() => (picking = true)}>{m.dashboard_add_panel()}</button>
      {/if}
      <button
        class="btn small"
        class:primary={dashboardUi.editing}
        onclick={() => (dashboardUi.editing = !dashboardUi.editing)}
        >{dashboardUi.editing ? m.dashboard_done() : m.dashboard_edit()}</button
      >
    {/if}
  </header>

  <div class="canvas">
    {#if !dashboard}
      <p class="muted hint">{m.dashboard_empty()}</p>
    {:else}
      {#if dashboard.panels.length === 0}<p class="muted hint">{m.dashboard_no_panels()}</p>{/if}
      {#key dashboard.id}
        <DashboardGrid
          panels={dashboard.panels}
          editing={dashboardUi.editing}
          onplace={(places) => placePanels(dashboard, places)}
        >
          {#snippet panel(item: Panel)}
            <PanelFrame
              title={item.title}
              editing={dashboardUi.editing}
              onedit={() => (draft = $state.snapshot(item))}
              ondelete={() => removePanel(dashboard, item.id)}
              onfullscreen={() => (dashboardUi.fullscreen = item.id)}
            >
              <PanelBody panel={item} />
            </PanelFrame>
          {/snippet}
        </DashboardGrid>
      {/key}
    {/if}
  </div>
</div>

{#if fullscreen}
  <div class="backdrop" role="presentation" onclick={() => (dashboardUi.fullscreen = null)}></div>
  <PanelFrame
    title={fullscreen.title}
    editing={false}
    fullscreen
    onedit={() => {}}
    ondelete={() => {}}
    onfullscreen={() => (dashboardUi.fullscreen = null)}
  >
    <PanelBody panel={fullscreen} />
  </PanelFrame>
{/if}

{#if draft}
  <Modal
    title={isNew ? m.panel_new_title({ kind: PANEL_TITLES[draft.kind]() }) : m.panel_edit_title()}
    onsubmit={save}
    onclose={() => (draft = null)}
  >
    <PanelForm bind:panel={draft} />
    {#snippet actions()}
      {#if !isNew}<button type="button" class="btn ghost" onclick={remove}>{m.common_delete()}</button>{/if}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => (draft = null)}>{m.common_cancel()}</button>
      <button type="submit" class="btn primary">{m.common_save()}</button>
    {/snippet}
  </Modal>
{/if}

{#if picking}
  <Modal title={m.dashboard_add_panel()} onsubmit={() => {}} onclose={() => (picking = false)}>
    <div class="kinds">
      {#each PANEL_KINDS as kind (kind)}
        <button type="button" class="btn" onclick={() => addPanel(kind)}>{PANEL_TITLES[kind]()}</button>
      {/each}
    </div>
    {#snippet actions()}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => (picking = false)}>{m.common_cancel()}</button>
    {/snippet}
  </Modal>
{/if}

{#if mapUnit !== null}
  <Modal
    title={m.map_import()}
    onsubmit={() => {
      const unit = mapUnit ?? 1;
      mapUnit = null;
      void importMap(unit);
    }}
    onclose={() => (mapUnit = null)}
  >
    <p class="muted">{m.map_import_help()}</p>
    <label class="field">{m.map_unit()}<input type="number" min="0" max="255" required bind:value={mapUnit} /></label>
    {#snippet actions()}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => (mapUnit = null)}>{m.common_cancel()}</button>
      <button type="submit" class="btn primary">{m.map_choose_file()}</button>
    {/snippet}
  </Modal>
{/if}

{#if naming}
  <Modal
    title={naming.id === null ? m.dashboard_new() : m.dashboard_rename()}
    onsubmit={saveName}
    onclose={() => (naming = null)}
  >
    <label class="field">{m.dashboard_name()}<input bind:value={naming.name} required /></label>
    {#snippet actions()}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => (naming = null)}>{m.common_cancel()}</button>
      <button type="submit" class="btn primary">{m.common_save()}</button>
    {/snippet}
  </Modal>
{/if}

{#if deleting && dashboard}
  <Modal
    title={m.dashboard_delete()}
    onsubmit={() => {
      removeDashboard(dashboard.id);
      deleting = false;
    }}
    onclose={() => (deleting = false)}
  >
    <p>{m.dashboard_delete_confirm({ name: dashboard.name })}</p>
    {#snippet actions()}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => (deleting = false)}>{m.common_no()}</button>
      <button type="submit" class="btn primary">{m.common_yes()}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .dashboards {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .choose {
    width: auto;
    min-width: 200px;
  }
  .period {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .period input {
    width: 9ch;
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .canvas {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .hint {
    margin: 24px 4px;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 19;
    background: color-mix(in oklab, var(--color-bg) 70%, transparent);
  }
</style>
