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

  $: value = Math.floor(asNumber(widget.props.value, 0));
  $: step = Math.max(1, asNumber(widget.props.step, 1));
  $: label = asString(widget.props.label, "");
  $: fontSize = asNumber(widget.props.fontSize, 32);
  $: color = asString(widget.props.color, "#ffffff");
</script>

<section>
  <div class="counter-actions">
    <button type="button" class="big" on:click={() => emitPropsImmediate({ value: value - step })}>-</button>
    <button type="button" class="big" on:click={() => emitPropsImmediate({ value: value + step })}>+</button>
  </div>

  <label>
    Step
    <input
      type="number"
      min="1"
      value={step}
      on:input={(event) => emitProp("step", Number(event.currentTarget.value) || 1)}
    />
  </label>

  <label>
    Label
    <input value={label} on:input={(event) => emitProp("label", event.currentTarget.value)} />
  </label>

  <label>
    Font Size
    <input
      type="number"
      min="8"
      max="200"
      value={fontSize}
      on:input={(event) => emitProp("fontSize", Number(event.currentTarget.value) || 8)}
    />
  </label>

  <label>
    Color
    <input type="color" value={color} on:input={(event) => emitProp("color", event.currentTarget.value)} />
  </label>

  <button type="button" on:click={() => emitPropsImmediate({ value: 0 })}>Reset</button>
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

  .counter-actions {
    display: flex;
    gap: 0.5rem;
  }

  .big {
    min-width: 3rem;
    min-height: 2.5rem;
    font-size: 1.4rem;
    font-weight: 700;
  }
</style>
