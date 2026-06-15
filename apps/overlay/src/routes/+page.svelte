<script lang="ts">
  import { onMount } from "svelte";
  import { get, writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState, SceneTransitionType, SoundPlay, Widget, WidgetTransform } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import SceneLayer from "../lib/SceneLayer.svelte";

  const JOIN_EVENT = "JOIN";
  const CHAT_BUFFER_MAX = 100;
  const SYSTEM_FONT_NAMES = new Set(["Arial", "Helvetica", "Georgia", "Times New Roman", "Courier New", "Impact"]);

  interface ChatMessage {
    id: string;
    username: string;
    color: string;
    message: string;
    badges: Record<string, string>;
    timestamp: number;
  }

  const liveState = writable<CanvasState | null>(null);
  let socket: Socket | null = null;
  let transformDrafts: Record<string, Partial<Widget>> = {};
  let widgetAnimClasses: Record<string, string> = {};
  let activeSounds: HTMLAudioElement[] = [];
  let chatMessages: ChatMessage[] = [];
  let flashedWidgets = new Set<string>();
  const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const animTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const prevVisibleById = new Map<string, boolean>();

  // --- Scene transition state ---
  // The incoming (current) layer always renders the active scene's live widgets.
  // During a non-cut transition we also mount an `outgoing` layer holding a frozen
  // snapshot of the scene we are leaving, and animate both.
  let displayedSceneId: string | null = null;
  let outgoing: { key: string; widgets: Widget[] } | null = null;
  let incomingKey = "scene";
  let incomingClass = "";
  let outgoingClass = "";
  let transitionDurationMs = 400;
  let transitionTimer: ReturnType<typeof setTimeout> | null = null;
  let layerSeq = 0;

  $: activeScene = $liveState?.scenes.find((scene) => scene.id === $liveState.activeSceneId);
  $: widgets = activeScene?.widgets ?? [];

  function transitionClasses(type: SceneTransitionType): { in: string; out: string } {
    switch (type) {
      case "fade":
        return { in: "layer-fade-in", out: "layer-fade-out" };
      case "slide-left":
        return { in: "layer-slide-in-left", out: "layer-slide-out-left" };
      case "slide-right":
        return { in: "layer-slide-in-right", out: "layer-slide-out-right" };
      default:
        return { in: "", out: "" };
    }
  }

  // Jump any in-flight transition to its end state: drop the outgoing layer and
  // clear animation classes (which also removes their will-change).
  function finalizeTransition(): void {
    if (transitionTimer) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
    }
    outgoing = null;
    outgoingClass = "";
    incomingClass = "";
  }

  function handleSceneTransition(nextState: CanvasState): void {
    const previousState = get(liveState);
    const newActiveId = nextState.activeSceneId;
    const transition = nextState.transition ?? { type: "cut" as SceneTransitionType, duration: 400 };

    // First state ever, or only widget edits within the same scene: no transition.
    if (displayedSceneId === null || newActiveId === displayedSceneId) {
      displayedSceneId = newActiveId;
      return;
    }

    if (transition.type === "cut") {
      finalizeTransition();
      displayedSceneId = newActiveId;
      return;
    }

    // Animated switch. If one is already running, finalize it first so we never
    // stack three scenes — the in-flight incoming becomes the new outgoing.
    finalizeTransition();

    const leavingScene = previousState?.scenes.find((scene) => scene.id === displayedSceneId);
    const leavingWidgets = leavingScene ? leavingScene.widgets.map((widget) => ({ ...widget })) : [];

    layerSeq += 1;
    const classes = transitionClasses(transition.type);
    outgoing = { key: `out-${layerSeq}`, widgets: leavingWidgets };
    outgoingClass = classes.out;
    incomingKey = `in-${layerSeq}`; // changing the key remounts the layer so its CSS animation replays
    incomingClass = classes.in;
    transitionDurationMs = transition.duration;
    displayedSceneId = newActiveId;

    transitionTimer = setTimeout(() => {
      finalizeTransition();
    }, transition.duration);
  }

  async function playSound(data: SoundPlay) {
    if (!data.url || !data.url.startsWith("/media/")) {
      return;
    }

    if (activeSounds.length >= 4) {
      const oldest = activeSounds.shift();
      if (oldest) {
        oldest.pause();
        oldest.currentTime = 0;
      }
    }

    const audio = new Audio(data.url);
    audio.volume = Math.min(1, Math.max(0, Number.isFinite(data.volume) ? data.volume : 1));
    activeSounds.push(audio);

    const cleanup = () => {
      activeSounds = activeSounds.filter((item) => item !== audio);
    };

    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });

    try {
      await audio.play();
    } catch {
      cleanup();
    }
  }

  function flashWidget(widgetId: string, duration: number): void {
    if (!widgetId) {
      return;
    }

    const timeoutMs = Math.max(1, Number.isFinite(duration) ? duration : 5) * 1000;
    const existingTimer = flashTimers.get(widgetId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    flashedWidgets.add(widgetId);
    flashedWidgets = new Set(flashedWidgets);

    const timer = setTimeout(() => {
      flashedWidgets.delete(widgetId);
      flashedWidgets = new Set(flashedWidgets);
      flashTimers.delete(widgetId);
    }, timeoutMs);

    flashTimers.set(widgetId, timer);
  }

  function normalizeFontName(value: unknown): string {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const withoutFallback = trimmed.split(",")[0]?.trim() ?? "";
    return withoutFallback.replace(/^['\"]+|['\"]+$/g, "").trim();
  }

  function ensureFont(name: string) {
    const normalized = normalizeFontName(name);
    if (!normalized || SYSTEM_FONT_NAMES.has(normalized)) {
      return;
    }

    const id = `gf-${normalized.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) {
      return;
    }

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(normalized)}&display=swap`;
    document.head.appendChild(link);
  }

  function injectAllWidgetFonts(state: CanvasState): void {
    for (const scene of state.scenes) {
      for (const widget of scene.widgets) {
        const font = normalizeFontName(widget.props.fontFamily);
        if (font) {
          ensureFont(font);
        }
      }
    }
  }

  function normalizeEntranceAnimation(value: unknown): { type: string; duration: number } {
    const allowedTypes = new Set([
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
      return { type: "none", duration: 400 };
    }

    const raw = value as { type?: unknown; duration?: unknown };
    const type = typeof raw.type === "string" && allowedTypes.has(raw.type) ? raw.type : "none";
    const durationRaw = typeof raw.duration === "number" && Number.isFinite(raw.duration) ? raw.duration : 400;
    const duration = Math.max(100, Math.min(2000, Math.floor(durationRaw)));

    return { type, duration };
  }

  // Entrance animations replay only when a widget toggles invisible→visible inside
  // the active scene; first appearances (scene load/switch) are recorded silently.
  $: {
    const activeIds = new Set(widgets.map((widget) => widget.id));

    for (const widgetId of prevVisibleById.keys()) {
      if (!activeIds.has(widgetId)) {
        prevVisibleById.delete(widgetId);
        const animTimer = animTimers.get(widgetId);
        if (animTimer) {
          clearTimeout(animTimer);
          animTimers.delete(widgetId);
        }
        if (widgetAnimClasses[widgetId]) {
          const nextClasses = { ...widgetAnimClasses };
          delete nextClasses[widgetId];
          widgetAnimClasses = nextClasses;
        }
      }
    }

    for (const widget of widgets) {
      const isVisible = widget.visible === true;
      const prevVisible = prevVisibleById.get(widget.id);

      if (prevVisible === undefined) {
        prevVisibleById.set(widget.id, isVisible);
        continue;
      }

      if (isVisible && !prevVisible) {
        const animation = normalizeEntranceAnimation(widget.props.entranceAnimation);
        if (animation.type !== "none") {
          widgetAnimClasses = {
            ...widgetAnimClasses,
            [widget.id]: `anim-${animation.type}`
          };

          const existingTimer = animTimers.get(widget.id);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            if (widgetAnimClasses[widget.id]) {
              const nextClasses = { ...widgetAnimClasses };
              delete nextClasses[widget.id];
              widgetAnimClasses = nextClasses;
            }
            animTimers.delete(widget.id);
          }, animation.duration + 50);

          animTimers.set(widget.id, timer);
        }
      }

      prevVisibleById.set(widget.id, isVisible);
    }
  }

  onMount(() => {
    socket = io(window.location.origin);
    const chatCleanupInterval = setInterval(() => {
      const cutoff = Date.now() - 120_000;
      chatMessages = chatMessages.filter((item) => item.timestamp > cutoff);
    }, 10_000);

    const joinToken = new URLSearchParams(window.location.search).get("token");
    if (joinToken) {
      socket.emit(JOIN_EVENT, { token: joinToken });
    }

    socket.on(SocketEvents.WIDGET_TRANSFORM, (data: WidgetTransform) => {
      const { id, ...transform } = data;
      transformDrafts = {
        ...transformDrafts,
        [id]: {
          ...(transformDrafts[id] ?? {}),
          ...transform
        }
      };
    });

    socket.on(SocketEvents.CANVAS_UPDATE, (nextState: CanvasState) => {
      // Decide on a transition using the OLD store value before we swap it in.
      handleSceneTransition(nextState);
      liveState.set(nextState);

      // Initial canvas state and subsequent updates both arrive via CANVAS_UPDATE.
      injectAllWidgetFonts(nextState);

      transformDrafts = {};
    });

    socket.on(SocketEvents.PLAY_SOUND, (data: SoundPlay) => {
      void playSound(data);
    });

    socket.on(SocketEvents.CHAT_MESSAGE, (msg: ChatMessage) => {
      chatMessages = [msg, ...chatMessages].slice(0, CHAT_BUFFER_MAX);
    });

    socket.on(SocketEvents.TWITCH_ALERT, (alert: {
      soundUrl?: string;
      widgetId?: string;
      duration?: number;
    }) => {
      if (typeof alert.soundUrl === "string" && alert.soundUrl) {
        void playSound({ url: alert.soundUrl, volume: 1 });
      }

      if (typeof alert.widgetId === "string" && alert.widgetId) {
        flashWidget(alert.widgetId, typeof alert.duration === "number" ? alert.duration : 5);
      }
    });

    return () => {
      for (const sound of activeSounds) {
        sound.pause();
        sound.currentTime = 0;
      }
      activeSounds = [];
      for (const timer of flashTimers.values()) {
        clearTimeout(timer);
      }
      flashTimers.clear();
      for (const timer of animTimers.values()) {
        clearTimeout(timer);
      }
      animTimers.clear();
      if (transitionTimer) {
        clearTimeout(transitionTimer);
        transitionTimer = null;
      }
      prevVisibleById.clear();
      widgetAnimClasses = {};
      flashedWidgets = new Set();
      clearInterval(chatCleanupInterval);
      socket?.disconnect();
      socket = null;
    };
  });
</script>

<main class="overlay-canvas">
  {#if outgoing}
    <div class={`scene-layer ${outgoingClass}`} style={`--transition-duration:${transitionDurationMs}ms;`}>
      <SceneLayer
        widgets={outgoing.widgets}
        transformDrafts={{}}
        widgetAnimClasses={{}}
        {chatMessages}
        {flashedWidgets}
      />
    </div>
  {/if}

  {#key incomingKey}
    <div class={`scene-layer ${incomingClass}`} style={`--transition-duration:${transitionDurationMs}ms;`}>
      <SceneLayer {widgets} {transformDrafts} {widgetAnimClasses} {chatMessages} {flashedWidgets} />
    </div>
  {/key}
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

  /* Both transition layers fill the canvas and stay transparent so OBS never
     sees a flash of the body background between scenes. */
  .scene-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: transparent;
  }

  @keyframes layer-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes layer-fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @keyframes layer-slide-in-left {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  @keyframes layer-slide-out-left {
    from { transform: translateX(0); }
    to { transform: translateX(-100%); }
  }

  @keyframes layer-slide-in-right {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }

  @keyframes layer-slide-out-right {
    from { transform: translateX(0); }
    to { transform: translateX(100%); }
  }

  .layer-fade-in {
    animation: layer-fade-in var(--transition-duration, 400ms) ease both;
    will-change: opacity;
  }

  .layer-fade-out {
    animation: layer-fade-out var(--transition-duration, 400ms) ease both;
    will-change: opacity;
  }

  .layer-slide-in-left {
    animation: layer-slide-in-left var(--transition-duration, 400ms) ease both;
    will-change: transform;
  }

  .layer-slide-out-left {
    animation: layer-slide-out-left var(--transition-duration, 400ms) ease both;
    will-change: transform;
  }

  .layer-slide-in-right {
    animation: layer-slide-in-right var(--transition-duration, 400ms) ease both;
    will-change: transform;
  }

  .layer-slide-out-right {
    animation: layer-slide-out-right var(--transition-duration, 400ms) ease both;
    will-change: transform;
  }
</style>
