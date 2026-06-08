<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState, Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import Canvas from "../lib/Canvas.svelte";
  import FirstRunSetup from "../lib/FirstRunSetup.svelte";
  import Login from "../lib/Login.svelte";
  import MediaLibrary from "../lib/MediaLibrary.svelte";
  import Toast from "../lib/Toast.svelte";
  import UserManagement from "../lib/UserManagement.svelte";
  import { authStore, checkSetup, logout } from "../lib/stores/auth.js";
  import { addToast } from "../lib/stores/toast.js";
  import CounterSettings from "../lib/widgets/CounterSettings.svelte";
  import ClockSettings from "../lib/widgets/ClockSettings.svelte";
  import ImageSettings from "../lib/widgets/ImageSettings.svelte";
  import MarqueeSettings from "../lib/widgets/MarqueeSettings.svelte";
  import ShapeSettings from "../lib/widgets/ShapeSettings.svelte";
  import TextSettings from "../lib/widgets/TextSettings.svelte";
  import TimerSettings from "../lib/widgets/TimerSettings.svelte";

  type WidgetType = "text" | "image" | "timer" | "counter" | "marquee" | "clock" | "shape";
  type ViewState = "loading" | "setup" | "login" | "dashboard";

  const JOIN_EVENT = "JOIN";
  const canvasState = writable<CanvasState | null>(null);

  const widgetDefaults: Record<WidgetType, Record<string, unknown>> = {
    text: { content: "Text", fontSize: 24, color: "#ffffff", fontWeight: "normal", backgroundColor: "transparent" },
    image: { url: "", opacity: 1, borderRadius: 0 },
    timer: { mode: "stopwatch", durationSeconds: 60, running: false, startedAt: 0, resetAt: 0, fontSize: 32, color: "#ffffff" },
    counter: { value: 0, label: "", step: 1, fontSize: 32, color: "#ffffff" },
    marquee: {
      content: "Marquee text",
      speed: 20,
      direction: "left",
      fontSize: 24,
      color: "#ffffff",
      backgroundColor: "transparent",
      pauseOnHover: false
    },
    clock: { format: "24h", showSeconds: true, timezone: "", fontSize: 48, color: "#ffffff", fontWeight: "bold" },
    shape: { shape: "rectangle", fillColor: "#7c3aed", fillOpacity: 1, borderColor: "transparent", borderWidth: 0, borderOpacity: 1 }
  };

  let socket: Socket | null = null;
  let isConnected = false;
  let viewState: ViewState = "loading";
  let setupComplete = false;
  let selectedWidgetId: string | null = null;
  let selectedMediaUrl = "";
  let activeRightTab: "settings" | "media" = "settings";
  let showUserManagement = false;
  let editingSceneId: string | null = null;
  let editingSceneName = "";
  let sceneActionMessage = "";

  $: auth = $authStore;
  $: activeScene = $canvasState?.scenes.find((scene) => scene.id === $canvasState.activeSceneId);
  $: scenes = $canvasState?.scenes ?? [];
  $: widgets = activeScene?.widgets ?? [];
  $: selectedWidget = selectedWidgetId ? widgets.find((widget) => widget.id === selectedWidgetId) ?? null : null;
  $: canWidgetAdd = auth.permissions.includes("widget.add");
  $: canWidgetRemove = auth.permissions.includes("widget.remove");
  $: canWidgetEdit = auth.permissions.includes("widget.edit");
  $: canWidgetTransform = auth.permissions.includes("widget.transform");
  $: canWidgetVisibility = auth.permissions.includes("widget.visibility");
  $: canSceneManage = auth.permissions.includes("scene.manage");
  $: canUserManage = auth.permissions.includes("user.manage");

  $: if (selectedWidgetId && !widgets.some((widget) => widget.id === selectedWidgetId)) {
    selectedWidgetId = null;
  }

  function disconnectSocket() {
    socket?.disconnect();
    socket = null;
    isConnected = false;
  }

  function connectSocket(token: string) {
    disconnectSocket();
    socket = io(window.location.origin);

    socket.on("connect", () => {
      isConnected = true;
      socket?.emit(JOIN_EVENT, { token });
      socket?.emit(SocketEvents.USER_JOIN, { token });
    });

    socket.on("disconnect", () => {
      isConnected = false;
    });

    socket.on(SocketEvents.AUTH_SUCCESS, () => {
      isConnected = true;
    });

    socket.on(SocketEvents.AUTH_ERROR, async (message: string) => {
      addToast("error", message || "Session expired. Please sign in again.");
      await handleLogout();
    });

    socket.on(SocketEvents.PERMISSION_DENIED, (payload: { event?: string; permission?: string }) => {
      addToast("warning", `Permission denied: ${payload.permission ?? payload.event ?? "action"}`);
    });

    socket.on(SocketEvents.CANVAS_UPDATE, (nextState: CanvasState) => {
      canvasState.set(nextState);
    });
  }

  async function bootstrapAuth() {
    viewState = "loading";
    try {
      const status = await checkSetup();
      setupComplete = !status.setup;
      viewState = setupComplete ? "login" : "setup";
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to load auth status");
      viewState = "login";
    }
  }

  function enterDashboard() {
    if (!auth.token) {
      addToast("error", "Missing session token");
      viewState = setupComplete ? "login" : "setup";
      return;
    }

    viewState = "dashboard";
    connectSocket(auth.token);
    addToast("success", `Signed in as ${auth.user?.username ?? "user"}`);
  }

  async function handleLogout() {
    disconnectSocket();
    selectedWidgetId = null;
    showUserManagement = false;
    canvasState.set(null);
    await logout();
    viewState = setupComplete ? "login" : "setup";
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
      props: { ...widgetDefaults[type] }
    };
  }

  function addWidget(type: WidgetType) {
    if (!socket || !canWidgetAdd) {
      return;
    }

    const widget = createWidget(type);
    selectedWidgetId = widget.id;
    socket.emit(SocketEvents.WIDGET_ADD, widget);
  }

  function removeSelectedWidget() {
    if (!socket || !selectedWidget || !canWidgetRemove) {
      return;
    }

    socket.emit(SocketEvents.WIDGET_REMOVE, { id: selectedWidget.id });
    selectedWidgetId = null;
  }

  function toggleWidgetVisibility() {
    if (!socket || !selectedWidget || !canWidgetVisibility) {
      return;
    }

    socket.emit(SocketEvents.WIDGET_UPDATE, {
      id: selectedWidget.id,
      visible: !selectedWidget.visible
    });
  }

  function handleCanvasSelect(event: CustomEvent<string | null>) {
    selectedWidgetId = event.detail;
  }

  function switchScene(sceneId: string) {
    if (!socket || !canSceneManage) {
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
    if (!canSceneManage) {
      return;
    }

    editingSceneId = sceneId;
    editingSceneName = currentName;
    sceneActionMessage = "";
  }

  function saveSceneRename() {
    if (!canSceneManage) {
      return;
    }

    editingSceneId = null;
    sceneActionMessage = "Scene rename UI is available, but server-side rename is not implemented yet.";
  }

  function addScene() {
    if (!canSceneManage) {
      return;
    }

    sceneActionMessage = "Add scene UI is available, but server-side scene creation is not implemented yet.";
  }

  function handleMediaSelect(url: string) {
    selectedMediaUrl = url;

    if (!socket || !selectedWidget || selectedWidget.type !== "image" || !canWidgetEdit) {
      return;
    }

    socket.emit(SocketEvents.WIDGET_UPDATE, {
      id: selectedWidget.id,
      props: { url }
    });
  }

  function openMediaLibrary() {
    activeRightTab = "media";
  }

  onMount(() => {
    void bootstrapAuth();
    return () => {
      disconnectSocket();
    };
  });
</script>

<main class="min-h-screen bg-base-100 text-base-content">
  {#if viewState === "loading"}
    <div class="hero min-h-screen">
      <div class="text-center">
        <span class="loading loading-spinner loading-lg"></span>
        <p class="mt-3 text-sm text-base-content/70">Loading dashboard...</p>
      </div>
    </div>
  {:else if viewState === "setup"}
    <FirstRunSetup on:success={enterDashboard} />
  {:else if viewState === "login"}
    <Login on:success={enterDashboard} />
  {:else}
    <div class="flex h-screen flex-col">
      <nav class="h-16 shrink-0 border-b border-base-300 bg-base-200 px-4">
        <div class="flex h-full items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M12 2 2 7l10 5 10-5-10-5Zm-7.5 8.5v5L12 20l7.5-4.5v-5L12 15l-7.5-4.5Z" />
              </svg>
            </div>
            <span class="text-lg font-semibold">Anomalist</span>
          </div>

          <div class="flex items-center gap-3">
            <div class="hidden text-sm opacity-80 md:block">{auth.user?.username} ({auth.user?.role})</div>
            <div class="flex items-center gap-2 text-sm">
              <span class={`inline-block h-2.5 w-2.5 rounded-full ${isConnected ? "bg-success" : "bg-error"}`}></span>
              <span>{isConnected ? "Live" : "Disconnected"}</span>
            </div>
            {#if canUserManage}
              <button type="button" class="btn btn-outline btn-sm" on:click={() => (showUserManagement = true)}>Users</button>
            {/if}
            <button type="button" class="btn btn-outline btn-sm" on:click={handleLogout}>Logout</button>
          </div>
        </div>
      </nav>

      <div class="flex h-[calc(100vh-4rem)] overflow-hidden">
        <aside class="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-base-300 bg-base-200">
          <div class="p-4">
            <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/60">Widgets</p>
            <div class="flex flex-col gap-1.5">
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("text")}>Text</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("image")}>Image</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("timer")}>Timer</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("counter")}>Counter</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("marquee")}>Marquee</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("clock")}>Clock</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("shape")}>Shape</button>
            </div>

            <div class="divider my-4"></div>

            <div class="mb-2 flex items-center justify-between">
              <p class="text-xs font-semibold uppercase tracking-wide text-base-content/60">Scenes</p>
              <button type="button" class="btn btn-xs btn-primary" disabled={!canSceneManage} on:click={addScene}>+</button>
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
                        disabled={!canSceneManage}
                        on:click={() => beginSceneRename(scene.id, scene.name)}
                      >
                        Edit
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

        <div class="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-base-100 p-4">
          {#if $canvasState && socket}
            <Canvas
              stagingState={$canvasState}
              {socket}
              {selectedWidgetId}
              canTransform={canWidgetTransform}
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
                  <button type="button" class="btn btn-sm" disabled={!canWidgetVisibility} on:click={toggleWidgetVisibility}>
                    {selectedWidget.visible ? "Hide" : "Show"}
                  </button>
                </div>

                {#if canWidgetEdit}
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
                {:else}
                  <div class="alert alert-warning text-sm">You can view widgets, but do not have permission to edit widget settings.</div>
                {/if}

                <button type="button" class="btn btn-error btn-sm mt-2" disabled={!canWidgetRemove} on:click={removeSelectedWidget}>Remove Widget</button>
              </div>
            {:else}
              <div class="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-base-300 text-center text-base-content/60">
                <div class="text-2xl">Select</div>
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

      <UserManagement open={showUserManagement} on:close={() => (showUserManagement = false)} />
    </div>
  {/if}

  <Toast />
</main>
