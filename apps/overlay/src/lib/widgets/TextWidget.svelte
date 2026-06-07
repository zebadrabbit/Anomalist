<script lang="ts">
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  $: content = asString(widget.props.content, "Text");
  $: fontSize = asNumber(widget.props.fontSize, 24);
  $: color = asString(widget.props.color, "#ffffff");
  $: fontWeight = asString(widget.props.fontWeight, "normal") === "bold" ? "bold" : "normal";
  $: backgroundColor = asString(widget.props.backgroundColor, "transparent");
</script>

<div
  style={`position:absolute;left:${widget.x}px;top:${widget.y}px;width:${widget.width}px;height:${widget.height}px;font-size:${fontSize}px;color:${color};font-weight:${fontWeight};background:${backgroundColor};display:flex;align-items:center;padding:4px 8px;box-sizing:border-box;`}
>
  {content}
</div>
