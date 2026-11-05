<script lang="ts">
  import { decode, encode, EncodeError, registerCount, type ByteOrder, type DataType } from "../datatypes";

  interface Props {
    start: number;
    values: number[] | null;
    count: number;
    bits: boolean;
    dataType: DataType;
    byteOrder: ByteOrder;
    editable: boolean;
    labelFor: (address: number) => string;
    onLabel: (address: number, label: string) => void;
    onWrite: (address: number, registers: number[]) => Promise<void>;
    trended?: (offset: number) => boolean;
    onTrend?: (offset: number, label: string) => void;
  }

  let { start, values, count, bits, dataType, byteOrder, editable, labelFor, onLabel, onWrite, trended, onTrend }: Props =
    $props();

  const width = $derived(bits ? 1 : registerCount(dataType));
  const rows = $derived.by(() => {
    const out: { offset: number; address: number; registers: number[] | null }[] = [];
    for (let offset = 0; offset + width <= count; offset += width) {
      const registers = values ? values.slice(offset, offset + width) : null;
      out.push({ offset, address: start + offset, registers: registers?.length === width ? registers : null });
    }
    return out;
  });

  let editing = $state<number | null>(null);
  let draft = $state("");
  let editError = $state<string | null>(null);

  const hexWord = (w: number) => w.toString(16).toUpperCase().padStart(4, "0");
  const display = (registers: number[] | null) =>
    registers === null ? "—" : bits ? (registers[0] ? "ON" : "OFF") : decode(registers, dataType, byteOrder);

  function beginEdit(offset: number, registers: number[] | null) {
    if (!editable) return;
    editing = offset;
    editError = null;
    draft = registers ? display(registers) : "";
  }

  async function commit(address: number) {
    try {
      const registers = encode(draft, dataType, byteOrder);
      await onWrite(address, registers);
      editing = null;
    } catch (e) {
      editError = e instanceof EncodeError ? e.message : String(e);
    }
  }

  function keydown(event: KeyboardEvent, address: number) {
    if (event.key === "Enter") commit(address);
    if (event.key === "Escape") editing = null;
  }

  function focus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<div class="grid" role="table" aria-label="Registers">
  <div class="head" role="row">
    <span role="columnheader">Address</span>
    <span role="columnheader">Label</span>
    <span role="columnheader">{bits ? "Bit" : "Raw"}</span>
    <span role="columnheader" class="right">Value</span>
    <span role="columnheader"></span>
  </div>
  <div class="body">
    {#each rows as row (row.offset)}
      <div class="line" role="row" class:stale={row.registers === null}>
        <span class="addr" role="cell">{row.address}</span>
        <span role="cell">
          <input
            class="label"
            value={labelFor(row.address)}
            placeholder="—"
            spellcheck="false"
            onchange={(e) => onLabel(row.address, e.currentTarget.value)}
          />
        </span>
        <span class="raw" role="cell">
          {#if row.registers}
            {bits ? row.registers[0] : row.registers.map(hexWord).join(" ")}
          {/if}
        </span>
        <span class="value" role="cell">
          {#if bits}
            <button
              class="switch"
              class:on={row.registers?.[0] === 1}
              disabled={!editable || row.registers === null}
              aria-label="Toggle {row.address}"
              onclick={() => onWrite(row.address, [row.registers?.[0] ? 0 : 1])}
            >
              <i></i>{display(row.registers)}
            </button>
          {:else if editing === row.offset}
            <input
              class="edit"
              bind:value={draft}
              use:focus
              onkeydown={(e) => keydown(e, row.address)}
              onblur={() => (editing = null)}
            />
          {:else}
            {#key row.registers?.join()}
              <button class="cell" class:editable onclick={() => beginEdit(row.offset, row.registers)}>
                {display(row.registers)}
              </button>
            {/key}
          {/if}
        </span>
        <span role="cell">
          {#if onTrend}
            <button
              class="trend"
              class:active={trended?.(row.offset)}
              title="Plot in trend"
              aria-label="Plot {row.address}"
              onclick={() => onTrend(row.offset, labelFor(row.address) || String(row.address))}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 12 L5 6 L9 9 L15 2" /></svg>
            </button>
          {/if}
        </span>
      </div>
      {#if editing === row.offset && editError}
        <div class="edit-error">{editError}</div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .grid {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .head,
  .line {
    display: grid;
    grid-template-columns: 76px minmax(90px, 1fr) minmax(110px, 1.1fr) minmax(130px, 1.2fr) 34px;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
  }
  .head {
    height: 36px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-2);
  }
  .body {
    overflow: auto;
    flex: 1;
  }
  .line {
    height: 34px;
    border-bottom: 1px solid var(--color-border);
    font-family: var(--font-mono);
    font-size: 12.5px;
    content-visibility: auto;
    contain-intrinsic-size: auto 32px;
  }
  .line:hover {
    background: var(--color-surface-2);
  }
  .line.stale .value,
  .line.stale .raw {
    color: var(--color-text-faint);
  }
  .addr {
    color: var(--color-accent-text);
  }
  .raw {
    color: var(--color-text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .right,
  .value {
    text-align: right;
  }
  input.label {
    height: 28px;
    border-color: transparent;
    background: transparent;
    font-family: var(--font-sans);
    font-size: 13px;
    padding: 0 6px;
  }
  input.label:hover {
    border-color: var(--color-border);
  }
  .cell {
    all: unset;
    display: inline-block;
    min-width: 60px;
    padding: 2px 6px;
    border-radius: 6px;
    color: var(--color-text);
    animation: flash 900ms var(--motion-ease-out);
  }
  .cell.editable {
    cursor: text;
  }
  .cell.editable:hover {
    background: var(--color-accent-soft);
  }
  @keyframes flash {
    from {
      background: var(--color-accent);
      color: var(--color-on-accent);
    }
  }
  input.edit {
    height: 28px;
    text-align: right;
    font-family: var(--font-mono);
  }
  .edit-error {
    padding: 4px 14px 6px 100px;
    color: var(--color-danger);
    font-size: 12px;
  }
  .switch {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: var(--color-text-faint);
    font-size: 12px;
    font-weight: 600;
  }
  .switch:disabled {
    cursor: default;
  }
  .switch i {
    width: 26px;
    height: 14px;
    border-radius: 8px;
    background: var(--color-surface-3);
    border: 1px solid var(--color-border);
    position: relative;
    transition: background 150ms;
  }
  .switch i::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-text-faint);
    transition: transform 150ms, background 150ms;
  }
  .switch.on {
    color: var(--color-success);
  }
  .switch.on i {
    background: color-mix(in oklab, var(--color-success) 25%, transparent);
    border-color: var(--color-success);
  }
  .switch.on i::after {
    transform: translateX(12px);
    background: var(--color-success);
  }
  .trend {
    all: unset;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0.35;
  }
  .trend svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: var(--color-text-muted);
    stroke-width: 1.8;
  }
  .line:hover .trend,
  .trend.active {
    opacity: 1;
  }
  .trend.active svg {
    stroke: var(--color-ring);
  }
</style>
