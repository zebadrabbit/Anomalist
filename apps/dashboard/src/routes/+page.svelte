<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState, Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import Canvas from "../lib/Canvas.svelte";
  import MediaLibrary from "../lib/MediaLibrary.svelte";
  import CounterSettings from "../lib/widgets/CounterSettings.svelte";
  import ClockSettings from "../lib/widgets/ClockSettings.svelte";
  import ImageSettings from "../lib/widgets/ImageSettings.svelte";
  import MarqueeSettings from "../lib/widgets/MarqueeSettings.svelte";
  import ShapeSettings from "../lib/widgets/ShapeSettings.svelte";
  import TextSettings from "../lib/widgets/TextSettings.svelte";
  import TimerSettings from "../lib/widgets/TimerSettings.svelte";

  type WidgetType = "text" | "image" | "timer" | "counter" | "marquee" | "clock" | "shape";

  const JOIN_EVENT = "JOIN";

  const canvasState = writable<CanvasState | null>(null);
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
      startedAt: 0,
      resetAt: 0,
      fontSize: 32,
      color: "#ffffff"
    },
    counter: {
      value: 0,
      label: "",
      step: 1,
      fontSize: 32,
      color: "#ffffff"
    },
    marquee: {
      content: "Marquee text",
      speed: 20,
      direction: "left",
      fontSize: 24,
      color: "#ffffff",
      backgroundColor: "transparent",
      pauseOnHover: false
    },
    clock: {
      format: "24h",
      showSeconds: true,
      timezone: "",
      fontSize: 48,
      color: "#ffffff",
      fontWeight: "bold"
    },
    shape: {
      shape: "rectangle",
      fillColor: "#7c3aed",
      fillOpacity: 1,
      borderColor: "transparent",
      borderWidth: 0,
      borderOpacity: 1
    }
  };

  let socket: Socket | null = null;
  let token = "";
  let authError = "";
  let isAuthenticated = false;
  let isConnected = false;
  let selectedWidgetId: string | null = null;
  let activeRightTab: "settings" | "media" = "settings";
  let selectedMediaUrl = "";
  let editingSceneId: string | null = null;
  let editingSceneName = "";
  let sceneActionMessage = "";

  $: activeScene = $canvasState?.scenes.find((scene) => scene.id === $canvasState.activeSceneId);
  $: scenes = $canvasState?.scenes ?? [];
  $: widgets = activeScene?.widgets ?? [];
  $: selectedWidget = selectedWidgetId ? widgets.find((widget) => widget.id === selectedWidgetId) ?? null : null;
  $: if (selectedWidgetId && !widgets.some((widget) => widget.id === selectedWidgetId)) {
    selectedWidgetId = null;
  }

  function connectDashboard() {
    authError = "";
    isAuthenticated = false;
    isConnected = false;

    socket?.disconnect();
    socket = io(window.location.origin);
    socket.emit(JOIN_EVENT, { role: "dashboard", token });

    socket.on("connect", () => {
      isConnected = true;
    });

    socket.on("disconnect", () => {
      isConnected = false;
    });

    socket.on(SocketEvents.AUTH_ERROR, (message: string) => {
      authError = message;
      isAuthenticated = false;
      isConnected = false;
      selectedWidgetId = null;
      canvasState.set(null);
      socket?.disconnect();
      socket = null;
    });

    socket.on(SocketEvents.CANVAS_UPDATE, (nextState: CanvasState) => {
      canvasState.set(nextState);
      isAuthenticated = true;
      authError = "";
      isConnected = true;
    });
  }

  function logout() {
    socket?.disconnect();
    socket = null;
    isConnected = false;
    isAuthenticated = false;
    selectedWidgetId = null;
    canvasState.set(null);
    authError = "";
    token = "";
  }

  function createWidget(type: WidgetType): Widget {
    const dimensions: Record<WidgetType, { width: number; height: number }> = {
      text: { width: 260, height: 64 },
      image: { width: 320, height: 180 },
      timer: { width: 220, height: 72 },
      counter: { width: 220, height: 110 },
      marquee: { width: 600, height: 64 },
      clock: { width: 320, height: 96 },
      shape: { width: 360, height: 110 }
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
    socket.emit(SocketEvents.WIDGET_ADD, widget);
  }

  function removeSelectedWidget() {
    if (!socket || !isAuthenticated || !selectedWidget) {
      return;
    }

    socket.emit(SocketEvents.WIDGET_REMOVE, { id: selectedWidget.id });
    selectedWidgetId = null;
  }

  function handleCanvasSelect(event: CustomEvent<string | null>) {
    selectedWidgetId = event.detail;
  }

  function switchScene(sceneId: string) {
    if (!socket || !isAuthenticated) {
      return;
    }

    socket.emit(SocketEvents.SCENE_CHANGE, { sceneId });
  }

  function getSceneName(scene: CanvasState["scenes"][number]): string {
    if (editingSceneId === scene.id) {
      return editingSceneName;
    }

    return scene.name;
  }

  function beginSceneRename(sceneId: string, currentName: string) {
    editingSceneId = sceneId;
    editingSceneName = currentName;
    sceneActionMessage = "";
  }

  function saveSceneRename() {
    editingSceneId = null;
    sceneActionMessage = "Scene rename UI is available, but server-side rename is not implemented yet.";
  }

  function addScene() {
    sceneActionMessage = "Add scene UI is available, but server-side scene creation is not implemented yet.";
  }

  function handleMediaSelect(url: string) {
    selectedMediaUrl = url;

    if (!socket || !selectedWidget || selectedWidget.type !== "image") {
      return;
    }

    socket.emit(SocketEvents.WIDGET_UPDATE, {
      id: selectedWidget.id,
      props: {
        url
      }
    });
  }

  function openMediaLibrary() {
    activeRightTab = "media";
  }

  onMount(() => {
    return () => {
      socket?.disconnect();
      socket = null;
    };
  });
</script>

<main class="min-h-screen bg-base-100 text-base-content">
  {#if !isAuthenticated}
    <div class="hero min-h-screen">
      <div class="card w-full max-w-md bg-base-200 shadow-xl">
        <div class="card-body gap-5">
          <div class="text-center">
            <div class="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <svg viewBox="0 0 24 24" class="h-7 w-7" fill="currentColor" aria-hidden="true">
                <path d="M9 2a2 2 0 0 0-2 2v1.07A8 8 0 0 0 4 12v6a2 2 0 0 0 2 2h3v2h2v-2h2v2h2v-2h3a2 2 0 0 0 2-2v-6a8 8 0 0 0-3-6.93V4a2 2 0 0 0-2-2H9Zm0 2h6v1.24a8.08 8.08 0 0 0-6 0V4Zm-3 8a6 6 0 1 1 12 0v6H6v-6Z" />
              </svg>
            </div>
            <h1 class="text-2xl font-semibold">Anomalist</h1>
            <p class="mt-1 text-sm text-base-content/70">Enter your owner token to continue</p>
          </div>

          <label class="form-control w-full">
            <span class="label-text mb-2">Owner Token</span>
            <input
              id="token-input"
              bind:value={token}
              type="password"
              placeholder="Owner token"
              class="input input-bordered w-full"
            />
          </label>

          <button type="button" class="btn btn-primary w-full" on:click={connectDashboard}>Connect</button>

          {#if authError}
            <div class="alert alert-error text-sm">{authError}</div>
          {/if}

          <p class="text-center text-xs text-base-content/60">Self-hosted stream overlay control</p>
        </div>
      </div>
    </div>
  {:else}
    <nav class="h-16 bg-base-200 border-b border-base-300 flex items-center justify-between px-4 shrink-0">
      <div class="flex items-center gap-3">
        <div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M12 2 2 7l10 5 10-5-10-5Zm-7.5 8.5v5L12 20l7.5-4.5v-5L12 15l-7.5-4.5Z" />
          </svg>
        </div>
        <span class="text-lg font-semibold">Anomalist</span>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 text-sm">
          <span class={`inline-block h-2.5 w-2.5 rounded-full ${isConnected ? "bg-success" : "bg-error"}`}></span>
          <span>{isConnected ? "Live" : "Disconnected"}</span>
        </div>
        <button type="button" class="btn btn-outline btn-sm" on:click={logout}>Logout</button>
      </div>
    </nav>

    <div class="flex h-[calc(100vh-4rem)] overflow-hidden">
      <aside class="w-56 shrink-0 bg-base-200 flex flex-col overflow-y-auto border-r border-base-300">
        <div class="p-4">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/60">Widgets</p>
        <div class="flex flex-col gap-1.5">
          <button type="button" class="btn btn-ghost justify-start" on:click={() => addWidget("text")}>T Text</button>
          <button type="button" class="btn btn-ghost justify-start" on:click={() => addWidget("image")}>Photo Image</button>
          <button type="button" class="btn btn-ghost justify-start" on:click={() => addWidget("timer")}>Clock Timer</button>
          <button type="button" class="btn btn-ghost justify-start" on:click={() => addWidget("counter")}># Counter</button>
          <button type="button" class="btn btn-ghost justify-start" on:click={() => addWidget("marquee")}>Marquee Ticker</button>
          <button type="button" class="btn btn-ghost justify-start" on:click={() => addWidget("clock")}>Live Clock</button>
          <button type="button" class="btn btn-ghost justify-start" on:click={() => addWidget("shape")}>Shape Block</button>
        </div>

        <div class="divider my-4"></div>

        <div class="mb-2 flex items-center justify-between">
          <p class="text-xs font-semibold uppercase tracking-wide text-base-content/60">Scenes</p>
          <button type="button" class="btn btn-xs btn-primary" on:click={addScene}>+</button>
        </div>
        <div class="flex flex-col gap-2">
          {#each scenes as scene (scene.id)}
            <div class={`rounded-lg border p-2 ${scene.id === $canvasState?.activeSceneId ? "border-primary bg-primary/10" : "border-base-300"}`}>
              {#if editingSceneId === scene.id}
                <div class="flex items-center gap-2">
                  <input
                    class="input input-bordered input-xs w-full"
                    bind:value={editingSceneName}
                    on:keydown={(event) => event.key === "Enter" && saveSceneRename()}
                  />
                  <button type="button" class="btn btn-xs" on:click={saveSceneRename}>Save</button>
                </div>
              {:else}
                <div class="flex items-center justify-between gap-2">
                  <button type="button" class="btn btn-ghost btn-xs flex-1 justify-start" on:click={() => switchScene(scene.id)}>
                    {getSceneName(scene)}
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs"
                    aria-label="Rename scene"
                    on:click={() => beginSceneRename(scene.id, scene.name)}
                  >
                    pencil
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        {#if sceneActionMessage}
          <div class="alert alert-info mt-3 p-2 text-xs">{sceneActionMessage}</div>
        {/if}
        </div>
      </aside>

      <div class="min-w-0 flex-1 overflow-auto bg-base-100 p-4 flex items-center justify-center">
        {#if $canvasState && socket}
          <Canvas
            stagingState={$canvasState}
            {socket}
            {selectedWidgetId}
            on:select={handleCanvasSelect}
          />
        {:else}
          <span class="loading loading-dots loading-md"></span>
        {/if}
      </div>

      <aside class="w-80 shrink-0 overflow-y-auto border-l border-base-300 bg-base-200 p-4">
        <div class="tabs tabs-bordered mb-4">
          <button type="button" class={`tab ${activeRightTab === "settings" ? "tab-active" : ""}`} on:click={() => (activeRightTab = "settings")}>Settings</button>
          <button type="button" class={`tab ${activeRightTab === "media" ? "tab-active" : ""}`} on:click={() => (activeRightTab = "media")}>Media</button>
        </div>

        {#if activeRightTab === "settings"}
          {#if selectedWidget}
            <div class="flex flex-col gap-4">
              <div class="flex items-center justify-between">
                <span class="badge badge-primary badge-outline">{selectedWidget.type}</span>
                <button
                  type="button"
                  class="btn btn-sm"
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
              </div>

              {#if selectedWidget.type === "text"}
                <TextSettings widget={selectedWidget} {socket} />
              {:else if selectedWidget.type === "image"}
                <ImageSettings widget={selectedWidget} {socket} onOpenLibrary={openMediaLibrary} />
              {:else if selectedWidget.type === "timer"}
                <TimerSettings widget={selectedWidget} {socket} />
              {:else if selectedWidget.type === "counter"}
                <CounterSettings widget={selectedWidget} {socket} />
              {:else if selectedWidget.type === "marquee"}
                <MarqueeSettings widget={selectedWidget} {socket} />
              {:else if selectedWidget.type === "clock"}
                <ClockSettings widget={selectedWidget} {socket} />
              {:else if selectedWidget.type === "shape"}
                <ShapeSettings widget={selectedWidget} {socket} />
              {/if}

              <button type="button" class="btn btn-error btn-sm mt-2" on:click={removeSelectedWidget}>Remove Widget</button>
            </div>
          {:else}
            <div class="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-base-300 text-center text-base-content/60">
              <div class="text-2xl">ghost</div>
              <p>Select a widget to edit</p>
            </div>
          {/if}
        {:else}
          <MediaLibrary onSelect={handleMediaSelect} />

          {#if !selectedWidget || selectedWidget.type !== "image"}
            <label class="form-control mt-3">
              <span class="label-text mb-1">Selected URL</span>
              <input class="input input-bordered input-sm" value={selectedMediaUrl} readonly on:focus={(event) => event.currentTarget.select()} />
            </label>
          {/if}
        {/if}
      </aside>
    </div>
  {/if}
</main>
