<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import Modal from "./Modal.svelte";
  import PollForm from "./PollForm.svelte";
  import { app, master } from "../state.svelte";
  import { newPoll, READ_KINDS, removePoll, savePoll, startPoll, stopPoll } from "../masterActions.svelte";
  import type { PollConfig } from "../project";

  const polls = $derived(app.project.master.polls);

  // The poll being edited: a copy, applied by savePoll.
  let draft = $state<PollConfig | null>(null);
  const isNew = $derived(draft !== null && !polls.some((p) => p.id === draft?.id));

  const running = (id: string) => master.runtime[id]?.running ?? false;

  function status(id: string): "on" | "err" | "" {
    if (!running(id)) return "";
    return master.runtime[id].error ? "err" : "on";
  }

  async function save() {
    if (!draft) return;
    await savePoll(draft);
    draft = null;
  }

  async function remove() {
    if (!draft) return;
    await removePoll(draft.id);
    draft = null;
  }
</script>

<section class="panel polls" style="--i: 1">
  <header class="panel-head">
    <h2 class="panel-title">{m.polls_title()}</h2>
    <span class="spacer"></span>
    <button class="btn small" onclick={() => (draft = newPoll())}>{m.common_add()}</button>
  </header>

  <ul class="list">
    {#each polls as poll (poll.id)}
      <li class="item" class:active={poll.id === master.selectedPoll}>
        <button class="select" onclick={() => (master.selectedPoll = poll.id)}>
          <span class="led {status(poll.id)}"></span>
          <span class="name">{poll.name}</span>
          <span class="meta data">
            {READ_KINDS.find((k) => k.id === poll.kind)?.code} · U{poll.unit} · {poll.address}+{poll.quantity}
          </span>
        </button>
        {#if running(poll.id)}
          <button
            class="btn small ghost icon"
            aria-label={m.polls_stop_named({ name: poll.name })}
            onclick={() => stopPoll(poll.id)}>■</button
          >
        {:else}
          <button
            class="btn small ghost icon"
            aria-label={m.polls_start_named({ name: poll.name })}
            disabled={!master.connected}
            onclick={() => startPoll(poll)}>▶</button
          >
        {/if}
        <button
          class="btn small ghost icon"
          aria-label={m.polls_edit_named({ name: poll.name })}
          onclick={() => (draft = $state.snapshot(poll))}>✎</button
        >
      </li>
    {:else}
      <li class="empty muted">{m.polls_empty()}</li>
    {/each}
  </ul>
</section>

{#if draft}
  <Modal title={isNew ? m.polls_new() : m.polls_edit()} onsubmit={save} onclose={() => (draft = null)}>
    <PollForm bind:poll={draft} />
    {#snippet actions()}
      {#if !isNew}<button type="button" class="btn ghost" onclick={remove}>{m.common_delete()}</button>{/if}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => (draft = null)}>{m.common_cancel()}</button>
      <button type="submit" class="btn primary">{m.common_save()}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .polls {
    flex: none;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
    display: grid;
    gap: 2px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 4px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
  }
  .item:hover {
    background: var(--color-surface-2);
  }
  .item.active {
    background: var(--color-surface-2);
    border-color: var(--color-border);
  }
  .select {
    all: unset;
    box-sizing: border-box;
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: 8px 1fr;
    column-gap: 10px;
    row-gap: 2px;
    align-items: center;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .select:focus-visible {
    box-shadow: 0 0 0 2px var(--color-ring);
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    grid-column: 2;
    color: var(--color-text-faint);
    font-size: 12px;
  }
  .empty {
    padding: 14px 10px;
    font-size: 13px;
  }
</style>
