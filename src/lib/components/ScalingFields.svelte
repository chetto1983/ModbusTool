<script lang="ts">
  import { m } from "../../paraglide/messages.js";
  import type { DataType } from "../datatypes";
  import { defaultScaling, effectiveScaling, type Scaling } from "../scaling";

  // Two-point scaling of a variable or a write target (spec D16-D17), offered for numeric types.
  // A write target needs a span on the engineering side too, to turn a typed value back to raw.
  let {
    scaling = $bindable(),
    type,
    invertible = false,
  }: { scaling: Scaling | null; type: DataType | "bit"; invertible?: boolean } = $props();

  const scalable = $derived(effectiveScaling(defaultScaling(), type) !== null);

  /** Marks the second end of a side invalid when it equals the first. */
  function checkSpan(input: HTMLInputElement, other: number, needed: boolean) {
    input.setCustomValidity(needed && Number(input.value) === other ? m.scaling_same_ends() : "");
  }
</script>

{#if scalable}
  <label class="check">
    <input
      type="checkbox"
      checked={scaling !== null}
      onchange={(e) => (scaling = e.currentTarget.checked ? defaultScaling() : null)}
    />
    {m.scaling_enable()}
  </label>
  {#if scaling}
    <div class="grid-2">
      <label class="field"
        >{m.scaling_raw_min()}<input type="number" step="any" required bind:value={scaling.rawMin} /></label
      >
      <label class="field">
        {m.scaling_raw_max()}
        <input
          type="number"
          step="any"
          required
          bind:value={scaling.rawMax}
          oninput={(e) => scaling && checkSpan(e.currentTarget, scaling.rawMin, true)}
          onfocus={(e) => scaling && checkSpan(e.currentTarget, scaling.rawMin, true)}
        />
      </label>
      <label class="field"
        >{m.scaling_eng_min()}<input type="number" step="any" required bind:value={scaling.engMin} /></label
      >
      <label class="field">
        {m.scaling_eng_max()}
        <input
          type="number"
          step="any"
          required
          bind:value={scaling.engMax}
          oninput={(e) => scaling && checkSpan(e.currentTarget, scaling.engMin, invertible)}
          onfocus={(e) => scaling && checkSpan(e.currentTarget, scaling.engMin, invertible)}
        />
      </label>
    </div>
    <label class="check"><input type="checkbox" bind:checked={scaling.clamp} /> {m.scaling_clamp()}</label>
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
</style>
