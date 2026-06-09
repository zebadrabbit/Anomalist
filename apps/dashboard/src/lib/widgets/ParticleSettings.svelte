<script lang="ts">
  import type { Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import type { Socket } from "socket.io-client";

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

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

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
      }, 100);
      debouncers.set(key, debounced);
    }

    debounced(value);
  }

  $: rawPreset = asString(widget.props.preset, "sparkles");
  $: preset = rawPreset === "snow" || rawPreset === "confetti" || rawPreset === "fire" ? rawPreset : "sparkles";
  $: speed = clamp(asNumber(widget.props.speed, 1), 0.1, 3);
  $: density = Math.floor(clamp(asNumber(widget.props.density, 60), 10, 300));
  $: opacity = clamp(asNumber(widget.props.opacity, 0.9), 0, 1);
</script>

<section class="flex flex-col gap-3">
  <div class="form-control w-full">
    <span class="label-text mb-1">Preset</span>
    <div class="grid grid-cols-2 gap-2">
      <button type="button" class={`btn btn-sm ${preset === "sparkles" ? "btn-primary" : "btn-outline"}`} on:click={() => emitProp("preset", "sparkles")}>Sparkles ✨</button>
      <button type="button" class={`btn btn-sm ${preset === "snow" ? "btn-primary" : "btn-outline"}`} on:click={() => emitProp("preset", "snow")}>Snow ❄️</button>
      <button type="button" class={`btn btn-sm ${preset === "confetti" ? "btn-primary" : "btn-outline"}`} on:click={() => emitProp("preset", "confetti")}>Confetti 🎉</button>
      <button type="button" class={`btn btn-sm ${preset === "fire" ? "btn-primary" : "btn-outline"}`} on:click={() => emitProp("preset", "fire")}>Fire 🔥</button>
    </div>
  </div>

  <label class="form-control w-full">
    <span class="label-text mb-1">Speed: {speed.toFixed(1)}x</span>
    <input
      class="range range-primary range-sm"
      type="range"
      min="0.1"
      max="3"
      step="0.1"
      value={speed}
      on:input={(event) => emitProp("speed", Number(event.currentTarget.value) || 1)}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Density: {density} particles</span>
    <input
      class="range range-primary range-sm"
      type="range"
      min="10"
      max="300"
      step="10"
      value={density}
      on:input={(event) => emitProp("density", Number(event.currentTarget.value) || 60)}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Opacity: {opacity.toFixed(2)}</span>
    <input
      class="range range-primary range-sm"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={opacity}
      on:input={(event) => emitProp("opacity", Number(event.currentTarget.value) || 0)}
    />
  </label>
</section>