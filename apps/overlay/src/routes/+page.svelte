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
  import TextWidget from "../lib/widgets/TextWidget.svelte";
  import TimerWidget from "../lib/widgets/TimerWidget.svelte";

  const JOIN_EVENT = "JOIN";
  const CHAT_BUFFER_MAX = 100;

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
  let activeSounds: HTMLAudioElement[] = [];
  let chatMessages: ChatMessage[] = [];
  let flashedWidgets = new Set<string>();
  const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

  function getChatMessagesForWidget(widget: Widget): ChatMessage[] {
    const maxMessages = Math.min(50, Math.max(1, asNumber(widget.props.maxMessages, 10)));
    const messageTimeout = Math.max(0, asNumber(widget.props.messageTimeout, 0));

    if (messageTimeout <= 0) {
      return chatMessages.slice(0, maxMessages);
    }

    const cutoff = Date.now() - messageTimeout * 1000;
    return chatMessages.filter((item) => item.timestamp >= cutoff).slice(0, maxMessages);
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
      flashedWidgets = new Set();
      clearInterval(chatCleanupInterval);
      socket?.disconnect();
      socket = null;
    };
  });
</script>

<main class="overlay-canvas">
  {#each widgets as widget (widget.id)}
    {#if widget.visible || flashedWidgets.has(widget.id)}
      {@const WidgetComponent = resolveComponent(widget.type)}
      <div
        class="widget-frame"
        style={`left:${transformDrafts[widget.id]?.x ?? widget.x}px;top:${transformDrafts[widget.id]?.y ?? widget.y}px;width:${transformDrafts[widget.id]?.width ?? widget.width}px;height:${transformDrafts[widget.id]?.height ?? widget.height}px;transform:rotate(${transformDrafts[widget.id]?.rotation ?? widget.rotation ?? 0}deg);position:absolute;`}
      >
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
          <svelte:component this={WidgetComponent} {widget} />
        {:else}
          <div class="widget-fallback">{widget.type}</div>
        {/if}
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

</style>
