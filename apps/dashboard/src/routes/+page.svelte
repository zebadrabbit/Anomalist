<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState, Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import Canvas from "../lib/Canvas.svelte";
  import CounterSettings from "../lib/widgets/CounterSettings.svelte";
  import ImageSettings from "../lib/widgets/ImageSettings.svelte";
  import TextSettings from "../lib/widgets/TextSettings.svelte";
  import TimerSettings from "../lib/widgets/TimerSettings.svelte";

  type WidgetType = "text" | "image" | "timer" | "counter";

  const JOIN_EVENT = "JOIN";

  const stagingState = writable<CanvasState | null>(null);
  const widgetDefaults: Record<WidgetType, Record<string, unknown>> = {
    text: {
      content: "Text",
      fontSize: 24,
      color: "#ffffff",
      fontWeight: "normal",
      backgroundColor: "transparent"
    },
    image: {
      url: "",
      opacity: 1,
      borderRadius: 0
    },
    timer: {
      mode: "stopwatch",
      durationSeconds: 60,
      running: false,
      fontSize: 32,
      color: "#ffffff"
    },
    counter: {
      value: 0,
      label: "",
      step: 1,
      fontSize: 32,
      color: "#ffffff"
    }
  };

  let socket: Socket | null = null;
  let livePushed = false;
  let token = "";
  let authError = "";
  let isAuthenticated = false;
  let selectedWidgetId: string | null = null;

  $: activeScene = $stagingState?.scenes.find((scene) => scene.id === $stagingState.activeSceneId);
  $: widgets = activeScene?.widgets ?? [];
  $: selectedWidget = selectedWidgetId ? widgets.find((widget) => widget.id === selectedWidgetId) ?? null : null;
  $: if (selectedWidgetId && !widgets.some((widget) => widget.id === selectedWidgetId)) {
    selectedWidgetId = null;
  }

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
      selectedWidgetId = null;
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

  function createWidget(type: WidgetType): Widget {
    const dimensions: Record<WidgetType, { width: number; height: number }> = {
      text: { width: 260, height: 64 },
      image: { width: 320, height: 180 },
      timer: { width: 220, height: 72 },
      counter: { width: 220, height: 110 }
    };

    // Stagger spawn location so new widgets are not fully stacked.
    const offset = (widgets.length * 36) % 180;
    const spawnX = 120 + offset;
    const spawnY = 320 + offset;

    return {
      id: crypto.randomUUID(),
      type,
      x: spawnX,
      y: spawnY,
      width: dimensions[type].width,
      height: dimensions[type].height,
      rotation: 0,
      visible: false,
      layerId: "layer-1",
      props: {
        ...widgetDefaults[type]
      }
    };
  }

  function addWidget(type: WidgetType) {
    if (!socket || !isAuthenticated) {
      return;
    }

    const widget = createWidget(type);
    selectedWidgetId = widget.id;
    livePushed = false;
    socket.emit(SocketEvents.WIDGET_ADD, widget);
  }

  function removeSelectedWidget() {
    if (!socket || !isAuthenticated || !selectedWidget) {
      return;
    }

    livePushed = false;
    socket.emit(SocketEvents.WIDGET_REMOVE, { id: selectedWidget.id });
    selectedWidgetId = null;
  }

  function handleCanvasSelect(event: CustomEvent<string | null>) {
    selectedWidgetId = event.detail;
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
    <section class="toolbar panel">
      <div class="toolbar-top">
        <h2>Canvas Controls</h2>
        <p>
          Staging widget count: <strong>{widgets.length}</strong> | Live:
          <strong>{livePushed ? "Synced" : "Not Synced"}</strong>
        </p>
      </div>
      <div class="actions toolbar-actions">
        <button type="button" on:click={() => addWidget("text")}>Text</button>
        <button type="button" on:click={() => addWidget("image")}>Image</button>
        <button type="button" on:click={() => addWidget("timer")}>Timer</button>
        <button type="button" on:click={() => addWidget("counter")}>Counter</button>
        <button type="button" class="push" on:click={pushToLive}>Push to Live</button>
      </div>
    </section>

    <section class="workspace">
      <div class="canvas-column panel">
        {#if $stagingState && socket}
          <Canvas
            stagingState={$stagingState}
            {socket}
            {selectedWidgetId}
            on:select={handleCanvasSelect}
          />
        {:else}
          <p>Waiting for staging state...</p>
        {/if}
      </div>

      <aside class="sidebar panel">
        <h2>Settings</h2>
        {#if selectedWidget}
          <p>
            Selected: <strong>{selectedWidget.type}</strong>
          </p>
          <div class="actions">
            <button
              type="button"
              class="visibility-toggle"
              on:click={() => {
                if (socket && selectedWidget) {
                  socket.emit(SocketEvents.WIDGET_UPDATE, {
                    id: selectedWidget.id,
                    visible: !selectedWidget.visible
                  });
                }
              }}
            >
              {selectedWidget.visible ? "Hide" : "Show"}
            </button>
            <button type="button" class="danger" on:click={removeSelectedWidget}>Remove Widget</button>
          </div>

          {#if selectedWidget.type === "text"}
            <TextSettings widget={selectedWidget} {socket} />
          {:else if selectedWidget.type === "image"}
            <ImageSettings widget={selectedWidget} {socket} />
          {:else if selectedWidget.type === "timer"}
            <TimerSettings widget={selectedWidget} {socket} />
          {:else if selectedWidget.type === "counter"}
            <CounterSettings widget={selectedWidget} {socket} />
          {:else}
            <p>No settings panel available for this widget type.</p>
          {/if}
        {:else}
          <p>Select a widget to edit its settings.</p>
        {/if}
      </aside>
    </section>
  {/if}
</main>

<style>
  main {
    font-family: sans-serif;
    max-width: 1400px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  .panel {
    border: 1px solid #dadde4;
    border-radius: 10px;
    padding: 1rem;
    margin-bottom: 1rem;
    background: #fff;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 1rem;
    align-items: start;
  }

  .canvas-column {
    min-height: 620px;
  }

  .sidebar {
    position: sticky;
    top: 1rem;
  }

  .toolbar {
    margin-bottom: 1rem;
  }

  .toolbar-top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .toolbar-actions {
    margin-bottom: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
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

  .danger {
    background: #e5484d;
    color: #fff;
    border-color: #e5484d;
  }

  .visibility-toggle {
    background: #7c5cbf;
    color: #fff;
    border-color: #7c5cbf;
  }

  .push {
    background: #1f6feb;
    color: #fff;
    border-color: #1f6feb;
  }

  @media (max-width: 1100px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .sidebar {
      position: static;
    }
  }
</style>
