<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import { isBitTable, TABLES } from "../slaveActions.svelte";
  import { BYTE_ORDERS, DATA_TYPES } from "../datatypes";
  import { SIMULATION_KINDS } from "../simulation";
  import type { SimulationRule } from "../project";

  let { rule = $bindable() }: { rule: SimulationRule } = $props();
</script>

<label class="field">
  {m.sim_kind()}
  <select bind:value={rule.kind} disabled={isBitTable(rule.table)}>
    {#each SIMULATION_KINDS as kind (kind.id)}<option value={kind.id}>{kind.label()}</option>{/each}
  </select>
</label>
<div class="grid-3">
  <label class="field">
    {m.common_unit()}
    <input type="number" min="1" max="255" required bind:value={rule.unit} />
  </label>
  <label class="field">
    {m.sim_table()}
    <select bind:value={rule.table}>
      {#each TABLES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
    </select>
  </label>
  <label class="field">
    {m.common_address()}
    <input type="number" min="0" max="65535" required bind:value={rule.address} />
  </label>
</div>
{#if !isBitTable(rule.table)}
  <div class="grid-2">
    <label class="field">
      {m.common_type()}
      <select bind:value={rule.dataType}>
        {#each DATA_TYPES.filter((t) => t.id !== "ascii") as type (type.id)}
          <option value={type.id}>{type.label}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      {m.common_order()}
      <select bind:value={rule.byteOrder}>
        {#each BYTE_ORDERS as order (order)}<option value={order}>{order}</option>{/each}
      </select>
    </label>
  </div>
{/if}
<div class="grid-3">
  <label class="field">{m.sim_min()}<input type="number" step="any" required bind:value={rule.min} /></label>
  <label class="field">{m.sim_max()}<input type="number" step="any" required bind:value={rule.max} /></label>
  <label class="field">
    {m.sim_period()}
    <input type="number" min="50" step="50" required bind:value={rule.periodMs} />
  </label>
</div>
{#if rule.kind === "increment" && !isBitTable(rule.table)}
  <label class="field">{m.sim_step()}<input type="number" step="any" required bind:value={rule.step} /></label>
{/if}
