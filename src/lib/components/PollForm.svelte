<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import { app } from "../state.svelte";
  import { READ_KINDS } from "../masterActions.svelte";
  import { BYTE_ORDERS, DATA_TYPES } from "../datatypes";
  import type { PollConfig } from "../project";

  let { poll = $bindable() }: { poll: PollConfig } = $props();

  // rmodbus caps a TCP/UDP frame at 255 bytes: 123 registers per read (README, Known limits).
  const maxQuantity = $derived(
    poll.kind === "readCoils" || poll.kind === "readDiscreteInputs"
      ? 2000
      : app.project.master.config.link.kind === "tcp" || app.project.master.config.link.kind === "udp"
        ? 123
        : 125,
  );
</script>

<label class="field">
  {m.polls_name()}
  <input bind:value={poll.name} required />
</label>
<label class="field">
  {m.polls_function()}
  <select bind:value={poll.kind}>
    {#each READ_KINDS as kind (kind.id)}
      <option value={kind.id}>{kind.code} · {kind.label}</option>
    {/each}
  </select>
</label>
<div class="grid-3">
  <label class="field">
    {m.common_unit()}
    <input type="number" min="0" max="255" required bind:value={poll.unit} />
  </label>
  <label class="field">
    {m.common_address()}
    <input type="number" min="0" max="65535" required bind:value={poll.address} />
  </label>
  <label class="field">
    {m.polls_quantity()}
    <input type="number" min="1" max={maxQuantity} required bind:value={poll.quantity} />
  </label>
</div>
<div class="grid-3">
  <label class="field">
    {m.polls_every()}
    <input type="number" min="10" step="10" required bind:value={poll.intervalMs} />
  </label>
  <label class="field">
    {m.common_type()}
    <select bind:value={poll.dataType}>
      {#each DATA_TYPES as type (type.id)}<option value={type.id}>{type.label}</option>{/each}
    </select>
  </label>
  <label class="field">
    {m.common_order()}
    <select bind:value={poll.byteOrder}>
      {#each BYTE_ORDERS as order (order)}<option value={order}>{order}</option>{/each}
    </select>
  </label>
</div>
