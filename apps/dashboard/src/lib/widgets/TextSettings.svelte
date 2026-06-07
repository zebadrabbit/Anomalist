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
  $: fontSize = asNumber(widget.props.fontSize, 24);
  $: color = asString(widget.props.color, "#ffffff");
  $: fontWeight = asString(widget.props.fontWeight, "normal");
  $: backgroundColor = asString(widget.props.backgroundColor, "transparent");
  $: isTransparent = backgroundColor === "transparent";
</script>

<section>
  <label>
    Content
    <input value={content} on:input={(event) => emitProp("content", event.currentTarget.value)} />
  </label>

  <label>
    Font Size
    <input
      type="number"
      min="8"
      value={fontSize}
      on:input={(event) => emitProp("fontSize", Number(event.currentTarget.value) || 24)}
    />
  </label>

  <label>
    Text Color
    <input
      type="color"
      value={color}
      on:input={(event) => emitProp("color", event.currentTarget.value)}
    />
  </label>

  <label class="inline">
    <input
      type="checkbox"
      checked={fontWeight === "bold"}
      on:change={(event) => emitProp("fontWeight", event.currentTarget.checked ? "bold" : "normal")}
    />
    Bold
  </label>

  <label class="inline">
    <input
      type="checkbox"
      checked={isTransparent}
      on:change={(event) =>
        emitProp("backgroundColor", event.currentTarget.checked ? "transparent" : "#000000")}
    />
    Transparent Background
  </label>

  <label>
    Background Color
    <input
      type="color"
      value={isTransparent ? "#000000" : backgroundColor}
      disabled={isTransparent}
      on:input={(event) => emitProp("backgroundColor", event.currentTarget.value)}
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

  .inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
