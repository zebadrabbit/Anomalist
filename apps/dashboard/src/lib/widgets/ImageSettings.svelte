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

  $: url = asString(widget.props.url, "");
  $: opacity = asNumber(widget.props.opacity, 1);
  $: borderRadius = asNumber(widget.props.borderRadius, 0);
</script>

<section>
  <label>
    Image URL
    <input value={url} on:input={(event) => emitProp("url", event.currentTarget.value)} />
  </label>

  <label>
    Opacity ({opacity.toFixed(2)})
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={opacity}
      on:input={(event) => emitProp("opacity", Number(event.currentTarget.value))}
    />
  </label>

  <label>
    Border Radius
    <input
      type="number"
      min="0"
      value={borderRadius}
      on:input={(event) => emitProp("borderRadius", Number(event.currentTarget.value) || 0)}
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
</style>
