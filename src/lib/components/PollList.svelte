<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import { app, master } from "../state.svelte";
  import {
    addPoll,
    clearTrend,
    READ_KINDS,
    redefinePoll,
    removePoll,
    restartIfRunning,
    startPoll,
    stopPoll,
  } from "../masterActions.svelte";
  import { BYTE_ORDERS, DATA_TYPES } from "../datatypes";

  const polls = $derived(app.project.master.polls);
  const selected = $derived(polls.find((p) => p.id === master.selectedPoll) ?? null);
  const maxQuantity = $derived(
    selected?.kind === "readCoils" || selected?.kind === "readDiscreteInputs"
      ? 2000
      : app.project.master.config.link.kind === "tcp" || app.project.master.config.link.kind === "udp"
        ? 123
        : 125,
  );

  function status(id: string): "on" | "err" | "" {
    const runtime = master.runtime[id];
    if (!runtime?.running) return "";
    return runtime.error ? "err" : "on";
  }
</script>

<section class="panel polls" style="--i: 1">
  <header class="panel-head">
    <h2 class="panel-title">{m.polls_title()}</h2>
    <span class="spacer"></span>
    <button class="btn small" onclick={addPoll}>{m.common_add()}</button>
  </header>

  <ul class="list">
    {#each polls as poll (poll.id)}
      <li>
        <button
          class="item"
          class:active={poll.id === master.selectedPoll}
          onclick={() => (master.selectedPoll = poll.id)}
        >
          <span class="led {status(poll.id)}"></span>
          <span class="name">{poll.name}</span>
          <span class="meta data">
            {READ_KINDS.find((k) => k.id === poll.kind)?.code} · U{poll.unit} · {poll.address}+{poll.quantity}
          </span>
        </button>
      </li>
    {:else}
      <li class="empty muted">{m.polls_empty()}</li>
    {/each}
  </ul>

  {#if selected}
    <div class="editor panel-body">
      <label class="field">
        {m.polls_name()}
        <input bind:value={selected.name} />
      </label>
      <label class="field">
        {m.polls_function()}
        <select bind:value={selected.kind} onchange={() => redefinePoll(selected)}>
          {#each READ_KINDS as kind (kind.id)}
            <option value={kind.id}>{kind.code} · {kind.label}</option>
          {/each}
        </select>
      </label>
      <div class="grid-3">
        <label class="field">
          {m.common_unit()}
          <input type="number" min="0" max="255" bind:value={selected.unit} onchange={() => redefinePoll(selected)} />
        </label>
        <label class="field">
          {m.common_address()}
          <input
            type="number"
            min="0"
            max="65535"
            bind:value={selected.address}
            onchange={() => redefinePoll(selected)}
          />
        </label>
        <label class="field">
          {m.polls_quantity()}
          <input
            type="number"
            min="1"
            max={maxQuantity}
            bind:value={selected.quantity}
            onchange={() => restartIfRunning(selected)}
          />
        </label>
      </div>
      <div class="grid-3">
        <label class="field">
          {m.polls_every()}
          <input
            type="number"
            min="10"
            step="100"
            bind:value={selected.intervalMs}
            onchange={() => restartIfRunning(selected)}
          />
        </label>
        <label class="field">
          {m.common_type()}
          <select bind:value={selected.dataType} onchange={() => clearTrend(selected.id)}>
            {#each DATA_TYPES as type (type.id)}<option value={type.id}>{type.label}</option>{/each}
          </select>
        </label>
        <label class="field">
          {m.common_order()}
          <select bind:value={selected.byteOrder} onchange={() => clearTrend(selected.id)}>
            {#each BYTE_ORDERS as order (order)}<option value={order}>{order}</option>{/each}
          </select>
        </label>
      </div>
      <div class="row">
        {#if master.runtime[selected.id]?.running}
          <button class="btn danger" onclick={() => stopPoll(selected.id)}>{m.polls_stop()}</button>
        {:else}
          <button class="btn primary" disabled={!master.connected} onclick={() => startPoll(selected)}
            >{m.polls_start()}</button
          >
        {/if}
        <span class="spacer"></span>
        <button class="btn ghost small" onclick={() => removePoll(selected.id)}>{m.common_delete()}</button>
      </div>
    </div>
  {/if}
</section>

<style>
  /* Never shrunk by the sidebar: the editor would spill out of the panel. The sidebar scrolls. */
  .polls {
    flex: none;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
    overflow: auto;
    max-height: 220px;
  }
  .item {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: grid;
    grid-template-columns: 8px 1fr;
    column-gap: 10px;
    row-gap: 2px;
    align-items: center;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    cursor: pointer;
  }
  .item:hover {
    background: var(--color-surface-2);
  }
  .item.active {
    background: var(--color-surface-2);
    border-color: var(--color-border);
  }
  .name {
    font-weight: 600;
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
  .editor {
    display: grid;
    gap: 10px;
    border-top: 1px solid var(--color-border);
  }
</style>
