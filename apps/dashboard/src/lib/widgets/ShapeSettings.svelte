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
      }, 150);
      debouncers.set(key, debounced);
    }

    debounced(value);
  }

  $: shape = asString(widget.props.shape, "rectangle");
  $: fillColor = asString(widget.props.fillColor, "#7c3aed");
  $: fillOpacity = clamp(asNumber(widget.props.fillOpacity, 1), 0, 1);
  $: borderColor = asString(widget.props.borderColor, "transparent");
  $: borderWidth = Math.max(0, Math.min(20, Math.floor(asNumber(widget.props.borderWidth, 0))));
  $: borderOpacity = clamp(asNumber(widget.props.borderOpacity, 1), 0, 1);
</script>

<section class="flex flex-col gap-3">
  <div class="form-control w-full">
    <span class="label-text mb-1">Shape</span>
    <div class="join w-full">
      <button
        type="button"
        class={`btn btn-sm join-item flex-1 ${shape === "rectangle" ? "btn-primary" : ""}`}
        on:click={() => emitProp("shape", "rectangle")}
      >
        Rectangle
      </button>
      <button
        type="button"
        class={`btn btn-sm join-item flex-1 ${shape === "circle" ? "btn-primary" : ""}`}
        on:click={() => emitProp("shape", "circle")}
      >
        Circle
      </button>
      <button
        type="button"
        class={`btn btn-sm join-item flex-1 ${shape === "pill" ? "btn-primary" : ""}`}
        on:click={() => emitProp("shape", "pill")}
      >
        Pill
      </button>
    </div>
  </div>

  <label class="form-control w-full">
    <span class="label-text mb-1">Fill Color</span>
    <div class="rounded-lg border border-base-300 bg-base-100 p-2">
      <input class="h-8 w-full" type="color" value={fillColor} on:input={(event) => emitProp("fillColor", event.currentTarget.value)} />
    </div>
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Fill Opacity ({fillOpacity.toFixed(2)})</span>
    <input
      class="range range-primary range-sm"
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={fillOpacity}
      on:input={(event) => emitProp("fillOpacity", Number(event.currentTarget.value))}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Border Color</span>
    <div class="rounded-lg border border-base-300 bg-base-100 p-2">
      <input class="h-8 w-full" type="color" value={borderColor === "transparent" ? "#000000" : borderColor} on:input={(event) => emitProp("borderColor", event.currentTarget.value)} />
    </div>
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Border Width (px)</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="0"
      max="20"
      value={borderWidth}
      on:input={(event) => emitProp("borderWidth", Number(event.currentTarget.value) || 0)}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Border Opacity ({borderOpacity.toFixed(2)})</span>
    <input
      class="range range-primary range-sm"
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={borderOpacity}
      on:input={(event) => emitProp("borderOpacity", Number(event.currentTarget.value))}
    />
  </label>
</section>
