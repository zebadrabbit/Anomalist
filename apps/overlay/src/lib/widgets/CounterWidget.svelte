<script lang="ts">
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  $: value = Math.floor(asNumber(widget.props.value, 0));
  $: label = asString(widget.props.label, "");
  $: fontSize = Math.max(8, asNumber(widget.props.fontSize, 32));
  $: color = asString(widget.props.color, "#ffffff");
</script>

<div
  style={`width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:${color};`}
>
  {#if label}
    <div style={`font-size:${Math.max(12, Math.floor(fontSize * 0.5))}px;line-height:1.2;opacity:0.9;`}>{label}</div>
  {/if}
  <div style={`font-size:${fontSize}px;line-height:1.1;font-variant-numeric:tabular-nums;`}>{value}</div>
</div>
