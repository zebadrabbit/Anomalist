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
  let token = "";
  let authError = "";
  let isAuthenticated = false;

  $: activeScene = $stagingState?.scenes.find((scene) => scene.id === $stagingState.activeSceneId);
  $: widgets = activeScene?.widgets ?? [];

  function connectDashboard() {
    authError = "";
    livePushed = false;
    isAuthenticated = false;

    socket?.disconnect();
    socket = io(window.location.origin);
    socket.emit(JOIN_EVENT, { role: "dashboard", token });

    socket.on(SocketEvents.AUTH_ERROR, (message: string) => {
      authError = message;
      isAuthenticated = false;
      stagingState.set(null);
      socket?.disconnect();
      socket = null;
    });

    socket.on(SocketEvents.STAGING_UPDATE, (nextState: CanvasState) => {
      stagingState.set(nextState);
      isAuthenticated = true;
      authError = "";
    });

    socket.on(SocketEvents.CANVAS_UPDATE, () => {
      livePushed = true;
    });
  }

  function addTextWidget() {
    if (!socket || !isAuthenticated) {
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
    if (!socket || !isAuthenticated) {
      return;
    }

    socket.emit(SocketEvents.PUSH_TO_LIVE);
  }

  onMount(() => {
    return () => {
      socket?.disconnect();
      socket = null;
    };
  });
</script>

<main>
  {#if !isAuthenticated}
    <h1>Anomalist Dashboard Login</h1>
    <p>Enter owner token to connect.</p>
    <label for="token-input">Owner Token</label>
    <input id="token-input" bind:value={token} type="text" placeholder="Owner token" />
    <div class="actions">
      <button type="button" on:click={connectDashboard}>Connect</button>
    </div>
    {#if authError}
      <p class="error">{authError}</p>
    {/if}
  {:else}
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

  input {
    display: block;
    width: 100%;
    max-width: 420px;
    margin-top: 0.5rem;
    margin-bottom: 1rem;
    padding: 0.5rem;
  }

  .error {
    color: #b00020;
    font-weight: 600;
  }
</style>
