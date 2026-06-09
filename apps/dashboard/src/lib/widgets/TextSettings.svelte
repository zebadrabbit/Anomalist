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

  $: content = asString(widget.props.content, "Text");
  $: fontFamily = asString(widget.props.fontFamily, "Arial");
  $: fontSize = asNumber(widget.props.fontSize, 24);
  $: color = asString(widget.props.color, "#ffffff");
  $: fontWeight = asString(widget.props.fontWeight, "normal");
  $: backgroundColor = asString(widget.props.backgroundColor, "transparent");
  $: isTransparent = backgroundColor === "transparent";
</script>

<section class="flex flex-col gap-3">
  <label class="form-control w-full">
    <span class="label-text mb-1">Content</span>
    <input class="input input-bordered input-sm w-full" value={content} on:input={(event) => emitProp("content", event.currentTarget.value)} />
  </label>

  <FontPicker value={fontFamily} on:change={(event) => emitProp("fontFamily", event.detail)} />

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
      <input
        class="h-8 w-full"
        type="color"
        value={color}
        on:input={(event) => emitProp("color", event.currentTarget.value)}
      />
    </div>
  </label>

  <label class="form-control">
    <span class="label cursor-pointer justify-start gap-3">
      <input
        class="toggle toggle-primary"
        type="checkbox"
        checked={fontWeight === "bold"}
        on:change={(event) => emitProp("fontWeight", event.currentTarget.checked ? "bold" : "normal")}
      />
      <span class="label-text">Bold</span>
    </span>
  </label>

  <label class="form-control">
    <span class="label cursor-pointer justify-start gap-3">
      <input
        class="toggle toggle-primary"
        type="checkbox"
        checked={isTransparent}
        on:change={(event) =>
          emitProp("backgroundColor", event.currentTarget.checked ? "transparent" : "#000000")}
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
        value={isTransparent ? "#000000" : backgroundColor}
        disabled={isTransparent}
        on:input={(event) => emitProp("backgroundColor", event.currentTarget.value)}
      />
    </div>
  </label>
</section>
