<script lang="ts">
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;
  export let textStyle: string = "";

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
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

  function fontFamilyStyle(name: string): string {
    return name ? `'${name.replace(/'/g, "\\'")}', sans-serif` : "inherit";
  }

  $: content = asString(widget.props.content, "Marquee text");
  $: speed = Math.max(5, Math.min(120, Math.floor(asNumber(widget.props.speed, 20))));
  $: direction = asString(widget.props.direction, "left") === "right" ? "right" : "left";
  $: fontSize = Math.max(8, asNumber(widget.props.fontSize, 24));
  $: color = asString(widget.props.color, "#ffffff");
  $: backgroundColor = asString(widget.props.backgroundColor, "transparent");
  $: pauseOnHover = asBoolean(widget.props.pauseOnHover, false);
  $: fontFamily = normalizeFontName(widget.props.fontFamily);
</script>

<div class="marquee-shell" style={`background:${backgroundColor};`}>
  <span
    class={`marquee-content ${direction === "right" ? "reverse" : ""} ${pauseOnHover ? "pause-on-hover" : ""}`}
    style={`display:inline-block;animation-duration:${speed}s;font-size:${fontSize}px;color:${color};font-family:${fontFamilyStyle(fontFamily)};${textStyle}`}
  >
    {content}
  </span>
</div>

<style>
  .marquee-shell {
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
  }

  .marquee-content {
    white-space: nowrap;
    display: inline-block;
    animation-name: marquee-left;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }

  .marquee-content.reverse {
    animation-direction: reverse;
  }

  .marquee-content.pause-on-hover:hover {
    animation-play-state: paused;
  }

  @keyframes marquee-left {
    0% {
      transform: translateX(100%);
    }

    100% {
      transform: translateX(-100%);
    }
  }
</style>
