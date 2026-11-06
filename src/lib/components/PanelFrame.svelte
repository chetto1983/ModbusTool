<script lang="ts">
  import type { Snippet } from "svelte";
  import { m } from "../../paraglide/messages.js";

  // Grafana-style panel chrome (as in wpt-iot): a short header whose title is the drag handle in
  // edit mode, actions on the right, the body taking the rest.
  let {
    title,
    editing,
    fullscreen = false,
    onedit,
    ondelete,
    onfullscreen,
    children,
  }: {
    title: string;
    editing: boolean;
    fullscreen?: boolean;
    onedit: () => void;
    ondelete: () => void;
    onfullscreen: () => void;
    children: Snippet;
  } = $props();
</script>

<article class="panel frame" class:fullscreen>
  <header class:panel-drag={editing && !fullscreen}>
    <h3 {title}>{title}</h3>
    {#if editing && !fullscreen}
      <button class="btn small ghost icon" aria-label={m.panel_edit({ title })} onclick={onedit}>✎</button>
      <button class="btn small ghost icon" aria-label={m.panel_delete({ title })} onclick={ondelete}>✕</button>
    {:else}
      <button
        class="btn small ghost icon"
        aria-label={fullscreen ? m.panel_close({ title }) : m.panel_fullscreen({ title })}
        onclick={onfullscreen}>{fullscreen ? "✕" : "⤢"}</button
      >
    {/if}
  </header>
  <div class="body">{@render children()}</div>
</article>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    animation: none;
  }
  header {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 34px;
    padding: 2px 4px 2px 12px;
    border-bottom: 1px solid var(--color-border);
  }
  header.panel-drag {
    cursor: move;
  }
  h3 {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .body {
    flex: 1;
    min-height: 0;
    padding: 8px;
  }
  .fullscreen {
    position: fixed;
    inset: 24px;
    z-index: 20;
    height: auto;
    box-shadow: var(--shadow-popover);
  }
</style>
