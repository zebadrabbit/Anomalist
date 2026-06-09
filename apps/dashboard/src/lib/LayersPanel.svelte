<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import type { Socket } from "socket.io-client";

  export let socket: Socket | null = null;
  export let widgets: Widget[] = [];
  export let selectedWidgetId: string | null = null;
  export let activeSceneName = "Scene";
  export let canTransform = false;

  const dispatch = createEventDispatcher<{ select: string }>();

  let dragIndex: number | null = null;
  let dragOverIndex: number | null = null;

  const TYPE_COLORS: Record<string, string> = {
    text: "badge-primary",
    timer: "badge-secondary",
    counter: "badge-accent",
    marquee: "badge-info",
    clock: "badge-success",
    image: "badge-warning",
    shape: "badge-neutral",
    soundboard: "badge-ghost",
    particle: "badge-error",
    "custom-html": "badge-ghost",
    chat: "badge-info"
  };

  const TYPE_LABELS: Record<string, string> = {
    text: "Tx",
    timer: "Ti",
    counter: "Co",
    marquee: "Mq",
    clock: "Cl",
    image: "Im",
    shape: "Sh",
    soundboard: "Sb",
    particle: "Pt",
    "custom-html": "HT",
    chat: "Ch"
  };

  $: displayWidgets = [...widgets].reverse();

  function toTitleCase(value: string): string {
    if (!value) {
      return "Widget";
    }

    return value
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function getWidgetLabel(widget: Widget): string {
    const label = widget.props.label;
    if (typeof label === "string" && label.trim()) {
      return label.trim();
    }

    return toTitleCase(widget.type);
  }

  function emitReorderFromDisplay(nextDisplayWidgets: Widget[]): void {
    if (!socket || !canTransform) {
      return;
    }

    const nextArrayOrder = [...nextDisplayWidgets].reverse();
    socket.emit(SocketEvents.WIDGET_REORDER, {
      widgetIds: nextArrayOrder.map((widget) => widget.id)
    });
  }

  function moveInDisplay(index: number, direction: "forward" | "backward"): void {
    if (!canTransform) {
      return;
    }

    const next = [...displayWidgets];
    const targetIndex = direction === "forward" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= next.length) {
      return;
    }

    const item = next[index];
    next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    emitReorderFromDisplay(next);
  }

  function onDragStart(index: number): void {
    if (!canTransform) {
      return;
    }

    dragIndex = index;
  }

  function onDragOver(index: number): void {
    if (!canTransform) {
      return;
    }

    dragOverIndex = index;
  }

  function onDragEnd(): void {
    dragIndex = null;
    dragOverIndex = null;
  }

  function onDrop(targetIndex: number): void {
    if (!canTransform || dragIndex === null || dragIndex === targetIndex) {
      onDragEnd();
      return;
    }

    const next = [...displayWidgets];
    const item = next.splice(dragIndex, 1)[0];
    next.splice(targetIndex, 0, item);

    emitReorderFromDisplay(next);
    onDragEnd();
  }

  function selectWidget(widgetId: string): void {
    dispatch("select", widgetId);
  }

  function toggleWidgetVisibility(widget: Widget): void {
    if (!socket || !canTransform) {
      return;
    }

    socket.emit(SocketEvents.WIDGET_UPDATE, {
      id: widget.id,
      visible: !widget.visible
    });
  }
</script>

<section class="rounded-2xl border border-base-300 bg-base-100 p-4">
  <div class="mb-3">
    <h3 class="text-base font-semibold">Layers</h3>
    <p class="text-sm text-base-content/70">Widgets in active scene: {activeSceneName}</p>
  </div>

  {#if displayWidgets.length === 0}
    <div class="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/70">
      No widgets in this scene yet.
    </div>
  {:else}
    <div class="space-y-1.5">
      {#each displayWidgets as widget, i (widget.id)}
        <div
          role="listitem"
          class={`flex items-center gap-2 rounded-lg border px-2 py-2 ${selectedWidgetId === widget.id ? "border-primary bg-primary/10" : "border-base-300 bg-base-100"} ${dragOverIndex === i ? "ring-2 ring-primary/35" : ""}`}
          draggable={canTransform}
          on:dragstart={() => onDragStart(i)}
          on:dragend={onDragEnd}
          on:dragover|preventDefault={() => onDragOver(i)}
          on:drop={() => onDrop(i)}
        >
          {#if canTransform}
            <span class="w-5 cursor-grab text-center text-base-content/50" aria-label="Drag layer">≡</span>
          {:else}
            <span class="w-5"></span>
          {/if}

          <span class={`badge badge-sm ${TYPE_COLORS[widget.type] ?? "badge-neutral"}`}>
            {TYPE_LABELS[widget.type] ?? "Wd"}
          </span>

          <button type="button" class="min-w-0 flex-1 text-left" on:click={() => selectWidget(widget.id)}>
            <span class="block truncate text-sm font-medium">{getWidgetLabel(widget)}</span>
            <span class="block text-xs text-base-content/60">{toTitleCase(widget.type)}</span>
          </button>

          {#if canTransform}
            <!-- display list is front-to-back, so forward means moving toward index 0 -->
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              disabled={i === 0}
              aria-label="Bring forward"
              on:click={() => moveInDisplay(i, "forward")}
            >
              ▲
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              disabled={i === displayWidgets.length - 1}
              aria-label="Send backward"
              on:click={() => moveInDisplay(i, "backward")}
            >
              ▼
            </button>
            <button
              type="button"
              class={`btn btn-ghost btn-xs ${widget.visible ? "text-success" : "text-base-content/40"}`}
              aria-label={widget.visible ? "Hide widget" : "Show widget"}
              on:click={() => toggleWidgetVisibility(widget)}
            >
              {widget.visible ? "👁" : "◌"}
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
