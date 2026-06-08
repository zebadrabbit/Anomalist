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

<section class="flex flex-col gap-3">
  <div class="flex gap-2">
    <button type="button" class="btn btn-sm btn-primary" on:click={() => emitPropsImmediate({ value: value - step })}>-</button>
    <button type="button" class="btn btn-sm btn-primary" on:click={() => emitPropsImmediate({ value: value + step })}>+</button>
  </div>

  <label class="form-control w-full">
    <span class="label-text mb-1">Step</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="1"
      value={step}
      on:input={(event) => emitProp("step", Number(event.currentTarget.value) || 1)}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Label</span>
    <input class="input input-bordered input-sm w-full" value={label} on:input={(event) => emitProp("label", event.currentTarget.value)} />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Font Size</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="8"
      max="200"
      value={fontSize}
      on:input={(event) => emitProp("fontSize", Number(event.currentTarget.value) || 8)}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Color</span>
    <div class="rounded-lg border border-base-300 bg-base-100 p-2">
      <input class="h-8 w-full" type="color" value={color} on:input={(event) => emitProp("color", event.currentTarget.value)} />
    </div>
  </label>

  <button class="btn btn-sm" type="button" on:click={() => emitPropsImmediate({ value: 0 })}>Reset</button>
</section>
