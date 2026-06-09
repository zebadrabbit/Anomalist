<script lang="ts">
  import type { Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import type { Socket } from "socket.io-client";
  import FontPicker from "../FontPicker.svelte";

  export let widget: Widget;
  export let socket: Socket | null;
  const debouncers = new Map<string, (value: unknown) => void>();

  function debounce(fn: (...args: any[]) => void, ms: number) {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  const emitImmediate = debounce((updates: Record<string, unknown>) => {
    socket?.emit(SocketEvents.WIDGET_UPDATE, {
      id: widget.id,
      props: updates
    });
  }, 0);

  function emitProp(key: string, value: unknown) {
    let debounced = debouncers.get(key);
    if (!debounced) {
      debounced = debounce((nextValue: unknown) => {
        socket?.emit(SocketEvents.WIDGET_UPDATE, {
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
  $: fontFamily = asString(widget.props.fontFamily, "Arial");
  $: fontSize = asNumber(widget.props.fontSize, 32);
  $: color = asString(widget.props.color, "#ffffff");
</script>

<section class="flex flex-col gap-3">
  <label class="form-control w-full">
    <span class="label-text mb-1">Mode</span>
    <select class="select select-bordered select-sm w-full" value={mode} on:change={(event) => emitProp("mode", event.currentTarget.value)}>
      <option value="stopwatch">Stopwatch</option>
      <option value="countdown">Countdown</option>
    </select>
  </label>

  {#if mode === "countdown"}
    <label class="form-control w-full">
      <span class="label-text mb-1">Duration (seconds)</span>
      <input
        class="input input-bordered input-sm w-full"
        type="number"
        min="0"
        value={durationSeconds}
        on:input={(event) => emitProp("durationSeconds", Number(event.currentTarget.value) || 0)}
      />
    </label>
  {/if}

  <div class="flex flex-wrap gap-2">
    <button
      class="btn btn-sm btn-primary"
      type="button"
      on:click={() => emitPropsImmediate({ running: true, startedAt: Date.now() })}
      disabled={running}
    >
      Start
    </button>
    <button class="btn btn-sm" type="button" on:click={() => emitPropsImmediate({ running: false })} disabled={!running}>Stop</button>
    <button
      class="btn btn-sm"
      type="button"
      on:click={() => emitPropsImmediate({ running: false, startedAt: 0, resetAt: Date.now() })}
    >
      Reset
    </button>
  </div>

  <FontPicker value={fontFamily} on:change={(event) => emitProp("fontFamily", event.detail)} />

  <label class="form-control w-full">
    <span class="label-text mb-1">Font Size</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="8"
      value={fontSize}
      on:input={(event) => emitProp("fontSize", Number(event.currentTarget.value) || 32)}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Color</span>
    <div class="rounded-lg border border-base-300 bg-base-100 p-2">
    <input
      class="h-8 w-full"
      type="color"
      value={color}
      on:input={(event) => emitProp("color", event.currentTarget.value)}
    />
    </div>
  </label>
</section>
