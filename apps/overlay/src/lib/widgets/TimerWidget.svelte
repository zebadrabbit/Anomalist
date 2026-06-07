<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;

  let currentSeconds = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastIdentity = "";

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
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
  $: running = asBoolean(widget.props.running, false);
  $: fontSize = Math.max(8, asNumber(widget.props.fontSize, 32));
  $: color = asString(widget.props.color, "#ffffff");

  $: identity = `${widget.id}:${mode}:${durationSeconds}`;
  $: if (identity !== lastIdentity) {
    lastIdentity = identity;
    currentSeconds = mode === "countdown" ? durationSeconds : 0;
  }

  onMount(() => {
    intervalId = setInterval(() => {
      if (!running) {
        return;
      }

      if (mode === "countdown") {
        if (currentSeconds > 0) {
          currentSeconds -= 1;
        }

        if (currentSeconds <= 0) {
          currentSeconds = 0;
        }
        return;
      }

      currentSeconds += 1;
    }, 1000);
  });

  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });
</script>

<div
  style={`width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;color:${color};font-variant-numeric:tabular-nums;`}
>
  {formatTime(currentSeconds)}
</div>
