<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState, Widget, WidgetUpdate } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
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
  let selectedWidgetId = "";

  $: activeScene = $stagingState?.scenes.find((scene) => scene.id === $stagingState.activeSceneId);
  $: widgets = activeScene?.widgets ?? [];
  $: selectedWidget = widgets.find((widget) => widget.id === selectedWidgetId) ?? null;
  $: if (selectedWidgetId && !widgets.some((widget) => widget.id === selectedWidgetId)) {
    selectedWidgetId = "";
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
      selectedWidgetId = "";
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

    return {
      id: crypto.randomUUID(),
      type,
      x: 50,
      y: 50,
      width: dimensions[type].width,
      height: dimensions[type].height,
      visible: true,
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

  function updateWidget(event: CustomEvent<WidgetUpdate>) {
    if (!socket || !isAuthenticated) {
      return;
    }

    livePushed = false;
    socket.emit(SocketEvents.WIDGET_UPDATE, event.detail);
  }

  function removeSelectedWidget() {
    if (!socket || !isAuthenticated || !selectedWidget) {
      return;
    }

    livePushed = false;
    socket.emit(SocketEvents.WIDGET_REMOVE, { id: selectedWidget.id });
    selectedWidgetId = "";
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

    <section class="panel">
      <h2>Add Widget</h2>
      <div class="actions">
        <button type="button" on:click={() => addWidget("text")}>Text</button>
        <button type="button" on:click={() => addWidget("image")}>Image</button>
        <button type="button" on:click={() => addWidget("timer")}>Timer</button>
        <button type="button" on:click={() => addWidget("counter")}>Counter</button>
      </div>
    </section>

    <section class="panel">
      <h2>Staging Widgets</h2>
      {#if widgets.length === 0}
        <p>No widgets in staging.</p>
      {:else}
        <ul class="widget-list">
          {#each widgets as widget}
            <li>
              <button
                type="button"
                class:selected={widget.id === selectedWidgetId}
                on:click={() => (selectedWidgetId = widget.id)}
              >
                {widget.type} ({widget.id})
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel">
      <h2>Settings</h2>
      {#if selectedWidget}
        <p>
          Selected: <strong>{selectedWidget.type}</strong>
        </p>
        <div class="actions">
          <button type="button" class="danger" on:click={removeSelectedWidget}>Remove Widget</button>
        </div>

        {#if selectedWidget.type === "text"}
          <TextSettings widget={selectedWidget} on:update={updateWidget} />
        {:else if selectedWidget.type === "image"}
          <ImageSettings widget={selectedWidget} on:update={updateWidget} />
        {:else if selectedWidget.type === "timer"}
          <TimerSettings widget={selectedWidget} on:update={updateWidget} />
        {:else if selectedWidget.type === "counter"}
          <CounterSettings widget={selectedWidget} on:update={updateWidget} />
        {:else}
          <p>No settings panel available for this widget type.</p>
        {/if}
      {:else}
        <p>Select a widget from the list to edit its settings.</p>
      {/if}
    </section>

    <div class="actions">
      <button type="button" class="push" on:click={pushToLive}>Push to Live</button>
    </div>
  {/if}
</main>

<style>
  main {
    font-family: sans-serif;
    max-width: 1000px;
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

  .widget-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }

  .widget-list button {
    width: 100%;
    text-align: left;
    padding: 0.6rem;
    border: 1px solid #cfd4dc;
    border-radius: 8px;
    background: #f7f9fc;
  }

  .widget-list button.selected {
    border-color: #1f6feb;
    background: #e8f1ff;
  }

  .danger {
    background: #e5484d;
    color: #fff;
    border-color: #e5484d;
  }

  .push {
    background: #1f6feb;
    color: #fff;
    border-color: #1f6feb;
  }
</style>
