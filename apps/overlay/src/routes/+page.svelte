<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { io, type Socket } from "socket.io-client";
  import type { CanvasState, SoundPlay, Widget, WidgetTransform } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import CounterWidget from "../lib/widgets/CounterWidget.svelte";
  import ClockWidget from "../lib/widgets/ClockWidget.svelte";
  import CustomHtmlWidget from "../lib/widgets/CustomHtmlWidget.svelte";
  import ImageWidget from "../lib/widgets/ImageWidget.svelte";
  import MarqueeWidget from "../lib/widgets/MarqueeWidget.svelte";
  import ShapeWidget from "../lib/widgets/ShapeWidget.svelte";
  import SoundboardWidget from "../lib/widgets/SoundboardWidget.svelte";
  import ParticleWidget from "../lib/widgets/ParticleWidget.svelte";
  import TextWidget from "../lib/widgets/TextWidget.svelte";
  import TimerWidget from "../lib/widgets/TimerWidget.svelte";
  import { buildEffectStyles } from "../lib/effects.js";

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

  $: activeScene = $liveState?.scenes.find((scene) => scene.id === $liveState.activeSceneId);
  $: widgets = activeScene?.widgets ?? [];

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

    if (widgetType === "marquee") {
      return MarqueeWidget;
    }

    if (widgetType === "clock") {
      return ClockWidget;
    }

    if (widgetType === "custom-html") {
      return CustomHtmlWidget;
    }

    if (widgetType === "shape") {
      return ShapeWidget;
    }

    if (widgetType === "soundboard") {
      return SoundboardWidget;
    }

    if (widgetType === "particle") {
      return ParticleWidget;
    }

    return null;
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

  function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
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

  function fontFamilyStyle(name: string): string {
    return name ? `'${name.replace(/'/g, "\\'")}', sans-serif` : "inherit";
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

  function isTextWidgetType(widgetType: string): boolean {
    return widgetType === "text"
      || widgetType === "timer"
      || widgetType === "counter"
      || widgetType === "marquee"
      || widgetType === "clock";
  }

  function getChatMessagesForWidget(widget: Widget): ChatMessage[] {
    const maxMessages = Math.min(50, Math.max(1, asNumber(widget.props.maxMessages, 10)));
    const messageTimeout = Math.max(0, asNumber(widget.props.messageTimeout, 0));

    if (messageTimeout <= 0) {
      return chatMessages.slice(0, maxMessages);
    }

    const cutoff = Date.now() - messageTimeout * 1000;
    return chatMessages.filter((item) => item.timestamp >= cutoff).slice(0, maxMessages);
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
  {#each widgets as widget, i (widget.id)}
    {#if widget.visible || flashedWidgets.has(widget.id)}
      {@const WidgetComponent = resolveComponent(widget.type)}
      {@const fontFamily = normalizeFontName(widget.props.fontFamily)}
      {@const _ = ensureFont(fontFamily)}
      {@const isTextWidget = isTextWidgetType(widget.type)}
      {@const effectStyles = buildEffectStyles(widget.props.effects, isTextWidget)}
      {@const entranceAnimation = normalizeEntranceAnimation(widget.props.entranceAnimation)}
      {@const animClass = widgetAnimClasses[widget.id] ?? ""}
      <div
        class="widget-frame"
        style={`left:${transformDrafts[widget.id]?.x ?? widget.x}px;top:${transformDrafts[widget.id]?.y ?? widget.y}px;width:${transformDrafts[widget.id]?.width ?? widget.width}px;height:${transformDrafts[widget.id]?.height ?? widget.height}px;transform:rotate(${transformDrafts[widget.id]?.rotation ?? widget.rotation ?? 0}deg);position:absolute;z-index:${i + 1};font-family:${fontFamily ? fontFamilyStyle(fontFamily) : "inherit"};${widget.type !== "image" ? effectStyles.containerStyle : ""}`}
      >
        <div class={animClass} style={`width:100%;height:100%;--anim-duration:${entranceAnimation.duration}ms;`}>
          {#if widget.type === "chat"}
            <div
              class="chat-widget"
              style={`
              background:${asString(widget.props.background, "rgba(0,0,0,0.5)")};
              border-radius:${Math.max(0, asNumber(widget.props.borderRadius, 8))}px;
              font-size:${Math.max(8, asNumber(widget.props.fontSize, 16))}px;
              color:${asString(widget.props.textColor, "#ffffff")};
              width:100%;
              height:100%;
              overflow:hidden;
              display:flex;
              flex-direction:column-reverse;
              padding:8px;
              box-sizing:border-box;
              gap:4px;
            `}
            >
              {#each getChatMessagesForWidget(widget) as msg (msg.id)}
                <div class="chat-line" style="display:flex;gap:6px;align-items:baseline;flex-shrink:0;">
                  {#if asBoolean(widget.props.showBadges, true)}
                    {#if msg.badges.broadcaster}<span style="font-size:0.75em;opacity:0.8">[Host]</span>{/if}
                    {#if msg.badges.moderator}<span style="font-size:0.75em;opacity:0.8">[Mod]</span>{/if}
                  {/if}
                  <span
                    style={`font-weight:bold;color:${asBoolean(widget.props.colorByUser, true) ? msg.color : asString(widget.props.textColor, "#ffffff")};white-space:nowrap;`}
                  >{msg.username}</span>
                  <span style="opacity:0.9;word-break:break-word;">{msg.message}</span>
                </div>
              {/each}
            </div>
          {:else if WidgetComponent}
            {#if isTextWidget}
              <svelte:component this={WidgetComponent} {widget} textStyle={effectStyles.textStyle} />
            {:else if widget.type === "image"}
              <svelte:component this={WidgetComponent} {widget} imageFilter={effectStyles.containerStyle} />
            {:else}
              <svelte:component this={WidgetComponent} {widget} />
            {/if}
          {:else}
            <div class="widget-fallback">{widget.type}</div>
          {/if}
        </div>
      </div>
    {/if}
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

  @keyframes anim-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes anim-slide-up {
    from { opacity: 0; transform: translateY(40px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes anim-slide-down {
    from { opacity: 0; transform: translateY(-40px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes anim-slide-left {
    from { opacity: 0; transform: translateX(40px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes anim-slide-right {
    from { opacity: 0; transform: translateX(-40px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes anim-pop {
    0% { opacity: 0; transform: scale(0.5); }
    70% { opacity: 1; transform: scale(1.08); }
    100% { transform: scale(1); }
  }

  @keyframes anim-bounce {
    0% { opacity: 0; transform: translateY(60px); }
    50% { opacity: 1; transform: translateY(-12px); }
    75% { transform: translateY(6px); }
    100% { transform: translateY(0); }
  }

  .anim-fade { animation: anim-fade var(--anim-duration, 400ms) ease both; }
  .anim-slide-up { animation: anim-slide-up var(--anim-duration, 400ms) ease both; }
  .anim-slide-down { animation: anim-slide-down var(--anim-duration, 400ms) ease both; }
  .anim-slide-left { animation: anim-slide-left var(--anim-duration, 400ms) ease both; }
  .anim-slide-right { animation: anim-slide-right var(--anim-duration, 400ms) ease both; }
  .anim-pop { animation: anim-pop var(--anim-duration, 400ms) ease both; }
  .anim-bounce { animation: anim-bounce var(--anim-duration, 400ms) ease both; }

</style>
