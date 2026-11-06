<script lang="ts">
  import type { Snippet } from "svelte";

  // The link settings panel at the top of the master and slave sidebars; it folds away so the
  // panels below it get the height.
  let { title, active, children }: { title: string; active: boolean; children: Snippet } = $props();

  let open = $state(true);
  const bodyId = $props.id();
</script>

<section class="panel" style="--i: 0">
  <header class="panel-head" class:closed={!open}>
    <h2 class="panel-title">
      <button class="toggle" class:open aria-expanded={open} aria-controls={bodyId} onclick={() => (open = !open)}
        >{title}</button
      >
    </h2>
    <span class="spacer"></span>
    <span class="led" class:on={active}></span>
  </header>
  {#if open}
    <div class="panel-body stack" id={bodyId}>{@render children()}</div>
  {/if}
</section>

<style>
  .panel-head.closed {
    border-bottom-color: transparent;
  }
  .toggle {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .toggle:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
  .toggle::before {
    content: "";
    width: 6px;
    height: 6px;
    border-right: 2px solid var(--color-text-muted);
    border-bottom: 2px solid var(--color-text-muted);
    transform: rotate(-45deg);
    transition: transform var(--motion-base) var(--motion-ease-out);
  }
  .toggle.open::before {
    transform: rotate(45deg);
  }
  .stack {
    display: grid;
    gap: 12px;
  }
</style>
