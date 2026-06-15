<script lang="ts">
  import type { CanvasState } from "@anomalist/types";
  import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./canvas/snapping.js";

  type Scene = CanvasState["scenes"][number];

  export let scene: Scene;
  export let width = 160;

  // Height follows the canvas aspect ratio so the schematic matches the editor.
  $: height = Math.round((width * CANVAS_HEIGHT) / CANVAS_WIDTH);

  // Fills reference DaisyUI v5 theme variables so previews stay consistent with
  // the layers-panel badge colors and adapt if the theme changes.
  const TYPE_FILL: Record<string, string> = {
    text: "var(--color-primary)",
    timer: "var(--color-secondary)",
    counter: "var(--color-accent)",
    marquee: "var(--color-info)",
    clock: "var(--color-success)",
    image: "var(--color-warning)",
    shape: "var(--color-neutral)",
    soundboard: "var(--color-base-content)",
    particle: "var(--color-error)",
    "custom-html": "var(--color-base-content)",
    chat: "var(--color-info)"
  };

  function fillFor(type: string): string {
    return TYPE_FILL[type] ?? "#888888";
  }
</script>

<svg
  viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
  width={width}
  height={height}
  class="block h-auto w-full rounded bg-base-300"
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label={`Preview of ${scene.name}`}
>
  {#each scene.widgets as w (w.id)}
    {#if w.visible !== false}
      <rect
        x={w.x}
        y={w.y}
        width={w.width}
        height={w.height}
        rx="8"
        fill={fillFor(w.type)}
        opacity="0.85"
        transform={`rotate(${w.rotation ?? 0} ${w.x + w.width / 2} ${w.y + w.height / 2})`}
      />
    {/if}
  {/each}
</svg>
