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

  function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
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

  $: content = asString(widget.props.content, "Marquee text");
  $: speed = Math.max(5, Math.min(120, Math.floor(asNumber(widget.props.speed, 20))));
  $: direction = asString(widget.props.direction, "left") === "right" ? "right" : "left";
  $: fontFamily = asString(widget.props.fontFamily, "Arial");
  $: fontSize = Math.max(8, asNumber(widget.props.fontSize, 24));
  $: color = asString(widget.props.color, "#ffffff");
  $: backgroundColor = asString(widget.props.backgroundColor, "transparent");
  $: pauseOnHover = asBoolean(widget.props.pauseOnHover, false);
  $: transparentBg = backgroundColor === "transparent";
</script>

<section class="flex flex-col gap-3">
  <label class="form-control w-full">
    <span class="label-text mb-1">Content</span>
    <textarea
      class="textarea textarea-bordered textarea-sm w-full"
      rows="3"
      value={content}
      on:input={(event) => emitProp("content", event.currentTarget.value)}
    ></textarea>
  </label>

  <FontPicker value={fontFamily} on:change={(event) => emitProp("fontFamily", event.detail)} />

  <label class="form-control w-full">
    <span class="label-text mb-1">Speed ({speed}s)</span>
    <input
      class="range range-primary range-sm"
      type="range"
      min="5"
      max="120"
      step="1"
      value={speed}
      on:input={(event) => emitProp("speed", Number(event.currentTarget.value))}
    />
  </label>

  <div class="form-control w-full">
    <span class="label-text mb-1">Direction</span>
    <div class="join w-full">
      <button
        type="button"
        class={`btn btn-sm join-item flex-1 ${direction === "left" ? "btn-primary" : ""}`}
        on:click={() => emitProp("direction", "left")}
      >
        Left
      </button>
      <button
        type="button"
        class={`btn btn-sm join-item flex-1 ${direction === "right" ? "btn-primary" : ""}`}
        on:click={() => emitProp("direction", "right")}
      >
        Right
      </button>
    </div>
  </div>

  <label class="form-control w-full">
    <span class="label-text mb-1">Font Size</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="8"
      value={fontSize}
      on:input={(event) => emitProp("fontSize", Number(event.currentTarget.value) || 24)}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Text Color</span>
    <div class="rounded-lg border border-base-300 bg-base-100 p-2">
      <input class="h-8 w-full" type="color" value={color} on:input={(event) => emitProp("color", event.currentTarget.value)} />
    </div>
  </label>

  <label class="form-control">
    <span class="label cursor-pointer justify-start gap-3">
      <input
        class="toggle toggle-primary"
        type="checkbox"
        checked={transparentBg}
        on:change={(event) => emitProp("backgroundColor", event.currentTarget.checked ? "transparent" : "#000000")}
      />
      <span class="label-text">Transparent Background</span>
    </span>
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Background Color</span>
    <div class="rounded-lg border border-base-300 bg-base-100 p-2">
      <input
        class="h-8 w-full"
        type="color"
        value={transparentBg ? "#000000" : backgroundColor}
        disabled={transparentBg}
        on:input={(event) => emitProp("backgroundColor", event.currentTarget.value)}
      />
    </div>
  </label>

  <label class="form-control">
    <span class="label cursor-pointer justify-start gap-3">
      <input
        class="toggle toggle-primary"
        type="checkbox"
        checked={pauseOnHover}
        on:change={(event) => emitProp("pauseOnHover", event.currentTarget.checked)}
      />
      <span class="label-text">Pause On Hover</span>
    </span>
  </label>
</section>
