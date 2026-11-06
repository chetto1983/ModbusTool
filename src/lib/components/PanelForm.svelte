<script lang="ts">
  import { untrack } from "svelte";
  import { m } from "../../paraglide/messages.js";
  import ScalingFields from "./ScalingFields.svelte";
  import VariableFields from "./VariableFields.svelte";
  import { targetRegisters } from "../dashboardActions.svelte";
  import {
    INTERPOLATIONS,
    followTarget,
    newVariable,
    targetVariable,
    type Interpolation,
    type Panel,
    type Variable,
    type WriteTarget,
  } from "../dashboards";
  import { BYTE_ORDERS, DATA_TYPES } from "../datatypes";
  import { TREND_WINDOWS_S } from "../state.svelte";

  let { panel = $bindable() }: { panel: Panel } = $props();

  // A command whose state reads the location it writes keeps doing so when that location is edited.
  let previousTarget: WriteTarget | null = null;
  $effect(() => {
    if (panel.kind !== "switch" && panel.kind !== "select" && panel.kind !== "number") return;
    const command = panel;
    const target = $state.snapshot(command.target);
    untrack(() => {
      if (previousTarget) command.state = followTarget(command.state, previousTarget, target);
      previousTarget = target;
    });
  });

  /** A value to write must encode with the target's type, as the grid requires. */
  function checkValue(input: HTMLInputElement) {
    if (!("target" in panel)) return;
    try {
      targetRegisters(panel.target, input.value);
      input.setCustomValidity("");
    } catch (e) {
      input.setCustomValidity(e instanceof Error ? e.message : String(e));
    }
  }

  const INTERPOLATION_LABELS: Record<Interpolation, () => string> = {
    step: m.trend_step,
    linear: m.trend_linear,
    spline: m.trend_spline,
  };

  const windowLabel = (seconds: number) =>
    seconds < 60 ? m.trend_seconds({ count: seconds }) : m.trend_minutes({ count: seconds / 60 });
</script>

{#snippet variableList(variables: Variable[])}
  {#each variables as _, i (i)}
    <VariableFields bind:variable={variables[i]!} legend={m.panel_variable_number({ number: i + 1 })}>
      {#snippet actions()}
        <button
          type="button"
          class="btn small ghost icon"
          aria-label={m.panel_remove_variable()}
          disabled={variables.length === 1}
          onclick={() => variables.splice(i, 1)}>✕</button
        >
      {/snippet}
    </VariableFields>
  {/each}
  <button
    type="button"
    class="btn small"
    onclick={() => variables.push({ ...(variables.at(-1) ?? newVariable()), name: "" })}
    >{m.panel_add_variable()}</button
  >
{/snippet}

<label class="field">
  {m.panel_title()}
  <input bind:value={panel.title} required />
</label>

{#snippet valueInput(label: string, get: () => string, set: (value: string) => void)}
  <input
    aria-label={label}
    placeholder={label}
    bind:value={get, set}
    required
    oninput={(e) => checkValue(e.currentTarget)}
    onfocus={(e) => checkValue(e.currentTarget)}
  />
{/snippet}

{#if panel.kind === "trend"}
  {@render variableList(panel.variables)}
  <label class="field">
    {m.panel_window()}
    <select bind:value={panel.windowS}>
      {#each TREND_WINDOWS_S as seconds (seconds)}<option value={seconds}>{windowLabel(seconds)}</option>{/each}
    </select>
  </label>
  <label class="field">
    {m.trend_interpolation()}
    <select bind:value={panel.interpolation}>
      {#each INTERPOLATIONS as kind (kind)}<option value={kind}>{INTERPOLATION_LABELS[kind]()}</option>{/each}
    </select>
  </label>
{:else if panel.kind === "bars"}
  {@render variableList(panel.variables)}
{:else if panel.kind === "value"}
  <VariableFields bind:variable={panel.variable} legend={m.panel_variable()} />
  <div class="grid-3">
    <label class="field">{m.panel_unit()}<input bind:value={panel.unit} /></label>
    <label class="field">
      {m.panel_decimals()}<input type="number" min="0" max="10" required bind:value={panel.decimals} />
    </label>
  </div>
  <div class="grid-2">
    <label class="field">{m.panel_warn()}<input type="number" step="any" bind:value={panel.warn} /></label>
    <label class="field">{m.panel_alarm()}<input type="number" step="any" bind:value={panel.alarm} /></label>
  </div>
  <label class="check"><input type="checkbox" bind:checked={panel.gauge} /> {m.panel_gauge()}</label>
  {#if panel.gauge}
    <div class="grid-2">
      <label class="field">{m.panel_min()}<input type="number" step="any" required bind:value={panel.min} /></label>
      <label class="field">{m.panel_max()}<input type="number" step="any" required bind:value={panel.max} /></label>
    </div>
  {/if}
{:else if panel.kind === "lamp"}
  <VariableFields bind:variable={panel.variable} legend={m.panel_variable()} />
{:else}
  <div class="grid-3">
    <label class="field">
      {m.panel_write_unit()}<input type="number" min="0" max="255" required bind:value={panel.target.unit} />
    </label>
    <label class="field">
      {m.panel_write_table()}
      <select bind:value={panel.target.table} disabled={panel.kind === "switch" || panel.kind === "number"}>
        <option value="coils">Coils</option>
        <option value="holdingRegisters">Holding registers</option>
      </select>
    </label>
    <label class="field">
      {m.panel_write_address()}<input type="number" min="0" max="65535" required bind:value={panel.target.address} />
    </label>
  </div>
  {#if panel.kind !== "switch" && panel.target.table === "holdingRegisters"}
    <div class="grid-2">
      <label class="field">
        {m.common_type()}
        <select bind:value={panel.target.dataType}>
          {#each DATA_TYPES as type (type.id)}<option value={type.id}>{type.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        {m.common_order()}
        <select bind:value={panel.target.byteOrder}>
          {#each BYTE_ORDERS as order (order)}<option value={order}>{order}</option>{/each}
        </select>
      </label>
    </div>
  {/if}
  {#if panel.target.table === "holdingRegisters"}
    <ScalingFields bind:scaling={panel.target.scaling} type={panel.target.dataType} invertible />
  {/if}
  {#if panel.kind === "button"}
    {@const button = panel}
    <label class="field">
      {m.panel_write_value()}
      {@render valueInput(
        m.panel_write_value(),
        () => button.value,
        (value) => (button.value = value),
      )}
    </label>
    <label class="check"><input type="checkbox" bind:checked={panel.confirm} /> {m.panel_confirm()}</label>
  {:else}
    {#if panel.kind === "select"}
      <fieldset class="options">
        <legend>{m.panel_options()}</legend>
        {#each panel.options as option, i (i)}
          <div class="option">
            <input
              aria-label={m.panel_option_label()}
              placeholder={m.panel_option_label()}
              bind:value={option.label}
              required
            />
            {@render valueInput(
              m.panel_write_value(),
              () => option.value,
              (value) => (option.value = value),
            )}
            <button
              type="button"
              class="btn small ghost icon"
              aria-label={m.panel_remove_option()}
              disabled={panel.options.length === 1}
              onclick={() => panel.kind === "select" && panel.options.splice(i, 1)}>✕</button
            >
          </div>
        {/each}
        <button
          type="button"
          class="btn small"
          onclick={() => panel.kind === "select" && panel.options.push({ label: "", value: "" })}
          >{m.panel_add_option()}</button
        >
      </fieldset>
    {:else if panel.kind === "number"}
      <div class="grid-2">
        <label class="field">{m.panel_min()}<input type="number" step="any" bind:value={panel.min} /></label>
        <label class="field">{m.panel_max()}<input type="number" step="any" bind:value={panel.max} /></label>
      </div>
    {/if}
    {@const command = panel}
    <label class="check">
      <input
        type="checkbox"
        checked={command.state !== null}
        onchange={(e) => (command.state = e.currentTarget.checked ? targetVariable(command.target) : null)}
      />
      {m.panel_show_state()}
    </label>
    {#if command.state}
      <VariableFields bind:variable={command.state} legend={m.panel_state()} />
    {/if}
  {/if}
{/if}

<style>
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .check input {
    width: auto;
    height: auto;
  }
  .option {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    align-items: center;
    gap: 6px;
  }
  .options {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
</style>
