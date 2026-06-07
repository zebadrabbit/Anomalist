<script lang="ts">
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  $: url = asString(widget.props.url, "");
  $: opacity = Math.min(1, Math.max(0, asNumber(widget.props.opacity, 1)));
  $: borderRadius = Math.max(0, asNumber(widget.props.borderRadius, 0));
</script>

<div
  style={`position:absolute;left:${widget.x}px;top:${widget.y}px;width:${widget.width}px;height:${widget.height}px;opacity:${opacity};border-radius:${borderRadius}px;overflow:hidden;box-sizing:border-box;`}
>
  {#if url}
    <img
      src={url}
      alt="image widget"
      style="width:100%;height:100%;object-fit:contain;display:block;"
    />
  {:else}
    <div
      style="width:100%;height:100%;border:2px dashed rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:14px;"
    >
      No image URL
    </div>
  {/if}
</div>
