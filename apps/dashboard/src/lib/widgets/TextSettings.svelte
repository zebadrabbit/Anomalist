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
    <input value={content} on:input={(event) => emitProps({ content: event.currentTarget.value })} />
  </label>

  <label>
    Font Size
    <input
      type="number"
      min="8"
      value={fontSize}
      on:input={(event) => emitProps({ fontSize: Number(event.currentTarget.value) || 24 })}
    />
  </label>

  <label>
    Text Color
    <input
      type="color"
      value={color}
      on:input={(event) => emitProps({ color: event.currentTarget.value })}
    />
  </label>

  <label class="inline">
    <input
      type="checkbox"
      checked={fontWeight === "bold"}
      on:change={(event) => emitProps({ fontWeight: event.currentTarget.checked ? "bold" : "normal" })}
    />
    Bold
  </label>

  <label class="inline">
    <input
      type="checkbox"
      checked={isTransparent}
      on:change={(event) =>
        emitProps({ backgroundColor: event.currentTarget.checked ? "transparent" : "#000000" })}
    />
    Transparent Background
  </label>

  <label>
    Background Color
    <input
      type="color"
      value={isTransparent ? "#000000" : backgroundColor}
      disabled={isTransparent}
      on:input={(event) => emitProps({ backgroundColor: event.currentTarget.value })}
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
