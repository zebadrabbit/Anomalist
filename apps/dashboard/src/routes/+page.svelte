<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { page } from "$app/stores";
  import { writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState, PresetListItem, SoundEntry, Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import Canvas from "../lib/Canvas.svelte";
  import FirstRunSetup from "../lib/FirstRunSetup.svelte";
  import Login from "../lib/Login.svelte";
  import MediaLibrary from "../lib/MediaLibrary.svelte";
  import LayersPanel from "../lib/LayersPanel.svelte";
  import Toast from "../lib/Toast.svelte";
  import UserManagement from "../lib/UserManagement.svelte";
  import StreamManager from "../lib/StreamManager.svelte";
  import TwitchSettings from "../lib/TwitchSettings.svelte";
  import { authStore, checkSetup, logout } from "../lib/stores/auth.js";
  import { addToast } from "../lib/stores/toast.js";
  import CounterSettings from "../lib/widgets/CounterSettings.svelte";
  import ClockSettings from "../lib/widgets/ClockSettings.svelte";
  import ImageSettings from "../lib/widgets/ImageSettings.svelte";
  import CustomHtmlSettings from "../lib/widgets/CustomHtmlSettings.svelte";
  import MarqueeSettings from "../lib/widgets/MarqueeSettings.svelte";
  import ShapeSettings from "../lib/widgets/ShapeSettings.svelte";
  import SoundboardSettings from "../lib/widgets/SoundboardSettings.svelte";
  import ChatSettings from "../lib/widgets/ChatSettings.svelte";
  import EffectsPanel from "../lib/EffectsPanel.svelte";
  import ParticleSettings from "../lib/widgets/ParticleSettings.svelte";
  import TextSettings from "../lib/widgets/TextSettings.svelte";
  import TimerSettings from "../lib/widgets/TimerSettings.svelte";

  type WidgetType = "text" | "image" | "timer" | "counter" | "marquee" | "clock" | "shape" | "soundboard" | "custom-html" | "chat" | "particle";
  type ViewState = "loading" | "setup" | "login" | "dashboard";
  type EntranceAnimationType = "none" | "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "pop" | "bounce";

  interface EntranceAnimation {
    type: EntranceAnimationType;
    duration: number;
  }

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
    shape: { shape: "rectangle", fillColor: "#7c3aed", fillOpacity: 1, borderColor: "transparent", borderWidth: 0, borderOpacity: 1 },
    soundboard: { sounds: [], columns: 3, buttonColor: "#7c3aed", buttonTextColor: "#ffffff" },
    "custom-html": { html: "<div style='color:white;font-size:24px'>Hello</div>" },
    particle: { preset: "sparkles", speed: 1, density: 60, opacity: 0.9 },
    chat: {
      maxMessages: 10,
      fontSize: 16,
      showBadges: true,
      colorByUser: true,
      background: "rgba(0,0,0,0.5)",
      textColor: "#ffffff",
      messageTimeout: 0,
      borderRadius: 8
    }
  };

  function fileNameWithoutExtension(path: string): string {
    const base = path.split("/").pop() ?? path;
    const dotIndex = base.lastIndexOf(".");
    if (dotIndex <= 0) {
      return base;
    }

    return base.slice(0, dotIndex);
  }

  let socket: Socket | null = null;
  let isConnected = false;
  let viewState: ViewState = "loading";
  let setupComplete = false;
  let selectedWidgetId: string | null = null;
  let selectedMediaUrl = "";
  let activeRightTab: "settings" | "media" | "layers" = "settings";
  let activeCenterPanel: "canvas" | "settings" | "stream" = "canvas";
  let showUserManagement = false;
  let editingSceneId: string | null = null;
  let editingSceneName = "";
  let sceneActionMessage = "";
  let presets: PresetListItem[] = [];
  let presetNameInput = "";
  let showPresetInput = false;
  let hasRequestedPresets = false;
  let twitchConnectionState: "connected" | "disconnected" | "unknown" = "unknown";
  let twitchStatusPoll: ReturnType<typeof setInterval> | null = null;
  let settingsPanelReady = true;
  let settingsSkeletonTimer: ReturnType<typeof setTimeout> | null = null;
  let settingsPanelKey = "";
  let leftSidebarCollapsed = false;
  let rightSidebarCollapsed = false;
  let showSceneClearModal = false;
  let sceneToClear: { id: string; name: string; widgetCount: number } | null = null;
  let leftWidgetsExpanded = true;
  let leftScenesExpanded = true;
  let leftPresetsExpanded = true;

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
  $: canPlaySoundboard = auth.permissions.includes("soundboard.play");
  $: canSceneManage = auth.permissions.includes("scene.manage");
  $: canUserManage = auth.permissions.includes("user.manage");
  $: canStreamManage = auth.permissions.includes("stream.manage");
  $: canAddCustomHtml = canWidgetAdd && (auth.user?.role === "owner" || auth.user?.role === "editor");
  $: allSoundsFromSoundboards = widgets
    .filter((widget) => widget.type === "soundboard")
    .flatMap((widget) => {
      const soundsRaw = widget.props.sounds;
      if (!Array.isArray(soundsRaw)) {
        return [] as SoundEntry[];
      }

      return soundsRaw
        .filter((item): item is Partial<SoundEntry> => !!item && typeof item === "object")
        .map((item) => {
          const url = typeof item.url === "string" ? item.url : "";
          const legacyName = typeof (item as { name?: unknown }).name === "string" ? (item as { name: string }).name : "";

          return {
            id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
            label: typeof item.label === "string" ? item.label : (fileNameWithoutExtension(url) || legacyName || "Sound"),
            url,
            volume: typeof item.volume === "number" && Number.isFinite(item.volume) ? item.volume : 1
          };
        })
        .filter((item) => item.url.startsWith("/media/"));
    });

  $: if (selectedWidgetId && !widgets.some((widget) => widget.id === selectedWidgetId)) {
    selectedWidgetId = null;
  }

  $: {
    const nextKey = selectedWidget ? `${selectedWidget.id}:${selectedWidget.type}` : "";
    if (nextKey !== settingsPanelKey) {
      settingsPanelKey = nextKey;

      if (settingsSkeletonTimer) {
        clearTimeout(settingsSkeletonTimer);
      }

      if (!selectedWidget) {
        settingsPanelReady = true;
      } else {
        settingsPanelReady = false;
        settingsSkeletonTimer = setTimeout(() => {
          settingsPanelReady = true;
        }, 140);
      }
    }
  }

  function disconnectSocket() {
    socket?.disconnect();
    socket = null;
    isConnected = false;
  }

  async function loadTwitchConnectionStatus() {
    if (!auth.token) {
      twitchConnectionState = "unknown";
      return;
    }

    try {
      const response = await fetch("/api/twitch/status", {
        headers: {
          Authorization: `Bearer ${auth.token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          twitchConnectionState = "unknown";
          return;
        }

        twitchConnectionState = "disconnected";
        return;
      }

      const payload = (await response.json()) as { connected?: boolean };
      twitchConnectionState = payload.connected ? "connected" : "disconnected";
    } catch {
      twitchConnectionState = "disconnected";
    }
  }

  function startTwitchStatusPolling() {
    if (twitchStatusPoll) {
      clearInterval(twitchStatusPoll);
    }

    void loadTwitchConnectionStatus();
    twitchStatusPoll = setInterval(() => {
      void loadTwitchConnectionStatus();
    }, 30000);
  }

  function stopTwitchStatusPolling() {
    if (!twitchStatusPoll) {
      return;
    }

    clearInterval(twitchStatusPoll);
    twitchStatusPoll = null;
  }

  function connectSocket(token: string) {
    disconnectSocket();
    hasRequestedPresets = false;
    presets = [];
    socket = io(window.location.origin);

    socket.on("connect", () => {
      isConnected = true;
      socket?.emit(JOIN_EVENT, { token });
      socket?.emit(SocketEvents.USER_JOIN, { token });
    });

    socket.on("disconnect", () => {
      isConnected = false;
      hasRequestedPresets = false;
      presets = [];
    });

    socket.on(SocketEvents.AUTH_SUCCESS, () => {
      isConnected = true;
    });

    socket.on(SocketEvents.AUTH_ERROR, async (payload: string | { message?: string }) => {
      const message = typeof payload === "string" ? payload : payload?.message ?? "Session expired. Please sign in again.";
      addToast("error", message);
      await handleLogout();
    });

    socket.on(SocketEvents.PERMISSION_DENIED, (payload: { event?: string; permission?: string }) => {
      addToast("warning", `You do not have permission for ${payload.permission ?? payload.event ?? "this action"}.`);
    });

    socket.on(SocketEvents.CANVAS_UPDATE, (nextState: CanvasState) => {
      canvasState.set(nextState);
      if (!hasRequestedPresets) {
        socket?.emit(SocketEvents.PRESET_LIST);
        hasRequestedPresets = true;
      }
    });

    socket.on(SocketEvents.PRESET_LIST, (nextPresets: PresetListItem[]) => {
      presets = Array.isArray(nextPresets) ? nextPresets : [];
    });
  }

  async function bootstrapAuth() {
    viewState = "loading";
    try {
      const status = await checkSetup();
      setupComplete = !status.setup;
      viewState = setupComplete ? "login" : "setup";
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Couldn't load sign-in status. Please refresh.");
      viewState = "login";
    }
  }

  function enterDashboard() {
    if (!auth.token) {
      addToast("error", "Couldn't start your dashboard session. Please sign in again.");
      viewState = setupComplete ? "login" : "setup";
      return;
    }

    viewState = "dashboard";
    connectSocket(auth.token);
    startTwitchStatusPolling();
    addToast("success", `Welcome back, ${auth.user?.username ?? "streamer"}.`);
  }

  async function handleLogout() {
    disconnectSocket();
    stopTwitchStatusPolling();
    twitchConnectionState = "unknown";
    selectedWidgetId = null;
    showUserManagement = false;
    canvasState.set(null);
    await logout();
    viewState = setupComplete ? "login" : "setup";
  }

  function readStoredBool(key: string): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(key) === "true";
    } catch {
      return false;
    }
  }

  function readStoredBoolDefault(key: string, fallback: boolean): boolean {
    if (typeof window === "undefined") {
      return fallback;
    }

    try {
      const value = window.localStorage.getItem(key);
      if (value === null) {
        return fallback;
      }
      return value === "true";
    } catch {
      return fallback;
    }
  }

  function persistBool(key: string, value: boolean) {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // Ignore storage failures.
    }
  }

  function createWidget(type: WidgetType): Widget {
    const dimensions: Record<WidgetType, { width: number; height: number }> = {
      text: { width: 260, height: 64 },
      image: { width: 320, height: 180 },
      timer: { width: 220, height: 72 },
      counter: { width: 220, height: 110 },
      marquee: { width: 600, height: 64 },
      clock: { width: 320, height: 96 },
      shape: { width: 360, height: 110 },
      soundboard: { width: 500, height: 300 },
      "custom-html": { width: 520, height: 320 },
      particle: { width: 400, height: 400 },
      chat: { width: 440, height: 260 }
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

  function isTextWidgetType(type: string): boolean {
    return type === "text"
      || type === "timer"
      || type === "counter"
      || type === "marquee"
      || type === "clock";
  }

  function updateWidgetEffects(effects: Record<string, unknown>) {
    if (!selectedWidgetId || !socket || !canWidgetEdit) {
      return;
    }

    socket.emit(SocketEvents.WIDGET_UPDATE, {
      id: selectedWidgetId,
      props: {
        effects
      }
    });
  }

  function normalizeEntranceAnimation(value: unknown): EntranceAnimation {
    const allowedTypes = new Set<EntranceAnimationType>([
      "none",
      "fade",
      "slide-up",
      "slide-down",
      "slide-left",
      "slide-right",
      "pop",
      "bounce"
    ]);

    if (!value || typeof value !== "object") {
      return {
        type: "none",
        duration: 400
      };
    }

    const raw = value as { type?: unknown; duration?: unknown };
    const type = typeof raw.type === "string" && allowedTypes.has(raw.type as EntranceAnimationType)
      ? raw.type as EntranceAnimationType
      : "none";
    const durationRaw = typeof raw.duration === "number" && Number.isFinite(raw.duration) ? raw.duration : 400;

    return {
      type,
      duration: Math.max(100, Math.min(2000, Math.floor(durationRaw / 50) * 50))
    };
  }

  function updateWidgetEntranceAnimation(next: EntranceAnimation) {
    if (!selectedWidgetId || !socket || !canWidgetEdit) {
      return;
    }

    socket.emit(SocketEvents.WIDGET_UPDATE, {
      id: selectedWidgetId,
      props: {
        entranceAnimation: next
      }
    });
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

  function toggleWidgetLock() {
    if (!socket || !selectedWidget || !canWidgetTransform) {
      return;
    }

    socket.emit(SocketEvents.WIDGET_LOCK, {
      widgetId: selectedWidget.id,
      locked: !(selectedWidget.locked === true)
    });
  }

  function toggleLeftSidebar() {
    leftSidebarCollapsed = !leftSidebarCollapsed;
    persistBool("anomalist_left_collapsed", leftSidebarCollapsed);
  }

  function toggleRightSidebar() {
    rightSidebarCollapsed = !rightSidebarCollapsed;
    persistBool("anomalist_right_collapsed", rightSidebarCollapsed);
  }

  function toggleLeftWidgetsExpanded() {
    leftWidgetsExpanded = !leftWidgetsExpanded;
    persistBool("anomalist_left_widgets_expanded", leftWidgetsExpanded);
  }

  function toggleLeftScenesExpanded() {
    leftScenesExpanded = !leftScenesExpanded;
    persistBool("anomalist_left_scenes_expanded", leftScenesExpanded);
  }

  function toggleLeftPresetsExpanded() {
    leftPresetsExpanded = !leftPresetsExpanded;
    persistBool("anomalist_left_presets_expanded", leftPresetsExpanded);
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

  function getSceneWidgetCount(scene: CanvasState["scenes"][number]): number {
    return scene.widgets.length;
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

  function saveCurrentPreset() {
    if (!socket || !canSceneManage) {
      return;
    }

    const name = presetNameInput.trim();
    if (!name) {
      return;
    }

    socket.emit(SocketEvents.PRESET_SAVE, { name });
    presetNameInput = "";
    showPresetInput = false;
  }

  function loadPreset(presetId: string) {
    if (!socket || !canSceneManage) {
      return;
    }

    if (!window.confirm("This will replace your current scene widgets. Continue?")) {
      return;
    }

    socket.emit(SocketEvents.PRESET_LOAD, { id: presetId });
  }

  function deletePreset(presetId: string) {
    if (!socket || !canSceneManage) {
      return;
    }

    socket.emit(SocketEvents.PRESET_DELETE, { id: presetId });
  }

  function requestSceneClear(scene: CanvasState["scenes"][number]) {
    sceneToClear = {
      id: scene.id,
      name: scene.name,
      widgetCount: scene.widgets.length
    };
    showSceneClearModal = true;
  }

  function cancelSceneClear() {
    showSceneClearModal = false;
    sceneToClear = null;
  }

  function confirmSceneClear() {
    if (!socket || !sceneToClear || !canWidgetRemove) {
      cancelSceneClear();
      return;
    }

    socket.emit(SocketEvents.SCENE_CLEAR, { sceneId: sceneToClear.id });
    cancelSceneClear();
  }

  function formatPresetDate(value: string): string {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return "Unknown date";
    }

    return new Date(parsed).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
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
    activeCenterPanel = "canvas";
  }

  function openLayersPanel() {
    activeRightTab = "layers";
    activeCenterPanel = "canvas";
  }

  function openSettingsPanel() {
    activeCenterPanel = "settings";
  }

  function openStreamPanel() {
    activeCenterPanel = "stream";
  }

  function openCanvasPanel() {
    activeCenterPanel = "canvas";
  }

  function playSound(sound: SoundEntry) {
    if (!socket) {
      return;
    }

    socket.emit(SocketEvents.PLAY_SOUND, {
      url: sound.url,
      volume: Math.min(1, Math.max(0, sound.volume))
    });
  }

  onMount(() => {
    leftSidebarCollapsed = readStoredBool("anomalist_left_collapsed");
    rightSidebarCollapsed = readStoredBool("anomalist_right_collapsed");
    const isSmallScreen = window.innerWidth < 1024;
    leftWidgetsExpanded = readStoredBoolDefault("anomalist_left_widgets_expanded", !isSmallScreen);
    leftScenesExpanded = readStoredBoolDefault("anomalist_left_scenes_expanded", !isSmallScreen);
    leftPresetsExpanded = readStoredBoolDefault("anomalist_left_presets_expanded", !isSmallScreen);

    const twitchStatus = $page.url.searchParams.get("twitch");
    if (twitchStatus === "connected") {
      addToast("success", "Twitch account connected ✓");
    } else if (twitchStatus === "error") {
      addToast("error", "Couldn't connect Twitch account. Try again.");
    }

    if (twitchStatus) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("twitch");
      window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    }

    void bootstrapAuth();
    return () => {
      disconnectSocket();
      stopTwitchStatusPolling();
      if (settingsSkeletonTimer) {
        clearTimeout(settingsSkeletonTimer);
      }
      cancelSceneClear();
    };
  });

  onDestroy(() => {
    stopTwitchStatusPolling();
    if (settingsSkeletonTimer) {
      clearTimeout(settingsSkeletonTimer);
    }
    cancelSceneClear();
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
            {#if twitchConnectionState !== "unknown"}
              <div class="tooltip tooltip-bottom" data-tip={twitchConnectionState === "connected" ? "Twitch account linked" : "Twitch account not linked"}>
                <div class="flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-3 py-1 text-xs md:text-sm">
                  <span class={`inline-block h-2.5 w-2.5 rounded-full ${twitchConnectionState === "connected" ? "bg-primary" : "bg-base-content/30"}`}></span>
                  <span>{twitchConnectionState === "connected" ? "Connected" : "Twitch not connected"}</span>
                </div>
              </div>
            {/if}
            {#if canUserManage}
              <div class="tooltip tooltip-bottom" data-tip="User management">
                <button type="button" class="btn btn-outline btn-sm" on:click={() => (showUserManagement = true)}>Users</button>
              </div>
            {/if}
            <button type="button" class="btn btn-outline btn-sm" on:click={handleLogout}>Logout</button>
          </div>
        </div>
      </nav>

      <div class="flex h-[calc(100vh-4rem)] overflow-hidden">
        <aside
          class="relative flex shrink-0 flex-col overflow-hidden border-r border-base-300 bg-base-200"
          style={`width:${leftSidebarCollapsed ? 40 : 224}px;transition:width 200ms ease;`}
        >
          <button
            type="button"
            class="btn btn-ghost btn-xs absolute right-1 top-1 z-10"
            aria-label={leftSidebarCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
            on:click={toggleLeftSidebar}
          >
            {leftSidebarCollapsed ? "▶" : "◀"}
          </button>

          {#if !leftSidebarCollapsed}
          <div class="flex min-h-0 flex-1 flex-col">
          <div class="flex-1 overflow-y-auto p-4 pt-8">
            <div class="mb-2 flex items-center justify-between">
              <p class="text-xs font-semibold uppercase tracking-wide text-base-content/60">Widgets</p>
              <button type="button" class="btn btn-ghost btn-xs" aria-label="Toggle widgets section" on:click={toggleLeftWidgetsExpanded}>
                {leftWidgetsExpanded ? "▾" : "▸"}
              </button>
            </div>
            {#if leftWidgetsExpanded}
            <div class="flex flex-col gap-1.5">
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("text")}>Text</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("image")}>Image</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("timer")}>Timer</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("counter")}>Counter</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("marquee")}>Marquee</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("clock")}>Clock</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("shape")}>Shape</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("soundboard")}>Soundboard</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("chat")}>💬 Chat Feed</button>
              <button type="button" class="btn btn-ghost justify-start" disabled={!canWidgetAdd} on:click={() => addWidget("particle")}>Particles ✨</button>
              {#if canAddCustomHtml}
                <button type="button" class="btn btn-ghost justify-start" on:click={() => addWidget("custom-html")}>Custom HTML</button>
              {/if}
              <div class="tooltip tooltip-right" data-tip="Canvas panel">
                <button
                  type="button"
                  class={`btn btn-ghost justify-start ${activeCenterPanel === "canvas" ? "btn-active" : ""}`}
                  on:click={openCanvasPanel}
                >
                  Canvas
                </button>
              </div>

              <div class="tooltip tooltip-right" data-tip="Layers">
                <button
                  type="button"
                  class={`btn btn-ghost justify-start ${activeRightTab === "layers" ? "btn-active" : ""}`}
                  on:click={openLayersPanel}
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="4" rx="1"></rect>
                    <rect x="5" y="10" width="14" height="4" rx="1"></rect>
                    <rect x="7" y="16" width="10" height="4" rx="1"></rect>
                  </svg>
                  Layers
                </button>
              </div>
            </div>
            {/if}

            <div class="divider my-4"></div>

            <div class="mb-2 flex items-center justify-between">
              <p class="text-xs font-semibold uppercase tracking-wide text-base-content/60">Scenes</p>
              <div class="flex items-center gap-1">
                <button type="button" class="btn btn-ghost btn-xs" aria-label="Toggle scenes section" on:click={toggleLeftScenesExpanded}>
                  {leftScenesExpanded ? "▾" : "▸"}
                </button>
                <button type="button" class="btn btn-xs btn-primary" disabled={!canSceneManage} on:click={addScene}>+</button>
              </div>
            </div>
            {#if leftScenesExpanded}
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
                        <span class="truncate">{getSceneName(scene)}</span>
                        <span class="badge badge-neutral badge-sm">{getSceneWidgetCount(scene)}</span>
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

                    {#if scene.id === $canvasState?.activeSceneId && scene.widgets.length > 0}
                      <div class="mt-1">
                        <button
                          type="button"
                          class="btn btn-outline btn-xs w-full text-warning"
                          aria-label="Clear scene"
                          disabled={!canWidgetRemove}
                          on:click={() => requestSceneClear(scene)}
                        >
                          Clear Scene
                        </button>
                      </div>
                    {/if}
                  {/if}
                </div>
              {/each}
            </div>
            {/if}

            {#if scenes.length === 1}
              <p class="mt-2 text-xs text-base-content/60">Add more scenes to save different overlay layouts.</p>
            {/if}

            {#if canSceneManage}
              <div class="mt-4 border-t border-base-300 pt-4">
                <div class="mb-2 flex items-center justify-between">
                  <p class="text-xs font-semibold uppercase tracking-wide text-base-content/60">Presets</p>
                  <button type="button" class="btn btn-ghost btn-xs" aria-label="Toggle presets section" on:click={toggleLeftPresetsExpanded}>
                    {leftPresetsExpanded ? "▾" : "▸"}
                  </button>
                </div>
                {#if leftPresetsExpanded}
                {#if showPresetInput}
                  <div class="mb-2 flex items-center gap-2">
                    <input
                      class="input input-bordered input-sm w-full"
                      placeholder="Preset name"
                      bind:value={presetNameInput}
                      on:keydown={(event) => event.key === "Enter" && saveCurrentPreset()}
                    />
                    <button type="button" class="btn btn-xs btn-primary" on:click={saveCurrentPreset}>OK</button>
                    <button
                      type="button"
                      class="btn btn-xs"
                      on:click={() => {
                        showPresetInput = false;
                        presetNameInput = "";
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                {:else}
                  <button type="button" class="btn btn-sm btn-outline mb-2 w-full" on:click={() => (showPresetInput = true)}>Save Current</button>
                {/if}

                {#if presets.length === 0}
                  <p class="text-sm text-base-content/70">No presets saved yet.</p>
                {:else}
                  <div class="flex flex-col gap-2">
                    {#each presets as preset (preset.id)}
                      <div class="rounded-lg border border-base-300 p-2">
                        <div class="text-sm font-medium">{preset.name}</div>
                        <div class="mb-2 text-xs text-base-content/60">{formatPresetDate(preset.createdAt)}</div>
                        <div class="flex gap-2">
                          <button type="button" class="btn btn-xs btn-primary" on:click={() => loadPreset(preset.id)}>Load</button>
                          <button type="button" class="btn btn-xs btn-error" on:click={() => deletePreset(preset.id)}>Delete</button>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
                {/if}
              </div>
            {/if}

            {#if sceneActionMessage}
              <div class="alert alert-info mt-3 p-2 text-xs">{sceneActionMessage}</div>
            {/if}
          </div>

          {#if canStreamManage || canUserManage}
            <div class="border-t border-base-300 p-4">
              {#if canStreamManage}
                <div class="tooltip tooltip-right" data-tip="Stream tools">
                  <button
                    type="button"
                    class={`btn btn-ghost mb-2 w-full justify-start ${activeCenterPanel === "stream" ? "btn-active" : ""}`}
                    on:click={openStreamPanel}
                  >
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
                      <path d="M12 4a1 1 0 0 1 1 1 4 4 0 1 0 4 4 1 1 0 1 1 2 0 6 6 0 1 1-6-6 1 1 0 0 1-1-1Zm-6.36-.78a1 1 0 0 1 1.41 0l2.12 2.12a1 1 0 0 1-1.41 1.41L5.64 4.64a1 1 0 0 1 0-1.42Zm12.73 0a1 1 0 0 1 0 1.42l-2.12 2.12a1 1 0 0 1-1.41-1.41l2.12-2.12a1 1 0 0 1 1.41 0ZM12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-7 9a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"/>
                    </svg>
                    Stream
                  </button>
                </div>
              {/if}

              <div class="tooltip tooltip-right" data-tip="Dashboard settings">
                <button
                  type="button"
                  class={`btn btn-ghost w-full justify-start ${activeCenterPanel === "settings" ? "btn-active" : ""}`}
                  on:click={openSettingsPanel}
                >
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
                    <path
                      d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.69 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.05.31-.08.63-.08.94s.03.63.08.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.05.72 1.63.95l.36 2.53c.04.25.25.43.5.43h3.84c.25 0 .46-.18.5-.43l.36-2.53c.58-.23 1.13-.55 1.63-.95l2.39.96c.23.09.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
                    />
                  </svg>
                  Settings
                </button>
              </div>
            </div>
          {/if}
          </div>
          {/if}
        </aside>

        <div class="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-base-100 p-4">
          {#key activeCenterPanel}
            <div class="flex h-full w-full items-center justify-center" transition:fade={{ duration: 150 }}>
              {#if activeCenterPanel === "settings"}
                <TwitchSettings />
              {:else if activeCenterPanel === "stream"}
                <StreamManager />
              {:else}
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
              {/if}
            </div>
          {/key}
        </div>

        <aside
          class="relative shrink-0 overflow-hidden border-l border-base-300 bg-base-200"
          style={`width:${rightSidebarCollapsed ? 40 : 320}px;transition:width 200ms ease;`}
        >
          <button
            type="button"
            class="btn btn-ghost btn-xs absolute left-1 top-1 z-10"
            aria-label={rightSidebarCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
            on:click={toggleRightSidebar}
          >
            {rightSidebarCollapsed ? "◀" : "▶"}
          </button>

          {#if !rightSidebarCollapsed}
          <div class="h-full overflow-y-auto p-4 pt-8">
          <div class="tabs tabs-bordered mb-4">
            <div class="tooltip tooltip-left" data-tip="Widget settings">
              <button type="button" class={`tab ${activeRightTab === "settings" ? "tab-active" : ""}`} on:click={() => (activeRightTab = "settings")}>Settings</button>
            </div>
            <div class="tooltip tooltip-left" data-tip="Media library">
              <button type="button" class={`tab ${activeRightTab === "media" ? "tab-active" : ""}`} on:click={() => (activeRightTab = "media")}>Media</button>
            </div>
            <div class="tooltip tooltip-left" data-tip="Widget layers">
              <button type="button" class={`tab ${activeRightTab === "layers" ? "tab-active" : ""}`} on:click={() => (activeRightTab = "layers")}>Layers</button>
            </div>
          </div>

          {#if activeRightTab === "settings"}
            {#if selectedWidget}
              <div class="flex flex-col gap-4">
                <div class="flex items-center justify-between">
                  <span class="badge badge-primary badge-outline">{selectedWidget.type}</span>
                  <div class="flex items-center gap-2">
                    <button type="button" class="btn btn-sm" disabled={!canWidgetTransform} on:click={toggleWidgetLock}>
                      {selectedWidget.locked ? "🔓 Unlock" : "🔒 Lock"}
                    </button>
                    <button type="button" class="btn btn-sm" disabled={!canWidgetVisibility} on:click={toggleWidgetVisibility}>
                      {selectedWidget.visible ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {#if !settingsPanelReady}
                  <div class="space-y-2 rounded-lg border border-base-300 bg-base-100 p-3">
                    <div class="skeleton h-4 w-1/3"></div>
                    <div class="skeleton h-9 w-full"></div>
                    <div class="skeleton h-9 w-full"></div>
                    <div class="skeleton h-16 w-full"></div>
                  </div>
                {:else}

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
                    {:else if selectedWidget.type === "soundboard"}
                      <SoundboardSettings widget={selectedWidget} {socket} />
                    {:else if selectedWidget.type === "chat"}
                      <ChatSettings widget={selectedWidget} {socket} />
                    {:else if selectedWidget.type === "particle"}
                      <ParticleSettings widget={selectedWidget} {socket} />
                    {:else if selectedWidget.type === "custom-html"}
                      <CustomHtmlSettings widget={selectedWidget} {socket} />
                    {/if}
                  {:else}
                    <div class="alert alert-warning text-sm">You can view widgets, but do not have permission to edit widget settings.</div>
                  {/if}

                  {#if canWidgetEdit}
                    <EffectsPanel
                      effects={selectedWidget.props.effects as Record<string, unknown> | undefined}
                      isTextWidget={isTextWidgetType(selectedWidget.type)}
                      on:change={(event) => updateWidgetEffects(event.detail as Record<string, unknown>)}
                    />

                    {@const entranceAnimation = normalizeEntranceAnimation(selectedWidget.props.entranceAnimation)}
                    <section class="flex flex-col gap-3 rounded-lg border border-base-300 bg-base-100 p-3">
                      <h3 class="text-sm font-medium">Animation</h3>

                      <label class="form-control w-full">
                        <span class="label-text mb-1">Type</span>
                        <select
                          class="select select-bordered select-sm w-full"
                          value={entranceAnimation.type}
                          on:change={(event) =>
                            updateWidgetEntranceAnimation({
                              ...entranceAnimation,
                              type: event.currentTarget.value as EntranceAnimationType
                            })}
                        >
                          <option value="none">None</option>
                          <option value="fade">Fade</option>
                          <option value="slide-up">Slide Up</option>
                          <option value="slide-down">Slide Down</option>
                          <option value="slide-left">Slide Left</option>
                          <option value="slide-right">Slide Right</option>
                          <option value="pop">Pop</option>
                          <option value="bounce">Bounce</option>
                        </select>
                      </label>

                      {#if entranceAnimation.type !== "none"}
                        <label class="form-control w-full">
                          <span class="label-text mb-1">Duration: {entranceAnimation.duration}ms</span>
                          <input
                            class="range range-primary range-sm"
                            type="range"
                            min="100"
                            max="2000"
                            step="50"
                            value={entranceAnimation.duration}
                            on:input={(event) =>
                              updateWidgetEntranceAnimation({
                                ...entranceAnimation,
                                duration: Number(event.currentTarget.value) || 400
                              })}
                          />
                        </label>
                      {/if}
                    </section>
                  {/if}

                  <button type="button" class="btn btn-error btn-sm mt-2" disabled={!canWidgetRemove} on:click={removeSelectedWidget}>Remove Widget</button>
                {/if}

              </div>
            {:else}
              <div class="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-base-300 text-center text-base-content/60">
                <div class="text-2xl">Select</div>
                <p>Select a widget to edit</p>
              </div>
            {/if}
          {:else if activeRightTab === "media"}
            <MediaLibrary onSelect={handleMediaSelect} />

            {#if !selectedWidget || selectedWidget.type !== "image"}
              <label class="form-control mt-3">
                <span class="label-text mb-1">Selected URL</span>
                <input class="input input-bordered input-sm" value={selectedMediaUrl} readonly on:focus={(event) => event.currentTarget.select()} />
              </label>
            {/if}
          {:else}
            <LayersPanel
              {socket}
              {widgets}
              {selectedWidgetId}
              activeSceneName={activeScene?.name ?? "Scene"}
              canTransform={canWidgetTransform}
              on:select={(event) => {
                selectedWidgetId = event.detail;
                activeCenterPanel = "canvas";
              }}
            />
          {/if}

          <div class="mt-6 border-t border-base-300 pt-4">
            <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-base-content/70">Sounds</h3>
            {#if allSoundsFromSoundboards.length === 0}
              <p class="text-sm text-base-content/70">Add a Soundboard widget to get started.</p>
            {:else}
              <div class="grid grid-cols-2 gap-2">
                {#each allSoundsFromSoundboards as sound (sound.id)}
                  <button type="button" class="btn btn-sm justify-between" on:click={() => playSound(sound)}>
                    <span class="truncate">{sound.label}</span>
                    <span>play</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          </div>
          {/if}
        </aside>
      </div>

      <UserManagement open={showUserManagement} on:close={() => (showUserManagement = false)} />

      <dialog class={`modal ${showSceneClearModal ? "modal-open" : ""}`}>
        <div class="modal-box">
          <h3 class="text-lg font-semibold">Clear scene?</h3>
          <p class="mt-2 text-sm text-base-content/80">
            Remove all {sceneToClear?.widgetCount ?? 0} widgets from "{sceneToClear?.name ?? "Scene"}"?
          </p>
          <p class="mt-1 text-xs text-base-content/60">This cannot be undone.</p>

          <div class="modal-action">
            <button type="button" class="btn" on:click={cancelSceneClear}>Cancel</button>
            <button type="button" class="btn btn-error" on:click={confirmSceneClear}>Clear Scene</button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" on:click={cancelSceneClear}>close</button>
        </form>
      </dialog>
    </div>
  {/if}

  <Toast />
</main>
