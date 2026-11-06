<script lang="ts">
  import { GridStack, type GridItemHTMLElement } from "gridstack";
  import "gridstack/dist/gridstack.min.css";
  import type { Snippet } from "svelte";
  import { GRID_COLUMNS, type Panel, type Place } from "../dashboards";

  // Svelte renders the panels; gridstack positions them and, in edit mode, lets them be dragged by
  // their .panel-drag header and resized. Moves come back through onplace.
  let {
    panels,
    editing,
    onplace,
    panel,
  }: {
    panels: Panel[];
    editing: boolean;
    onplace: (places: { id: string; place: Place }[]) => void;
    panel: Snippet<[Panel]>;
  } = $props();

  let host: HTMLDivElement;
  let grid: GridStack | null = null;

  $effect(() => {
    const created = GridStack.init(
      { column: GRID_COLUMNS, cellHeight: 72, margin: 6, staticGrid: true, handle: ".panel-drag", animate: true },
      host,
    );
    if (!created) return;
    grid = created;
    created.on("change", (_event, nodes) =>
      onplace(
        nodes.map((node) => ({
          id: String(node.id),
          place: { x: node.x ?? 0, y: node.y ?? 0, w: node.w ?? 1, h: node.h ?? 1 },
        })),
      ),
    );
    return () => {
      created.destroy(false);
      grid = null;
    };
  });

  $effect(() => {
    grid?.setStatic(!editing);
  });

  /** Panels added after the grid started are handed to it; removed ones are released. */
  function gridItem(element: HTMLElement) {
    if (grid && !(element as GridItemHTMLElement).gridstackNode) grid.makeWidget(element);
    return {
      destroy() {
        grid?.removeWidget(element as GridItemHTMLElement, false, false);
      },
    };
  }
</script>

<div class="grid-stack" class:editing bind:this={host}>
  {#each panels as item (item.id)}
    <div
      class="grid-stack-item"
      gs-id={item.id}
      gs-x={item.place.x}
      gs-y={item.place.y}
      gs-w={item.place.w}
      gs-h={item.place.h}
      gs-min-w={2}
      gs-min-h={2}
      use:gridItem
    >
      <div class="grid-stack-item-content">{@render panel(item)}</div>
    </div>
  {/each}
</div>

<style>
  .grid-stack {
    min-height: 100%;
  }
  .grid-stack :global(.grid-stack-item-content) {
    overflow: visible;
  }
  .grid-stack :global(.grid-stack-placeholder > .placeholder-content) {
    border: 1px dashed var(--color-ring);
    border-radius: var(--radius-md);
    background: var(--color-accent-soft);
  }
  .grid-stack :global(.ui-resizable-se) {
    opacity: 0.5;
  }
</style>
