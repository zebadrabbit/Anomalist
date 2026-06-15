<script lang="ts">
  import type { Widget } from "@anomalist/types";
  import CounterWidget from "./widgets/CounterWidget.svelte";
  import ClockWidget from "./widgets/ClockWidget.svelte";
  import CustomHtmlWidget from "./widgets/CustomHtmlWidget.svelte";
  import ImageWidget from "./widgets/ImageWidget.svelte";
  import MarqueeWidget from "./widgets/MarqueeWidget.svelte";
  import ShapeWidget from "./widgets/ShapeWidget.svelte";
  import SoundboardWidget from "./widgets/SoundboardWidget.svelte";
  import ParticleWidget from "./widgets/ParticleWidget.svelte";
  import TextWidget from "./widgets/TextWidget.svelte";
  import TimerWidget from "./widgets/TimerWidget.svelte";
  import { buildEffectStyles } from "./effects.js";

  interface ChatMessage {
    id: string;
    username: string;
    color: string;
    message: string;
    badges: Record<string, string>;
    timestamp: number;
  }

  const SYSTEM_FONT_NAMES = new Set(["Arial", "Helvetica", "Georgia", "Times New Roman", "Courier New", "Impact"]);

  export let widgets: Widget[] = [];
  export let transformDrafts: Record<string, Partial<Widget>> = {};
  export let widgetAnimClasses: Record<string, string> = {};
  export let chatMessages: ChatMessage[] = [];
  export let flashedWidgets: Set<string> = new Set();

  function resolveComponent(widgetType: string) {
    if (widgetType === "text") return TextWidget;
    if (widgetType === "image") return ImageWidget;
    if (widgetType === "timer") return TimerWidget;
    if (widgetType === "counter") return CounterWidget;
    if (widgetType === "marquee") return MarqueeWidget;
    if (widgetType === "clock") return ClockWidget;
    if (widgetType === "custom-html") return CustomHtmlWidget;
    if (widgetType === "shape") return ShapeWidget;
    if (widgetType === "soundboard") return SoundboardWidget;
    if (widgetType === "particle") return ParticleWidget;
    return null;
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

  function ensureFont(name: string): string {
    const normalized = normalizeFontName(name);
    if (!normalized || SYSTEM_FONT_NAMES.has(normalized) || typeof document === "undefined") {
      return normalized;
    }

    const id = `gf-${normalized.replace(/\s+/g, "-")}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(normalized)}&display=swap`;
      document.head.appendChild(link);
    }

    return normalized;
  }

  function fontFamilyStyle(name: string): string {
    return name ? `'${name.replace(/'/g, "\\'")}', sans-serif` : "inherit";
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
</script>

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

<style>
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
