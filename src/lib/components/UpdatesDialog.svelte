<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import Modal from "./Modal.svelte";
  import { master, slave } from "../state.svelte";
  import { checkForUpdates, installUpdate, offered, postpone, setUpdateMode, updates } from "../updates.svelte";

  const update = $derived(offered());
  const percent = $derived(updates.progress === null ? null : Math.round(updates.progress * 100));
</script>

{#if updates.mode === null}
  <Modal title={m.updates_ask_title()} onsubmit={() => setUpdateMode("auto")} onclose={() => setUpdateMode("manual")}>
    <p class="text">{m.updates_ask_body()}</p>
    {#snippet actions()}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => setUpdateMode("manual")}>{m.updates_no()}</button>
      <button type="submit" class="btn primary">{m.updates_yes()}</button>
    {/snippet}
  </Modal>
{:else if update}
  <Modal
    title={m.updates_available({ version: update.version })}
    onsubmit={installUpdate}
    onclose={() => !updates.installing && postpone()}
  >
    <p class="text muted">{m.updates_current({ version: update.currentVersion })}</p>
    {#if update.body}<div class="notes">{update.body}</div>{/if}
    {#if master.connected || slave.running}<p class="warning">{m.updates_stops_work()}</p>{/if}
    {#if updates.installing}
      <progress max="100" value={percent ?? undefined} aria-label={m.updates_downloading()}></progress>
    {/if}
    {#snippet actions()}
      <span class="spacer"></span>
      <button type="button" class="btn" disabled={updates.installing} onclick={postpone}>{m.updates_later()}</button>
      <button type="submit" class="btn primary" disabled={updates.installing}>
        {updates.installing ? m.updates_downloading() : m.updates_install()}
      </button>
    {/snippet}
  </Modal>
{:else if updates.settingsOpen}
  <Modal
    title={m.updates_title()}
    onsubmit={() => checkForUpdates(true)}
    onclose={() => (updates.settingsOpen = false)}
  >
    <p class="text muted">{m.updates_version({ version: updates.currentVersion })}</p>
    <label class="check">
      <input
        type="checkbox"
        checked={updates.mode === "auto"}
        onchange={(e) => setUpdateMode(e.currentTarget.checked ? "auto" : "manual")}
      />
      {m.updates_automatic()}
    </label>
    {#snippet actions()}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => (updates.settingsOpen = false)}>{m.common_close()}</button>
      <button type="submit" class="btn primary" disabled={updates.checking}>
        {updates.checking ? m.updates_checking() : m.updates_check_now()}
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  .text {
    margin: 0;
    line-height: 1.5;
  }
  .notes {
    max-height: 40vh;
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface-2);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .warning {
    margin: 0;
    color: var(--color-warning);
    font-size: 13px;
  }
  progress {
    width: 100%;
    accent-color: var(--color-accent);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .check input {
    width: auto;
    height: auto;
  }
</style>
