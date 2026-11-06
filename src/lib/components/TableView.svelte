<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import { variableLabel } from "../dashboardActions.svelte";
  import type { TablePanel } from "../dashboards";
  import { formatNumber } from "../i18n.svelte";
  import { variableStale, variableValue } from "../state.svelte";

  // A table panel (spec R6): one line per variable, its scaled value with the row's decimals and
  // units, dimmed while its read is old or failed.
  let { panel }: { panel: TablePanel } = $props();
</script>

<div class="scroll">
  <table>
    <thead>
      <tr><th>{m.table_name()}</th><th class="value">{m.table_value()}</th><th>{m.table_units()}</th></tr>
    </thead>
    <tbody>
      {#each panel.rows as row, i (i)}
        {@const value = variableValue(row.variable)}
        <tr class:stale={variableStale(row.variable)}>
          <td class="name" title={variableLabel(row.variable)}>{variableLabel(row.variable)}</td>
          <td class="value data">{value === null ? "—" : formatNumber(value, row.decimals)}</td>
          <td class="units">{row.units}</td>
        </tr>
      {:else}
        <tr><td colspan="3" class="muted">{m.panel_no_variable()}</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .scroll {
    height: 100%;
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    position: sticky;
    top: 0;
    padding: 4px 8px;
    background: var(--color-surface);
    color: var(--color-text-muted);
    font-weight: 600;
    text-align: left;
  }
  td {
    padding: 3px 8px;
    border-top: 1px solid var(--color-border);
  }
  .value {
    text-align: right;
  }
  .name {
    max-width: 0;
    width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .units {
    color: var(--color-text-muted);
  }
  .stale {
    opacity: 0.45;
  }
</style>
