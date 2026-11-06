<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import LinkForm from "./LinkForm.svelte";
  import LinkPanel from "./LinkPanel.svelte";
  import RegisterGrid from "./RegisterGrid.svelte";
  import SimulationEditor from "./SimulationEditor.svelte";
  import { api, type Table } from "../api";
  import { app, slave } from "../state.svelte";
  import {
    applyUnits,
    exportCsv,
    importCsv,
    setSlaveLabel,
    slaveLabel,
    startSlave,
    stopSlave,
    TABLES,
  } from "../slaveActions.svelte";
  import { parseUnits } from "../units";
  import { BYTE_ORDERS, DATA_TYPES, type ByteOrder, type DataType } from "../datatypes";

  const REFRESH_MS = 300;

  const config = $derived(app.project.slave.config);
  let unitsText = $state(app.project.slave.units.join(", "));
  let unitsError = $state<string | null>(null);

  let unit = $state(app.project.slave.units[0] ?? 1);
  let table = $state<Table>("holdingRegisters");
  let start = $state(0);
  let count = $state(100);
  let dataType = $state<DataType>("uint16");
  let byteOrder = $state<ByteOrder>("ABCD");
  let values = $state<number[] | null>(null);
  let readError = $state<string | null>(null);

  const bits = $derived(TABLES.find((t) => t.id === table)!.bits);
  const safeCount = $derived(Math.max(1, Math.min(2000, count, 65536 - start)));

  async function commitUnits() {
    try {
      const units = parseUnits(unitsText);
      await applyUnits(units);
      unitsText = units.join(", ");
      unitsError = null;
      if (!units.includes(unit)) unit = units[0];
    } catch (e) {
      unitsError = e instanceof Error ? e.message : String(e);
    }
  }

  async function refresh() {
    try {
      values = await api.slaveRead(unit, table, start, safeCount);
      readError = null;
    } catch (e) {
      readError = String(e);
    }
  }

  // Values change from the master side and from simulations: refresh the visible window.
  $effect(() => {
    void [unit, table, start, safeCount];
    refresh();
    const timer = setInterval(() => refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  });

  async function write(address: number, registers: number[]) {
    await api.slaveWrite(unit, table, address, registers);
    await refresh();
  }

  async function importHere() {
    const first = await importCsv(unit, table);
    if (first !== null) start = first;
  }
</script>

<div class="slave">
  <aside class="side">
    <LinkPanel title={m.slave_listener()} active={slave.running}>
      <LinkForm bind:link={config.link} listening disabled={slave.running || slave.busy} />
      <div class="grid-2">
        <label class="field">
          {m.slave_unit_ids()}
          <input bind:value={unitsText} onchange={commitUnits} placeholder="1, 2, 10-12" />
        </label>
        <label class="field">
          {m.slave_delay()}
          <input type="number" min="0" max="10000" bind:value={config.delayMs} disabled={slave.running} />
        </label>
      </div>
      {#if unitsError}<div class="error-line">{unitsError}</div>{/if}
      {#if slave.running}
        <div class="row">
          <span class="data muted endpoint">{slave.endpoint}</span>
          <span class="spacer"></span>
          <button class="btn danger" disabled={slave.busy} onclick={stopSlave}>{m.slave_stop()}</button>
        </div>
      {:else}
        <button class="btn primary" disabled={slave.busy} onclick={startSlave}>{m.slave_start()}</button>
      {/if}
      {#if slave.error}<div class="error-line">{slave.error}</div>{/if}
    </LinkPanel>
    <SimulationEditor {unit} {table} address={start} />
  </aside>

  <section class="panel data-panel" style="--i: 2">
    <header class="panel-head tabs">
      {#each TABLES as t (t.id)}
        <button class="tab" class:active={table === t.id} onclick={() => (table = t.id)}>{t.label}</button>
      {/each}
      <span class="spacer"></span>
      <button class="btn small" onclick={importHere}>{m.common_import()}</button>
      <button class="btn small" onclick={() => exportCsv(unit, table, start, safeCount)}>{m.common_export()}</button>
    </header>
    <div class="toolbar">
      <label class="field">
        {m.common_unit()}
        <select bind:value={unit}>
          {#each app.project.slave.units as u (u)}<option value={u}>{u}</option>{/each}
        </select>
      </label>
      <label class="field">{m.slave_first()}<input type="number" min="0" max="65535" bind:value={start} /></label>
      <label class="field">{m.slave_count()}<input type="number" min="1" max="2000" bind:value={count} /></label>
      {#if !bits}
        <label class="field">
          {m.common_type()}
          <select bind:value={dataType}>
            {#each DATA_TYPES as type (type.id)}<option value={type.id}>{type.label}</option>{/each}
          </select>
        </label>
        <label class="field">
          {m.common_order()}
          <select bind:value={byteOrder}>
            {#each BYTE_ORDERS as order (order)}<option value={order}>{order}</option>{/each}
          </select>
        </label>
      {/if}
    </div>
    {#if readError}<div class="error-line flush">{readError}</div>{/if}
    <div class="grid-host">
      <RegisterGrid
        {start}
        {values}
        count={safeCount}
        {bits}
        {dataType}
        {byteOrder}
        editable
        labelFor={(address) => slaveLabel(unit, table, address)}
        onLabel={(address, label) => setSlaveLabel(unit, table, address, label)}
        onWrite={write}
      />
    </div>
  </section>
</div>

<style>
  .slave {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 14px;
    height: 100%;
    min-height: 0;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    overflow: auto;
  }
  .endpoint {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .data-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .tabs {
    gap: 4px;
    padding: 8px 10px;
  }
  .tab {
    all: unset;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .tab:hover {
    color: var(--color-text);
    background: var(--color-surface-2);
  }
  .tab.active {
    color: var(--color-on-accent);
    background: var(--color-accent);
  }
  .toolbar {
    display: grid;
    grid-template-columns: 90px 110px 100px 160px 100px;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }
  .error-line.flush {
    margin: 0;
    border-radius: 0;
  }
  .grid-host {
    flex: 1;
    min-height: 0;
  }
</style>
