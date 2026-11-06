<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import type { SignalOption } from "../dashboardActions.svelte";
  import type { Signal } from "../dashboards";
  import { signalKey } from "../state.svelte";

  // A picker of the values the polls read; null means none chosen.
  let {
    signal = $bindable(),
    options,
    label,
    required = false,
  }: { signal: Signal | null; options: SignalOption[]; label: string; required?: boolean } = $props();

  function choose(key: string) {
    signal = options.find((o) => signalKey(o.signal) === key)?.signal ?? null;
  }
</script>

<label class="field">
  {label}
  <select value={signal ? signalKey(signal) : ""} {required} onchange={(e) => choose(e.currentTarget.value)}>
    <option value="">{m.panel_no_signal()}</option>
    {#each options as option (signalKey(option.signal))}
      <option value={signalKey(option.signal)}>{option.label}</option>
    {/each}
  </select>
</label>
