<script lang="ts">
  import type { Snippet } from "svelte";

  // Mounted means open. The native <dialog> opened with showModal() traps focus, makes the page
  // behind it inert and closes on Esc (the "cancel" event, handed to onclose).
  let {
    title,
    onsubmit,
    onclose,
    children,
    actions,
  }: { title: string; onsubmit: () => void; onclose: () => void; children: Snippet; actions: Snippet } = $props();

  let dialog: HTMLDialogElement;
  const titleId = $props.id();

  $effect(() => {
    dialog.showModal();
    return () => dialog.close();
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onsubmit();
  }

  function cancel(event: Event) {
    event.preventDefault();
    onclose();
  }
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} oncancel={cancel}>
  <form onsubmit={submit}>
    <header class="panel-head">
      <h2 class="panel-title" id={titleId}>{title}</h2>
    </header>
    <div class="panel-body body">{@render children()}</div>
    <footer class="row">{@render actions()}</footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(440px, calc(100vw - 32px));
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-popover);
  }
  dialog::backdrop {
    background: color-mix(in oklab, var(--color-bg) 70%, transparent);
  }
  .body {
    display: grid;
    gap: 10px;
  }
  footer {
    padding: 0 16px 16px;
  }
</style>
