<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";

  const JOIN_EVENT = "JOIN";

  const liveState = writable<CanvasState | null>(null);
  let socket: Socket | null = null;

  $: activeScene = $liveState?.scenes.find((scene) => scene.id === $liveState.activeSceneId);
  $: widgets = activeScene?.widgets.filter((widget) => widget.visible) ?? [];

  function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
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
    <div
      class="widget"
      style={`left:${widget.x}px;top:${widget.y}px;width:${widget.width}px;height:${widget.height}px;`}
    >
      {#if widget.type === "text"}
        <span>{asString(widget.props.content)}</span>
      {:else if widget.type === "image"}
        <img src={asString(widget.props.url)} alt="overlay widget" />
      {:else}
        <div>{widget.type}</div>
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

  .widget {
    position: absolute;
    pointer-events: none;
    color: white;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
