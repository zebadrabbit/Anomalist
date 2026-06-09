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

  $: content = asString(widget.props.content, "Text");
  $: fontSize = asNumber(widget.props.fontSize, 24);
  $: color = asString(widget.props.color, "#ffffff");
  $: fontWeight = asString(widget.props.fontWeight, "normal") === "bold" ? "bold" : "normal";
  $: backgroundColor = asString(widget.props.backgroundColor, "transparent");
  $: fontFamily = normalizeFontName(widget.props.fontFamily);
</script>

<div
  style={`width:100%;height:100%;font-size:${fontSize}px;color:${color};font-weight:${fontWeight};background:${backgroundColor};display:flex;align-items:center;padding:4px 8px;box-sizing:border-box;`}
>
  <span style={`display:inline-block;font-family:${fontFamilyStyle(fontFamily)};${textStyle}`}>{content}</span>
</div>
