<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { tsParticles } from "@tsparticles/engine";
  import { loadSlim } from "@tsparticles/slim";
  import type { Widget } from "@anomalist/types";
  import { getPresetConfig, type ParticleWidgetProps } from "../particlePresets.js";

  export let widget: Widget;

  let containerId = "";
  let initialized = false;
  let lastSignature = "";
  let slimLoaded = false;
  let containerInstance: { destroy: () => void } | undefined;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeProps(): ParticleWidgetProps {
    const preset = asString(widget.props.preset, "sparkles");
    const safePreset: ParticleWidgetProps["preset"] =
      preset === "snow" || preset === "confetti" || preset === "fire" ? preset : "sparkles";

    return {
      preset: safePreset,
      speed: clamp(asNumber(widget.props.speed, 1), 0.1, 3),
      density: Math.floor(clamp(asNumber(widget.props.density, 60), 10, 300)),
      opacity: clamp(asNumber(widget.props.opacity, 0.9), 0, 1)
    };
  }

  async function ensureSlimLoaded(): Promise<void> {
    if (slimLoaded) {
      return;
    }

    await loadSlim(tsParticles);
    slimLoaded = true;
  }

  async function loadParticles(props: ParticleWidgetProps): Promise<void> {
    if (!containerId) {
      return;
    }

    await ensureSlimLoaded();
    containerInstance?.destroy();
    containerInstance = await tsParticles.load({
      id: containerId,
      options: getPresetConfig(props)
    });
  }

  $: props = normalizeProps();
  $: propsSignature = JSON.stringify(props);

  $: if (initialized && propsSignature !== lastSignature) {
    lastSignature = propsSignature;
    void loadParticles(props);
  }

  onMount(async () => {
    containerId = `particles-${widget.id}`;
    await loadParticles(props);
    initialized = true;
    lastSignature = propsSignature;
  });

  onDestroy(() => {
    containerInstance?.destroy();
    containerInstance = undefined;
  });
</script>

<div id={containerId} style="width:100%;height:100%;"></div>