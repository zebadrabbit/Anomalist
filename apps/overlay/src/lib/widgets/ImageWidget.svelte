<script lang="ts">
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;
  export let imageFilter: string = "";

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function getAltText(imageUrl: string): string {
    if (!imageUrl || imageUrl.startsWith("data:")) {
      return "Stream overlay image";
    }

    const withoutQuery = imageUrl.split("?")[0].split("#")[0];
    const filename = withoutQuery.split("/").filter(Boolean).pop();
    if (!filename) {
      return "Stream overlay image";
    }

    try {
      return decodeURIComponent(filename);
    } catch {
      return filename;
    }
  }

  $: url = asString(widget.props.url, "");
  $: opacity = Math.min(1, Math.max(0, asNumber(widget.props.opacity, 1)));
  function isVideoUrl(value: string): boolean {
    const path = value.split("?")[0].split("#")[0].toLowerCase();
    return /\.(mp4|webm|mpeg|mpg|mov|ogv|m4v)$/.test(path);
  }

  $: borderRadius = Math.max(0, asNumber(widget.props.borderRadius, 0));
  $: altText = getAltText(url);
  $: isVideo = isVideoUrl(url);
</script>

<div
  style={`width:100%;height:100%;border-radius:${borderRadius}px;overflow:hidden;box-sizing:border-box;`}
>
  {#if url && isVideo}
    <!-- svelte-ignore a11y-media-has-caption -->
    <video
      src={url}
      muted
      autoplay
      loop
      playsinline
      style={`width:100%;height:100%;object-fit:contain;display:block;opacity:${opacity};${imageFilter}`}
    ></video>
  {:else if url}
    <img
      src={url}
      alt={altText}
      style={`width:100%;height:100%;object-fit:contain;display:block;opacity:${opacity};${imageFilter}`}
    />
  {:else}
    <div
      style="width:100%;height:100%;border:2px dashed rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:14px;"
    >
      No image URL
    </div>
  {/if}
</div>
