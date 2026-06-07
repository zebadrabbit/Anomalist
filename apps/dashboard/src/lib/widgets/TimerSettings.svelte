<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Widget, WidgetUpdate } from "@anomalist/types";

  export let widget: Widget;

  const dispatch = createEventDispatcher<{ update: WidgetUpdate }>();
  const debouncers = new Map<string, (value: unknown) => void>();

  function debounce(fn: (...args: any[]) => void, ms: number) {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  let trackedWidgetId = "";
  let originalDuration = 60;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  const emitImmediate = debounce((updates: Record<string, unknown>) => {
    dispatch("update", {
      id: widget.id,
      props: updates
    });
  }, 0);

  function emitProp(key: string, value: unknown) {
    let debounced = debouncers.get(key);
    if (!debounced) {
      debounced = debounce((nextValue: unknown) => {
        dispatch("update", {
          id: widget.id,
          props: {
            [key]: nextValue
          }
        });
      }, 150);
      debouncers.set(key, debounced);
    }

    debounced(value);
  }

  function emitPropsImmediate(updates: Record<string, unknown>) {
    emitImmediate(updates);
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
    <select value={mode} on:change={(event) => emitProp("mode", event.currentTarget.value)}>
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
        on:input={(event) => emitProp("durationSeconds", Number(event.currentTarget.value) || 0)}
      />
    </label>
  {/if}

  <div class="actions">
    <button type="button" on:click={() => emitPropsImmediate({ running: true })} disabled={running}>Start</button>
    <button type="button" on:click={() => emitPropsImmediate({ running: false })} disabled={!running}>Stop</button>
    <button
      type="button"
      on:click={() => emitPropsImmediate({ running: false, durationSeconds: originalDuration })}
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
      on:input={(event) => emitProp("fontSize", Number(event.currentTarget.value) || 32)}
    />
  </label>

  <label>
    Color
    <input
      type="color"
      value={color}
      on:input={(event) => emitProp("color", event.currentTarget.value)}
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
