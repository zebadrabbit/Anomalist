<script lang="ts">
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;
  export let textStyle: string = "";

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function normalizeFontName(value: unknown): string {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const withoutFallback = trimmed.split(",")[0]?.trim() ?? "";
    return withoutFallback.replace(/^['\"]+|['\"]+$/g, "").trim();
  }

  function fontFamilyStyle(name: string): string {
    return name ? `'${name.replace(/'/g, "\\'")}', sans-serif` : "inherit";
  }

  $: value = Math.floor(asNumber(widget.props.value, 0));
  $: label = asString(widget.props.label, "");
  $: fontFamily = normalizeFontName(widget.props.fontFamily);
  $: fontSize = Math.max(8, asNumber(widget.props.fontSize, 32));
  $: color = asString(widget.props.color, "#ffffff");
</script>

<div
  style={`width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:${color};`}
>
  {#if label}
    <div style={`font-size:${Math.max(12, Math.floor(fontSize * 0.5))}px;line-height:1.2;opacity:0.9;`}>{label}</div>
  {/if}
  <div style={`font-size:${fontSize}px;line-height:1.1;font-family:${fontFamilyStyle(fontFamily)};${textStyle}`}>{value}</div>
</div>
