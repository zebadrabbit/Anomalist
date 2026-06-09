<script lang="ts">
  import type { SoundEntry, Widget } from "@anomalist/types";

  export let widget: Widget;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function fileNameWithoutExtension(path: string): string {
    const base = path.split("/").pop() ?? path;
    const dotIndex = base.lastIndexOf(".");
    if (dotIndex <= 0) {
      return base;
    }

    return base.slice(0, dotIndex);
  }

  function asSoundArray(value: unknown): SoundEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Partial<SoundEntry> => !!item && typeof item === "object")
      .map((item) => {
        const url = asString(item.url, "");
        const legacyName = asString((item as { name?: unknown }).name, "");

        return {
          id: asString(item.id, crypto.randomUUID()),
          label: asString(item.label, fileNameWithoutExtension(url) || legacyName || "Sound"),
          url,
          volume: Math.min(1, Math.max(0, asNumber(item.volume, 1)))
        };
      })
      .filter((item) => item.url.startsWith("/media/"));
  }

  $: sounds = asSoundArray(widget.props.sounds);
  $: columns = Math.max(1, Math.min(6, Math.round(asNumber(widget.props.columns, 3))));
  $: buttonColor = asString(widget.props.buttonColor, "#7c3aed");
  $: buttonTextColor = asString(widget.props.buttonTextColor, "#ffffff");
</script>

<div class="soundboard-root" aria-hidden="true">
  <div class="soundboard-grid" style={`grid-template-columns:repeat(${columns}, minmax(0, 1fr));`}>
    {#each sounds as sound (sound.id)}
      <button
        type="button"
        class="sound-btn"
        style={`background:${buttonColor};color:${buttonTextColor};border-color:transparent;`}
        disabled
      >
        {sound.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .soundboard-root {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: stretch;
    justify-content: stretch;
  }

  .soundboard-grid {
    width: 100%;
    height: 100%;
    display: grid;
    gap: 0.35rem;
  }

  .sound-btn {
    border: 1px solid transparent;
    border-radius: 0.375rem;
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.2;
    padding: 0.35rem 0.45rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 1;
  }
</style>
