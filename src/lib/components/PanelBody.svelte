<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import Modal from "./Modal.svelte";
  import TrendChart from "./TrendChart.svelte";
  import ValueView from "./ValueView.svelte";
  import { setpointRegisters, variableLabel, writeTarget } from "../dashboardActions.svelte";
  import type { Panel, SelectOption, SelectPanel, Variable } from "../dashboards";
  import { sameEngineering } from "../scaling";
  import { master, readKey, variableScaling, variableStale, variableValue } from "../state.svelte";

  let { panel }: { panel: Panel } = $props();

  const stale = (variable: Variable | null) => variable !== null && variableStale(variable);
  const valueOf = (variable: Variable | null) => (variable ? variableValue(variable) : null);

  let confirming = $state(false);
  let writing = $state(false);

  async function write(text: string): Promise<boolean> {
    if (!("target" in panel)) return false;
    writing = true;
    const written = await writeTarget(panel.target, text);
    writing = false;
    return written;
  }

  // A selector shows the option matching the read value; without a state variable, the last one written.
  let lastChosen = $state("");
  // Bumped after every write, to rebuild the <select>: WebKit sends no change event when the option
  // last chosen by the user is chosen again, even after the shown value changed (spec D9).
  let writes = $state(0);
  const chosen = (select: SelectPanel) => {
    if (select.state === null) return lastChosen;
    const read = valueOf(select.state);
    if (read === null) return "";
    const scaling = variableScaling(select.state);
    const matches = (o: SelectOption) => o.value.trim() !== "" && sameEngineering(Number(o.value), read, scaling);
    return select.options.find(matches)?.value ?? "";
  };

  async function choose(value: string) {
    if (await write(value)) lastChosen = value;
    writes++;
  }

  let setpoint = $state("");

  function checkSetpoint(input: HTMLInputElement) {
    if (panel.kind !== "number") return;
    try {
      setpointRegisters(panel, input.value);
      input.setCustomValidity("");
    } catch (e) {
      input.setCustomValidity(e instanceof Error ? e.message : String(e));
    }
  }

  function press() {
    if (panel.kind === "button" && panel.confirm) confirming = true;
    else if (panel.kind === "button") void write(panel.value);
  }

  const bars = $derived.by(() => {
    if (panel.kind !== "bars") return [];
    const values = panel.variables.map(variableValue);
    const largest = Math.max(1e-9, ...values.map((v) => Math.abs(v ?? 0)));
    return panel.variables.map((variable, i) => ({
      label: variableLabel(variable),
      value: values[i],
      stale: stale(variable),
      share: Math.abs(values[i] ?? 0) / largest,
    }));
  });
</script>

{#if panel.kind === "trend"}
  <TrendChart
    series={panel.variables.map((variable) => ({
      key: readKey(variable),
      label: variableLabel(variable),
      scaling: variableScaling(variable),
    }))}
    windowS={panel.windowS}
    interpolation={panel.interpolation}
    empty={m.panel_no_variable()}
  />
{:else if panel.kind === "value"}
  <ValueView {panel} value={valueOf(panel.variable)} stale={stale(panel.variable)} />
{:else if panel.kind === "bars"}
  <div class="bars">
    {#each bars as bar, i (i)}
      <div class="bar" class:stale={bar.stale}>
        <span class="label" title={bar.label}>{bar.label}</span>
        <span class="track"><i style:width="{bar.share * 100}%"></i></span>
        <span class="data number">{bar.value ?? "—"}</span>
      </div>
    {:else}
      <p class="muted">{m.panel_no_variable()}</p>
    {/each}
  </div>
{:else if panel.kind === "lamp"}
  <div class="centre" class:stale={stale(panel.variable)}>
    <span class="lamp" class:on={(valueOf(panel.variable) ?? 0) !== 0}></span>
  </div>
{:else if panel.kind === "button"}
  <div class="centre">
    <button
      class="btn primary command"
      disabled={!master.connected || writing}
      title={master.connected ? undefined : m.panel_needs_connection()}
      onclick={press}>{panel.title}</button
    >
  </div>
{:else if panel.kind === "switch"}
  {@const on = (valueOf(panel.state) ?? 0) !== 0}
  <div class="centre" class:stale={stale(panel.state)}>
    <button
      class="switch"
      class:on
      role="switch"
      aria-checked={on}
      aria-label={panel.title}
      disabled={!master.connected || writing}
      title={master.connected ? undefined : m.panel_needs_connection()}
      onclick={() => write(on ? "0" : "1")}
    >
      <i></i>{on ? m.switch_on() : m.switch_off()}
    </button>
  </div>
{:else if panel.kind === "select"}
  {@const shown = chosen(panel)}
  <div class="centre" class:stale={stale(panel.state)}>
    {#key `${shown}#${writes}`}
      <select
        class="command"
        aria-label={panel.title}
        value={shown}
        disabled={!master.connected || writing}
        title={master.connected ? undefined : m.panel_needs_connection()}
        onchange={(e) => choose(e.currentTarget.value)}
      >
        <option value="" disabled hidden>—</option>
        {#each panel.options as option, i (i)}<option value={option.value}>{option.label}</option>{/each}
      </select>
    {/key}
  </div>
{:else if panel.kind === "number"}
  <form
    class="centre setpoint"
    class:stale={stale(panel.state)}
    onsubmit={(e) => {
      e.preventDefault();
      void write(setpoint);
    }}
  >
    {#if panel.state}<span class="data number read">{valueOf(panel.state) ?? "—"}</span>{/if}
    <div class="row">
      <input
        aria-label={m.panel_setpoint()}
        inputmode="decimal"
        required
        bind:value={setpoint}
        oninput={(e) => checkSetpoint(e.currentTarget)}
        onfocus={(e) => checkSetpoint(e.currentTarget)}
      />
      <button
        class="btn primary"
        disabled={!master.connected || writing}
        title={master.connected ? undefined : m.panel_needs_connection()}>{m.panel_set()}</button
      >
    </div>
  </form>
{/if}

{#if confirming && panel.kind === "button"}
  <Modal
    title={panel.title}
    onsubmit={() => {
      confirming = false;
      void write(panel.kind === "button" ? panel.value : "");
    }}
    onclose={() => (confirming = false)}
  >
    <p>
      {m.panel_write_confirm({
        value: panel.value,
        table: panel.target.table,
        address: panel.target.address,
        unit: panel.target.unit,
      })}
    </p>
    {#snippet actions()}
      <span class="spacer"></span>
      <button type="button" class="btn" onclick={() => (confirming = false)}>{m.common_cancel()}</button>
      <button type="submit" class="btn primary">{m.panel_write()}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .centre {
    display: grid;
    place-items: center;
    height: 100%;
  }
  .stale {
    opacity: 0.45;
  }
  .lamp {
    width: min(64px, 70%);
    aspect-ratio: 1;
    border: 2px solid var(--color-border-strong);
    border-radius: 50%;
    background: var(--color-surface-3);
  }
  .lamp.on {
    border-color: var(--color-success);
    background: var(--color-success);
    box-shadow: 0 0 0 6px color-mix(in oklab, var(--color-success) 22%, transparent);
  }
  .command {
    min-width: 60%;
    min-height: 44px;
  }
  select.command {
    width: auto;
    max-width: 100%;
  }
  .setpoint {
    align-content: center;
    gap: 6px;
  }
  .setpoint .row {
    flex-wrap: nowrap;
  }
  .setpoint input {
    width: 10ch;
  }
  .read {
    font-size: 22px;
  }
  .switch {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    font-weight: 600;
    cursor: pointer;
  }
  .switch:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .switch:focus-visible {
    box-shadow: 0 0 0 2px var(--color-ring);
  }
  .switch i {
    width: 34px;
    height: 18px;
    border-radius: var(--radius-pill);
    background: var(--color-surface-3);
    position: relative;
  }
  .switch i::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-text-muted);
    transition: transform var(--motion-fast);
  }
  .switch.on i {
    background: var(--color-success);
  }
  .switch.on i::after {
    transform: translateX(16px);
    background: var(--color-on-accent);
  }
  .bars {
    display: grid;
    gap: 6px;
    align-content: start;
    height: 100%;
    overflow: auto;
  }
  .bar {
    display: grid;
    grid-template-columns: minmax(60px, 35%) 1fr auto;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .label {
    overflow: hidden;
    color: var(--color-text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track {
    height: 10px;
    border-radius: var(--radius-pill);
    background: var(--color-surface-3);
    overflow: hidden;
  }
  .track i {
    display: block;
    height: 100%;
    background: var(--color-accent);
  }
  .number {
    min-width: 5ch;
    text-align: right;
  }
</style>
