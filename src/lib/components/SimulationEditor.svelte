<script lang="ts">
  import { app } from "../state.svelte";
  import { isBitTable, newRule, simulationErrors, TABLES } from "../slaveActions.svelte";
  import { DATA_TYPES, BYTE_ORDERS } from "../datatypes";
  import type { SimulationKind } from "../project";

  let { unit, table, address }: { unit: number; table: (typeof TABLES)[number]["id"]; address: number } = $props();

  const KINDS: { id: SimulationKind; label: string }[] = [
    { id: "sine", label: "Sine" },
    { id: "increment", label: "Ramp" },
    { id: "random", label: "Random" },
    { id: "toggle", label: "Square" },
  ];

  const rules = $derived(app.project.slave.simulations);

  function add() {
    app.project.slave.simulations.push(newRule(unit, table, address));
  }

  function remove(id: string) {
    app.project.slave.simulations = rules.filter((r) => r.id !== id);
  }
</script>

<section class="panel sims" style="--i: 1">
  <header class="panel-head">
    <h2 class="panel-title">Simulation</h2>
    <span class="spacer"></span>
    <button class="btn small" onclick={add} title="Add a generator at the current table and address">+ Add</button>
  </header>
  <div class="list">
    {#each rules as rule (rule.id)}
      <article class="rule" class:off={!rule.enabled}>
        <div class="row">
          <input type="checkbox" bind:checked={rule.enabled} aria-label="Enabled" />
          <select class="kind" bind:value={rule.kind} disabled={isBitTable(rule.table)}>
            {#each KINDS as kind (kind.id)}<option value={kind.id}>{kind.label}</option>{/each}
          </select>
          <span class="spacer"></span>
          <button class="btn small ghost" onclick={() => remove(rule.id)} aria-label="Remove">✕</button>
        </div>
        <div class="grid-3">
          <label class="field">Unit<input type="number" min="1" max="247" bind:value={rule.unit} /></label>
          <label class="field">
            Table
            <select bind:value={rule.table}>
              {#each TABLES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
            </select>
          </label>
          <label class="field">Address<input type="number" min="0" max="65535" bind:value={rule.address} /></label>
        </div>
        {#if !isBitTable(rule.table)}
          <div class="grid-2">
            <label class="field">
              Type
              <select bind:value={rule.dataType}>
                {#each DATA_TYPES.filter((t) => t.id !== "ascii") as type (type.id)}
                  <option value={type.id}>{type.label}</option>
                {/each}
              </select>
            </label>
            <label class="field">
              Order
              <select bind:value={rule.byteOrder}>
                {#each BYTE_ORDERS as order (order)}<option value={order}>{order}</option>{/each}
              </select>
            </label>
          </div>
        {/if}
        <div class="grid-3">
          <label class="field">Min<input type="number" bind:value={rule.min} /></label>
          <label class="field">Max<input type="number" bind:value={rule.max} /></label>
          <label class="field">Period ms<input type="number" min="50" step="50" bind:value={rule.periodMs} /></label>
        </div>
        {#if rule.kind === "increment" && !isBitTable(rule.table)}
          <label class="field">Step<input type="number" bind:value={rule.step} /></label>
        {/if}
        {#if simulationErrors[rule.id]}<div class="error-line">{simulationErrors[rule.id]}</div>{/if}
      </article>
    {:else}
      <p class="muted empty">Generators write changing values into the slave tables: sine, ramp, random or square wave.</p>
    {/each}
  </div>
</section>

<style>
  .sims {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .list {
    overflow: auto;
    padding: 10px;
    display: grid;
    gap: 10px;
  }
  .rule {
    display: grid;
    gap: 9px;
    padding: 10px;
    border: 1px solid var(--line-soft);
    border-left: 3px solid var(--signal);
    border-radius: var(--radius-sm);
    background: var(--panel-2);
  }
  .rule.off {
    border-left-color: var(--line);
    opacity: 0.7;
  }
  .kind {
    width: 110px;
  }
  .empty {
    margin: 4px;
    font-size: 13px;
  }
</style>
