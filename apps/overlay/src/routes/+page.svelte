<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import CounterWidget from "../lib/widgets/CounterWidget.svelte";
  import ImageWidget from "../lib/widgets/ImageWidget.svelte";
  import TextWidget from "../lib/widgets/TextWidget.svelte";
  import TimerWidget from "../lib/widgets/TimerWidget.svelte";

  const JOIN_EVENT = "JOIN";

  const liveState = writable<CanvasState | null>(null);
  let socket: Socket | null = null;

  $: activeScene = $liveState?.scenes.find((scene) => scene.id === $liveState.activeSceneId);
  $: widgets = activeScene?.widgets.filter((widget) => widget.visible) ?? [];

  function resolveComponent(widgetType: string) {
    if (widgetType === "text") {
      return TextWidget;
    }

    if (widgetType === "image") {
      return ImageWidget;
    }

    if (widgetType === "timer") {
      return TimerWidget;
    }

    if (widgetType === "counter") {
      return CounterWidget;
    }

    return null;
  }

  onMount(() => {
    socket = io(window.location.origin);
    socket.emit(JOIN_EVENT, { role: "overlay" });

    socket.on(SocketEvents.CANVAS_UPDATE, (nextState: CanvasState) => {
      liveState.set(nextState);
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  });
</script>

<main class="overlay-canvas">
  {#each widgets as widget (widget.id)}
    {@const WidgetComponent = resolveComponent(widget.type)}
    <div
      class="widget-frame"
      style={`left:${widget.x}px;top:${widget.y}px;width:${widget.width}px;height:${widget.height}px;transform: rotate(${widget.rotation ?? 0}deg);`}
    >
      {#if WidgetComponent}
        <svelte:component this={WidgetComponent} {widget} />
      {:else}
        <div class="widget-fallback">{widget.type}</div>
      {/if}
    </div>
  {/each}
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    background: transparent;
  }

  .overlay-canvas {
    position: relative;
    width: 100vw;
    height: 100vh;
    background: transparent;
    overflow: hidden;
  }

  .widget-frame {
    position: absolute;
    transform-origin: center center;
  }

  .widget-fallback {
    width: 100%;
    height: 100%;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed rgba(255, 255, 255, 0.65);
    box-sizing: border-box;
  }

</style>
