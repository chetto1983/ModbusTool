<script lang="ts">
  import type { Snippet } from "svelte";
  import { m } from "../../paraglide/messages.js";
  import type { Variable } from "../dashboards";
  import { BYTE_ORDERS, DATA_TYPES } from "../datatypes";
  import { isBitTable } from "../state.svelte";

  // Where a panel element reads its value (spec D13), in a fieldset named by `legend`.
  let { variable = $bindable(), legend, actions }: { variable: Variable; legend: string; actions?: Snippet } = $props();
</script>

<fieldset class="variable">
  <legend>{legend}</legend>
  <div class="row">
    <label class="field grow">{m.panel_variable_name()}<input bind:value={variable.name} /></label>
    {@render actions?.()}
  </div>
  <div class="grid-3">
    <label class="field">
      {m.panel_write_unit()}<input type="number" min="0" max="255" required bind:value={variable.unit} />
    </label>
    <label class="field">
      {m.panel_read_table()}
      <select bind:value={variable.table}>
        <option value="coils">Coils</option>
        <option value="discreteInputs">Discrete inputs</option>
        <option value="holdingRegisters">Holding registers</option>
        <option value="inputRegisters">Input registers</option>
      </select>
    </label>
    <label class="field">
      {m.panel_write_address()}<input type="number" min="0" max="65535" required bind:value={variable.address} />
    </label>
  </div>
  {#if !isBitTable(variable.table)}
    <div class="grid-2">
      <label class="field">
        {m.common_type()}
        <select bind:value={variable.dataType}>
          {#each DATA_TYPES as type (type.id)}<option value={type.id}>{type.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        {m.common_order()}
        <select bind:value={variable.byteOrder}>
          {#each BYTE_ORDERS as order (order)}<option value={order}>{order}</option>{/each}
        </select>
      </label>
    </div>
  {/if}
</fieldset>

<style>
  .variable {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  .row {
    align-items: end;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
</style>
