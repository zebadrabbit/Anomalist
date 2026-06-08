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

  const liveState = writable<CanvasState | null>(null);
  let socket: Socket | null = null;
  let transformDrafts: Record<string, Partial<Widget>> = {};
  let activeSounds: HTMLAudioElement[] = [];

  $: activeScene = $liveState?.scenes.find((scene) => scene.id === $liveState.activeSceneId);
  $: widgets = activeScene?.widgets.filter((widget) => widget.visible) ?? [];

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

  onMount(() => {
    socket = io(window.location.origin);
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

    return () => {
      for (const sound of activeSounds) {
        sound.pause();
        sound.currentTime = 0;
      }
      activeSounds = [];
      socket?.disconnect();
      socket = null;
    };
  });
</script>

<main class="overlay-canvas">
  {#each widgets as widget (widget.id)}
    {@const WidgetComponent = resolveComponent(widget.type)}
    <div
      class="widget-frame"
      style={`left:${transformDrafts[widget.id]?.x ?? widget.x}px;top:${transformDrafts[widget.id]?.y ?? widget.y}px;width:${transformDrafts[widget.id]?.width ?? widget.width}px;height:${transformDrafts[widget.id]?.height ?? widget.height}px;transform:rotate(${transformDrafts[widget.id]?.rotation ?? widget.rotation ?? 0}deg);position:absolute;`}
    >
      {#if WidgetComponent}
        <svelte:component this={WidgetComponent} {widget} />
      {:else}
        <div class="widget-fallback">{widget.type}</div>
      {/if}
    </div>
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
