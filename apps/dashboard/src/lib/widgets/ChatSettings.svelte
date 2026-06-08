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

  $: maxMessages = asNumber(widget.props.maxMessages, 10);
  $: fontSize = asNumber(widget.props.fontSize, 16);
  $: showBadges = asBoolean(widget.props.showBadges, true);
  $: colorByUser = asBoolean(widget.props.colorByUser, true);
  $: background = asString(widget.props.background, "rgba(0,0,0,0.5)");
  $: textColor = asString(widget.props.textColor, "#ffffff");
  $: messageTimeout = asNumber(widget.props.messageTimeout, 0);
  $: borderRadius = asNumber(widget.props.borderRadius, 8);
</script>

<section class="flex flex-col gap-3">
  <label class="form-control w-full">
    <span class="label-text mb-1">Max Messages</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="1"
      max="50"
      value={maxMessages}
      on:input={(event) => emitProp("maxMessages", Math.min(50, Math.max(1, Number(event.currentTarget.value) || 10)))}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Font Size (px)</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="8"
      value={fontSize}
      on:input={(event) => emitProp("fontSize", Math.max(8, Number(event.currentTarget.value) || 16))}
    />
  </label>

  <label class="form-control">
    <span class="label cursor-pointer justify-start gap-3">
      <input
        class="toggle toggle-primary"
        type="checkbox"
        checked={showBadges}
        on:change={(event) => emitProp("showBadges", event.currentTarget.checked)}
      />
      <span class="label-text">Show Badges</span>
    </span>
  </label>

  <label class="form-control">
    <span class="label cursor-pointer justify-start gap-3">
      <input
        class="toggle toggle-primary"
        type="checkbox"
        checked={colorByUser}
        on:change={(event) => emitProp("colorByUser", event.currentTarget.checked)}
      />
      <span class="label-text">Color by Username</span>
    </span>
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Background</span>
    <input
      class="input input-bordered input-sm w-full"
      value={background}
      on:input={(event) => emitProp("background", event.currentTarget.value)}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Text Color</span>
    <div class="rounded-lg border border-base-300 bg-base-100 p-2">
      <input
        class="h-8 w-full"
        type="color"
        value={textColor}
        on:input={(event) => emitProp("textColor", event.currentTarget.value)}
      />
    </div>
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Message Timeout (seconds, 0 = never)</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="0"
      value={messageTimeout}
      on:input={(event) => emitProp("messageTimeout", Math.max(0, Number(event.currentTarget.value) || 0))}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Border Radius (px)</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="0"
      value={borderRadius}
      on:input={(event) => emitProp("borderRadius", Math.max(0, Number(event.currentTarget.value) || 0))}
    />
  </label>
</section>
