<script lang="ts">
  import { createEventDispatcher } from "svelte";

  interface WidgetEffects {
    glow?: {
      enabled: boolean;
      color: string;
      radius: number;
    };
    shadow?: {
      enabled: boolean;
      color: string;
      x: number;
      y: number;
      blur: number;
    };
    outline?: {
      enabled: boolean;
      color: string;
      width: number;
    };
    gradientText?: {
      enabled: boolean;
      angle: number;
      color1: string;
      color2: string;
    };
  }

  export let effects: WidgetEffects | undefined;
  export let isTextWidget = false;

  const dispatch = createEventDispatcher<{ change: WidgetEffects }>();

  function asObject<T extends object>(value: unknown): Partial<T> {
    return value && typeof value === "object" ? (value as Partial<T>) : {};
  }

  function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function normalize(input: WidgetEffects | undefined): Required<WidgetEffects> {
    const source = asObject<WidgetEffects>(input);
    const glow = asObject<NonNullable<WidgetEffects["glow"]>>(source.glow);
    const shadow = asObject<NonNullable<WidgetEffects["shadow"]>>(source.shadow);
    const outline = asObject<NonNullable<WidgetEffects["outline"]>>(source.outline);
    const gradientText = asObject<NonNullable<WidgetEffects["gradientText"]>>(source.gradientText);

    return {
      glow: {
        enabled: asBoolean(glow.enabled, false),
        color: asString(glow.color, "#ffffff"),
        radius: Math.max(0, Math.min(30, Math.floor(asNumber(glow.radius, 8))))
      },
      shadow: {
        enabled: asBoolean(shadow.enabled, false),
        color: asString(shadow.color, "#000000"),
        x: Math.max(-20, Math.min(20, Math.floor(asNumber(shadow.x, 4)))),
        y: Math.max(-20, Math.min(20, Math.floor(asNumber(shadow.y, 4)))),
        blur: Math.max(0, Math.min(30, Math.floor(asNumber(shadow.blur, 8))))
      },
      outline: {
        enabled: asBoolean(outline.enabled, false),
        color: asString(outline.color, "#000000"),
        width: Math.max(1, Math.min(8, Math.floor(asNumber(outline.width, 2))))
      },
      gradientText: {
        enabled: asBoolean(gradientText.enabled, false),
        angle: Math.max(0, Math.min(360, Math.floor(asNumber(gradientText.angle, 90)))),
        color1: asString(gradientText.color1, "#ff6b6b"),
        color2: asString(gradientText.color2, "#ffd93d")
      }
    };
  }

  function emit(next: WidgetEffects): void {
    dispatch("change", next);
  }

  $: current = normalize(effects);
</script>

<div class="collapse collapse-arrow border border-base-300 bg-base-100">
  <input type="checkbox" />
  <div class="collapse-title py-2 text-sm font-medium">Effects</div>
  <div class="collapse-content flex flex-col gap-3 pt-1">
    <section class="rounded-lg border border-base-300 p-2">
      <label class="label cursor-pointer justify-start gap-3 p-0">
        <input
          class="toggle toggle-primary toggle-sm"
          type="checkbox"
          checked={current.glow.enabled}
          on:change={(event) =>
            emit({
              ...current,
              glow: { ...current.glow, enabled: event.currentTarget.checked }
            })}
        />
        <span class="label-text text-sm">Glow</span>
      </label>

      {#if current.glow.enabled}
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span>Color</span>
          <input
            class="h-8 w-8"
            type="color"
            value={current.glow.color}
            on:input={(event) =>
              emit({
                ...current,
                glow: { ...current.glow, color: event.currentTarget.value }
              })}
          />
          <span>Radius {current.glow.radius}px</span>
          <input
            class="range range-primary range-xs max-w-28"
            type="range"
            min="0"
            max="30"
            step="1"
            value={current.glow.radius}
            on:input={(event) =>
              emit({
                ...current,
                glow: { ...current.glow, radius: Number(event.currentTarget.value) || 0 }
              })}
          />
        </div>
      {/if}
    </section>

    <section class="rounded-lg border border-base-300 p-2">
      <label class="label cursor-pointer justify-start gap-3 p-0">
        <input
          class="toggle toggle-primary toggle-sm"
          type="checkbox"
          checked={current.shadow.enabled}
          on:change={(event) =>
            emit({
              ...current,
              shadow: { ...current.shadow, enabled: event.currentTarget.checked }
            })}
        />
        <span class="label-text text-sm">Drop Shadow</span>
      </label>

      {#if current.shadow.enabled}
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span>Color</span>
          <input
            class="h-8 w-8"
            type="color"
            value={current.shadow.color}
            on:input={(event) =>
              emit({
                ...current,
                shadow: { ...current.shadow, color: event.currentTarget.value }
              })}
          />
          <span>X</span>
          <input
            class="input input-bordered input-xs w-14"
            type="number"
            min="-20"
            max="20"
            value={current.shadow.x}
            on:input={(event) =>
              emit({
                ...current,
                shadow: { ...current.shadow, x: Number(event.currentTarget.value) || 0 }
              })}
          />
          <span>Y</span>
          <input
            class="input input-bordered input-xs w-14"
            type="number"
            min="-20"
            max="20"
            value={current.shadow.y}
            on:input={(event) =>
              emit({
                ...current,
                shadow: { ...current.shadow, y: Number(event.currentTarget.value) || 0 }
              })}
          />
          <span>Blur {current.shadow.blur}</span>
          <input
            class="range range-primary range-xs max-w-24"
            type="range"
            min="0"
            max="30"
            step="1"
            value={current.shadow.blur}
            on:input={(event) =>
              emit({
                ...current,
                shadow: { ...current.shadow, blur: Number(event.currentTarget.value) || 0 }
              })}
          />
        </div>
      {/if}
    </section>

    {#if isTextWidget}
      <section class="rounded-lg border border-base-300 p-2">
        <label class="label cursor-pointer justify-start gap-3 p-0">
          <input
            class="toggle toggle-primary toggle-sm"
            type="checkbox"
            checked={current.outline.enabled}
            disabled={current.gradientText.enabled}
            on:change={(event) =>
              emit({
                ...current,
                outline: { ...current.outline, enabled: event.currentTarget.checked }
              })}
          />
          <span class="label-text text-sm">Text Outline</span>
        </label>

        {#if current.gradientText.enabled}
          <div class="mt-1 text-xs text-base-content/70">Disabled while Gradient Text is enabled.</div>
        {:else if current.outline.enabled}
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span>Color</span>
            <input
              class="h-8 w-8"
              type="color"
              value={current.outline.color}
              on:input={(event) =>
                emit({
                  ...current,
                  outline: { ...current.outline, color: event.currentTarget.value }
                })}
            />
            <span>Width {current.outline.width}px</span>
            <input
              class="range range-primary range-xs max-w-28"
              type="range"
              min="1"
              max="8"
              step="1"
              value={current.outline.width}
              on:input={(event) =>
                emit({
                  ...current,
                  outline: { ...current.outline, width: Number(event.currentTarget.value) || 1 }
                })}
            />
          </div>
        {/if}
      </section>

      <section class="rounded-lg border border-base-300 p-2">
        <label class="label cursor-pointer justify-start gap-3 p-0">
          <input
            class="toggle toggle-primary toggle-sm"
            type="checkbox"
            checked={current.gradientText.enabled}
            on:change={(event) =>
              emit({
                ...current,
                gradientText: { ...current.gradientText, enabled: event.currentTarget.checked }
              })}
          />
          <span class="label-text text-sm">Gradient Text</span>
        </label>

        {#if current.gradientText.enabled}
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <input
              class="h-8 w-8"
              type="color"
              value={current.gradientText.color1}
              on:input={(event) =>
                emit({
                  ...current,
                  gradientText: { ...current.gradientText, color1: event.currentTarget.value }
                })}
            />
            <span>-></span>
            <input
              class="h-8 w-8"
              type="color"
              value={current.gradientText.color2}
              on:input={(event) =>
                emit({
                  ...current,
                  gradientText: { ...current.gradientText, color2: event.currentTarget.value }
                })}
            />
            <span>Angle {current.gradientText.angle}deg</span>
            <input
              class="range range-primary range-xs max-w-32"
              type="range"
              min="0"
              max="360"
              step="1"
              value={current.gradientText.angle}
              on:input={(event) =>
                emit({
                  ...current,
                  gradientText: { ...current.gradientText, angle: Number(event.currentTarget.value) || 0 }
                })}
            />
          </div>
        {/if}
      </section>
    {/if}
  </div>
</div>