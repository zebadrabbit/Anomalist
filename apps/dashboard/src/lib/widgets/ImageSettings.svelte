<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;

  const dispatch = createEventDispatcher<{ update: Widget }>();

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function emitProps(nextProps: Record<string, unknown>) {
    dispatch("update", {
      ...widget,
      props: {
        ...widget.props,
        ...nextProps
      }
    });
  }

  $: url = asString(widget.props.url, "");
  $: opacity = asNumber(widget.props.opacity, 1);
  $: borderRadius = asNumber(widget.props.borderRadius, 0);
</script>

<section>
  <label>
    Image URL
    <input value={url} on:input={(event) => emitProps({ url: event.currentTarget.value })} />
  </label>

  <label>
    Opacity ({opacity.toFixed(2)})
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={opacity}
      on:input={(event) => emitProps({ opacity: Number(event.currentTarget.value) })}
    />
  </label>

  <label>
    Border Radius
    <input
      type="number"
      min="0"
      value={borderRadius}
      on:input={(event) => emitProps({ borderRadius: Number(event.currentTarget.value) || 0 })}
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
