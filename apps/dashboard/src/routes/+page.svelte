<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState, Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";

  const JOIN_EVENT = "JOIN";

  const stagingState = writable<CanvasState | null>(null);
  let socket: Socket | null = null;
  let livePushed = false;

  $: activeScene = $stagingState?.scenes.find((scene) => scene.id === $stagingState.activeSceneId);
  $: widgets = activeScene?.widgets ?? [];

  function addTextWidget() {
    if (!socket) {
      return;
    }

    const widget: Widget = {
      id: crypto.randomUUID(),
      type: "text",
      x: 50,
      y: 50,
      width: 200,
      height: 50,
      visible: true,
      layerId: "layer-1",
      props: {
        content: "Hello Anomalist"
      }
    };

    livePushed = false;
    socket.emit(SocketEvents.WIDGET_ADD, widget);
  }

  function pushToLive() {
    if (!socket) {
      return;
    }

    socket.emit(SocketEvents.PUSH_TO_LIVE);
  }

  onMount(() => {
    socket = io(window.location.origin);
    socket.emit(JOIN_EVENT, { role: "dashboard" });

    socket.on(SocketEvents.STAGING_UPDATE, (nextState: CanvasState) => {
      stagingState.set(nextState);
    });

    socket.on(SocketEvents.CANVAS_UPDATE, () => {
      livePushed = true;
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  });
</script>

<main>
  <h1>Anomalist Dashboard</h1>
  <p>Staging widget count: {widgets.length}</p>
  <p>
    Live: <strong>{livePushed ? "Synced" : "Not Synced"}</strong>
  </p>

  <div class="actions">
    <button type="button" on:click={addTextWidget}>Add Text Widget</button>
    <button type="button" on:click={pushToLive}>Push to Live</button>
  </div>

  <h2>Staging Widgets</h2>
  {#if widgets.length === 0}
    <p>No widgets in staging.</p>
  {:else}
    <ul>
      {#each widgets as widget}
        <li>{widget.id} ({widget.type})</li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main {
    font-family: sans-serif;
    max-width: 900px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
</style>
