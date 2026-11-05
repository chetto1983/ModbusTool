<script lang="ts">
  import { app, master } from "../state.svelte";
  import { addPoll, READ_KINDS, removePoll, restartIfRunning, startPoll, stopPoll } from "../masterActions.svelte";
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
    <h2 class="panel-title">Polls</h2>
    <span class="spacer"></span>
    <button class="btn small" onclick={addPoll}>+ Add</button>
  </header>

  <ul class="list">
    {#each polls as poll (poll.id)}
      <li>
        <button class="item" class:active={poll.id === master.selectedPoll} onclick={() => (master.selectedPoll = poll.id)}>
          <span class="led {status(poll.id)}"></span>
          <span class="name">{poll.name}</span>
          <span class="meta data">
            {READ_KINDS.find((k) => k.id === poll.kind)?.code} · U{poll.unit} · {poll.address}+{poll.quantity}
          </span>
        </button>
      </li>
    {:else}
      <li class="empty muted">No polls yet. Add one to read a block of registers periodically.</li>
    {/each}
  </ul>

  {#if selected}
    <div class="editor panel-body">
      <label class="field">
        Name
        <input bind:value={selected.name} />
      </label>
      <label class="field">
        Function
        <select bind:value={selected.kind} onchange={() => restartIfRunning(selected)}>
          {#each READ_KINDS as kind (kind.id)}
            <option value={kind.id}>{kind.code} · {kind.label}</option>
          {/each}
        </select>
      </label>
      <div class="grid-3">
        <label class="field">
          Unit
          <input type="number" min="0" max="255" bind:value={selected.unit} onchange={() => restartIfRunning(selected)} />
        </label>
        <label class="field">
          Address
          <input type="number" min="0" max="65535" bind:value={selected.address} onchange={() => restartIfRunning(selected)} />
        </label>
        <label class="field">
          Quantity
          <input type="number" min="1" max={maxQuantity} bind:value={selected.quantity} onchange={() => restartIfRunning(selected)} />
        </label>
      </div>
      <div class="grid-3">
        <label class="field">
          Every ms
          <input type="number" min="10" step="100" bind:value={selected.intervalMs} onchange={() => restartIfRunning(selected)} />
        </label>
        <label class="field">
          Type
          <select bind:value={selected.dataType}>
            {#each DATA_TYPES as type (type.id)}<option value={type.id}>{type.label}</option>{/each}
          </select>
        </label>
        <label class="field">
          Order
          <select bind:value={selected.byteOrder}>
            {#each BYTE_ORDERS as order (order)}<option value={order}>{order}</option>{/each}
          </select>
        </label>
      </div>
      <div class="row">
        {#if master.runtime[selected.id]?.running}
          <button class="btn danger" onclick={() => stopPoll(selected.id)}>■ Stop</button>
        {:else}
          <button class="btn primary" disabled={!master.connected} onclick={() => startPoll(selected)}>▶ Start</button>
        {/if}
        <span class="spacer"></span>
        <button class="btn ghost small" onclick={() => removePoll(selected.id)}>Delete</button>
      </div>
    </div>
  {/if}
</section>

<style>
  .polls {
    display: flex;
    flex-direction: column;
    min-height: 0;
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
    background: var(--panel-2);
  }
  .item.active {
    border-color: var(--signal);
    background: var(--signal-soft);
  }
  .name {
    font-weight: 600;
  }
  .meta {
    grid-column: 2;
    color: var(--ink-3);
    font-size: 11px;
  }
  .empty {
    padding: 14px 10px;
    font-size: 13px;
  }
  .editor {
    display: grid;
    gap: 10px;
    border-top: 1px solid var(--line-soft);
  }
</style>
