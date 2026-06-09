<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;
  export let textStyle: string = "";

  let now = Date.now();
  let interval = setInterval(() => {
    now = Date.now();
  }, 250);
  let frozenElapsed = 0;
  let elapsed = 0;
  let fallbackStartedAt = 0;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

  function pad(value: number): string {
    return value.toString().padStart(2, "0");
  }

  function formatTime(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${pad(minutes)}:${pad(remainder)}`;
  }

  $: mode = asString(widget.props.mode, "stopwatch") === "countdown" ? "countdown" : "stopwatch";
  $: durationSeconds = Math.max(0, Math.floor(asNumber(widget.props.durationSeconds, 60)));
  $: startedAt = asNumber(widget.props.startedAt, 0);
  $: resetAt = asNumber(widget.props.resetAt, 0);
  $: running = widget.props.running === true;
  $: fontFamily = normalizeFontName(widget.props.fontFamily);
  $: fontSize = Math.max(8, asNumber(widget.props.fontSize, 32));
  $: color = asString(widget.props.color, "#ffffff");

  $: if (running && startedAt > 0) {
    elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
    frozenElapsed = elapsed;
    fallbackStartedAt = 0;
  } else if (running) {
    // Backward-compatible fallback for clients that emit running=true without startedAt.
    if (fallbackStartedAt <= 0) {
      fallbackStartedAt = now;
    }
    elapsed = Math.max(0, Math.floor((now - fallbackStartedAt) / 1000));
    frozenElapsed = elapsed;
  } else {
    if (resetAt > 0 && startedAt <= 0) {
      frozenElapsed = 0;
      fallbackStartedAt = 0;
    }
    elapsed = frozenElapsed;
  }

  $: displaySeconds = mode === "countdown" ? Math.max(0, durationSeconds - elapsed) : elapsed;

  onDestroy(() => {
    clearInterval(interval);
  });
</script>

<div
  style={`width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;color:${color};`}
>
  <span style={`display:inline-block;font-family:${fontFamilyStyle(fontFamily)};${textStyle}`}>{formatTime(displaySeconds)}</span>
</div>
