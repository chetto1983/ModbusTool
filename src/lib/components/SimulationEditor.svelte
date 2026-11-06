<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import Modal from "./Modal.svelte";
  import SimulationForm from "./SimulationForm.svelte";
  import { app } from "../state.svelte";
  import { newRule, removeRule, saveRule, simulationErrors, TABLES } from "../slaveActions.svelte";
  import { DATA_TYPES } from "../datatypes";
  import { SIMULATION_KINDS } from "../simulation";
  import type { SimulationRule } from "../project";

  let { unit, table, address }: { unit: number; table: (typeof TABLES)[number]["id"]; address: number } = $props();

  const rules = $derived(app.project.slave.simulations);

  // The generator being edited: a copy, applied by saveRule.
  let draft = $state<SimulationRule | null>(null);
  const isNew = $derived(draft !== null && !rules.some((r) => r.id === draft?.id));

  function summary(rule: SimulationRule): string {
    const target = TABLES.find((t) => t.id === rule.table)!;
    const type = target.bits ? "" : ` · ${DATA_TYPES.find((t) => t.id === rule.dataType)?.label}`;
    const kind = SIMULATION_KINDS.find((k) => k.id === rule.kind)?.label();
    return `U${rule.unit} · ${target.label} ${rule.address}${type} · ${kind}`;
  }

  function save() {
    if (!draft) return;
    saveRule(draft);
    draft = null;
  }

  function remove() {
    if (!draft) return;
    removeRule(draft.id);
    draft = null;
  }
</script>

<section class="panel sims" style="--i: 1">
  <header class="panel-head">
    <h2 class="panel-title">{m.sim_title()}</h2>
    <span class="spacer"></span>
    <button class="btn small" onclick={() => (draft = newRule(unit, table, address))} title={m.sim_add_hint()}
      >{m.common_add()}</button
    >
  </header>
  <ul class="list">
    {#each rules as rule, i (rule.id)}
      <li class="rule" class:off={!rule.enabled}>
        <input type="checkbox" bind:checked={rule.enabled} aria-label={m.common_enabled()} />
        <span class="what data">{summary(rule)}</span>
        <button
          class="btn small ghost icon"
          aria-label={m.sim_edit_named({ number: i + 1 })}
          onclick={() => (draft = $state.snapshot(rule))}>✎</button
        >
        {#if simulationErrors[rule.id]}<div class="error-line">{simulationErrors[rule.id]}</div>{/if}
      </li>
    {:else}
      <li class="muted empty">{m.sim_empty()}</li>
    {/each}
  </ul>
</section>

{#if draft}
  <Modal title={isNew ? m.sim_new() : m.sim_edit()} onsubmit={save} onclose={() => (draft = null)}>
    <SimulationForm bind:rule={draft} />
    {#snippet actions()}
      {#if !isNew}<button type="button" class="btn ghost" onclick={remove}>{m.common_delete()}</button>{/if}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => (draft = null)}>{m.common_cancel()}</button>
      <button type="submit" class="btn primary">{m.common_save()}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .sims {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .list {
    list-style: none;
    margin: 0;
    overflow: auto;
    padding: 6px;
    display: grid;
    gap: 2px;
  }
  .rule {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 4px 4px 4px 10px;
    border-left: 3px solid var(--color-ring);
    border-radius: var(--radius-sm);
  }
  .rule:hover {
    background: var(--color-surface-2);
  }
  .rule.off {
    border-left-color: var(--color-border);
  }
  .rule.off .what {
    color: var(--color-text-faint);
  }
  .rule input[type="checkbox"] {
    width: auto;
    height: auto;
  }
  .rule .error-line {
    grid-column: 1 / -1;
  }
  .what {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    padding: 14px 10px;
    font-size: 13px;
  }
</style>
