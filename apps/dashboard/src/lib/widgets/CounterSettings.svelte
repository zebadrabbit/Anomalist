<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Widget } from "@anomalist/types";

  export let widget: Widget;

  const dispatch = createEventDispatcher<{ update: Widget }>();

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function emitProps(nextProps: Record<string, unknown>) {
    dispatch("update", {
      ...widget,
      props: {
        ...widget.props,
        ...nextProps
      }
    });
  }

  $: value = Math.floor(asNumber(widget.props.value, 0));
  $: step = Math.max(1, asNumber(widget.props.step, 1));
  $: label = asString(widget.props.label, "");
</script>

<section>
  <div class="counter-actions">
    <button type="button" class="big" on:click={() => emitProps({ value: value - step })}>-</button>
    <button type="button" class="big" on:click={() => emitProps({ value: value + step })}>+</button>
  </div>

  <label>
    Step
    <input
      type="number"
      min="1"
      value={step}
      on:input={(event) => emitProps({ step: Number(event.currentTarget.value) || 1 })}
    />
  </label>

  <label>
    Label
    <input value={label} on:input={(event) => emitProps({ label: event.currentTarget.value })} />
  </label>

  <button type="button" on:click={() => emitProps({ value: 0 })}>Reset</button>
</section>

<style>
  section {
    display: grid;
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
    font-size: 0.95rem;
  }

  .counter-actions {
    display: flex;
    gap: 0.5rem;
  }

  .big {
    min-width: 3rem;
    min-height: 2.5rem;
    font-size: 1.4rem;
    font-weight: 700;
  }
</style>
