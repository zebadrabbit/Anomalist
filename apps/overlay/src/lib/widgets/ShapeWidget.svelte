<script lang="ts">
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function hexToRgba(hex: string, alpha: number): string {
    if (hex === "transparent") {
      return "rgba(0,0,0,0)";
    }

    const normalized = hex.trim().replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return `rgba(124,58,237,${clamp(alpha, 0, 1)})`;
    }

    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
  }

  $: shape = asString(widget.props.shape, "rectangle");
  $: fillColor = asString(widget.props.fillColor, "#7c3aed");
  $: fillOpacity = clamp(asNumber(widget.props.fillOpacity, 1), 0, 1);
  $: borderColor = asString(widget.props.borderColor, "transparent");
  $: borderWidth = Math.max(0, Math.min(20, Math.floor(asNumber(widget.props.borderWidth, 0))));
  $: borderOpacity = clamp(asNumber(widget.props.borderOpacity, 1), 0, 1);
  $: borderRadius = shape === "circle" ? "50%" : shape === "pill" ? "999px" : "0px";
</script>

<div
  style={`width:100%;height:100%;box-sizing:border-box;border-radius:${borderRadius};background:${hexToRgba(fillColor, fillOpacity)};border:${borderWidth}px solid ${hexToRgba(borderColor, borderOpacity)};`}
></div>
