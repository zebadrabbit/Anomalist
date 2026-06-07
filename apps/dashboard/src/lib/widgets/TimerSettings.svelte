<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;

  const dispatch = createEventDispatcher<{ update: Widget }>();

  let trackedWidgetId = "";
  let originalDuration = 60;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function emitProps(nextProps: Record<string, unknown>) {
    dispatch("update", {
      ...widget,
      props: {
        ...widget.props,
        ...nextProps
      }
    });
  }

  $: mode = asString(widget.props.mode, "stopwatch") === "countdown" ? "countdown" : "stopwatch";
  $: durationSeconds = Math.max(0, Math.floor(asNumber(widget.props.durationSeconds, 60)));
  $: running = widget.props.running === true;
  $: fontSize = asNumber(widget.props.fontSize, 32);
  $: color = asString(widget.props.color, "#ffffff");

  $: if (trackedWidgetId !== widget.id) {
    trackedWidgetId = widget.id;
    originalDuration = durationSeconds;
  }
</script>

<section>
  <label>
    Mode
    <select value={mode} on:change={(event) => emitProps({ mode: event.currentTarget.value, running: false })}>
      <option value="stopwatch">Stopwatch</option>
      <option value="countdown">Countdown</option>
    </select>
  </label>

  {#if mode === "countdown"}
    <label>
      Duration (seconds)
      <input
        type="number"
        min="0"
        value={durationSeconds}
        on:input={(event) => emitProps({ durationSeconds: Number(event.currentTarget.value) || 0 })}
      />
    </label>
  {/if}

  <div class="actions">
    <button type="button" on:click={() => emitProps({ running: true })} disabled={running}>Start</button>
    <button type="button" on:click={() => emitProps({ running: false })} disabled={!running}>Stop</button>
    <button
      type="button"
      on:click={() => emitProps({ running: false, durationSeconds: originalDuration })}
    >
      Reset
    </button>
  </div>

  <label>
    Font Size
    <input
      type="number"
      min="8"
      value={fontSize}
      on:input={(event) => emitProps({ fontSize: Number(event.currentTarget.value) || 32 })}
    />
  </label>

  <label>
    Color
    <input
      type="color"
      value={color}
      on:input={(event) => emitProps({ color: event.currentTarget.value })}
    />
  </label>
</section>

<style>
  section {
    display: grid;
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
    font-size: 0.95rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
