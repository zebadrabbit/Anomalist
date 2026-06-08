<script lang="ts">
  import type { Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import type { Socket } from "socket.io-client";

  export let widget: Widget;
  export let socket: Socket | null;

  const debouncers = new Map<string, (value: unknown) => void>();
  const timezoneOptions = [
    { value: "", label: "Local" },
    { value: "America/New_York", label: "America/New_York" },
    { value: "America/Chicago", label: "America/Chicago" },
    { value: "America/Denver", label: "America/Denver" },
    { value: "America/Los_Angeles", label: "America/Los_Angeles" },
    { value: "America/Sao_Paulo", label: "America/Sao_Paulo" },
    { value: "Europe/London", label: "Europe/London" },
    { value: "Europe/Paris", label: "Europe/Paris" },
    { value: "Europe/Berlin", label: "Europe/Berlin" },
    { value: "Asia/Tokyo", label: "Asia/Tokyo" },
    { value: "Asia/Shanghai", label: "Asia/Shanghai" },
    { value: "Asia/Kolkata", label: "Asia/Kolkata" },
    { value: "Australia/Sydney", label: "Australia/Sydney" },
    { value: "Pacific/Auckland", label: "Pacific/Auckland" }
  ];
  const allowedTimezones = new Set(timezoneOptions.map((option) => option.value));

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

  $: format = asString(widget.props.format, "24h") === "12h" ? "12h" : "24h";
  $: showSeconds = asBoolean(widget.props.showSeconds, true);
  $: requestedTimezone = asString(widget.props.timezone, "");
  $: timezone = allowedTimezones.has(requestedTimezone) ? requestedTimezone : "";
  $: fontSize = Math.max(8, asNumber(widget.props.fontSize, 48));
  $: color = asString(widget.props.color, "#ffffff");
  $: fontWeight = asString(widget.props.fontWeight, "bold") === "normal" ? "normal" : "bold";
</script>

<section class="flex flex-col gap-3">
  <div class="form-control w-full">
    <span class="label-text mb-1">Format</span>
    <div class="join w-full">
      <button
        type="button"
        class={`btn btn-sm join-item flex-1 ${format === "12h" ? "btn-primary" : ""}`}
        on:click={() => emitProp("format", "12h")}
      >
        12h
      </button>
      <button
        type="button"
        class={`btn btn-sm join-item flex-1 ${format === "24h" ? "btn-primary" : ""}`}
        on:click={() => emitProp("format", "24h")}
      >
        24h
      </button>
    </div>
  </div>

  <label class="form-control">
    <span class="label cursor-pointer justify-start gap-3">
      <input
        class="toggle toggle-primary"
        type="checkbox"
        checked={showSeconds}
        on:change={(event) => emitProp("showSeconds", event.currentTarget.checked)}
      />
      <span class="label-text">Show Seconds</span>
    </span>
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Timezone</span>
    <select class="select select-bordered select-sm w-full" value={timezone} on:change={(event) => emitProp("timezone", event.currentTarget.value)}>
      {#each timezoneOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Font Size</span>
    <input
      class="input input-bordered input-sm w-full"
      type="number"
      min="8"
      value={fontSize}
      on:input={(event) => emitProp("fontSize", Number(event.currentTarget.value) || 48)}
    />
  </label>

  <label class="form-control w-full">
    <span class="label-text mb-1">Color</span>
    <div class="rounded-lg border border-base-300 bg-base-100 p-2">
      <input class="h-8 w-full" type="color" value={color} on:input={(event) => emitProp("color", event.currentTarget.value)} />
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
</section>
