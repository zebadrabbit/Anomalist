<script lang="ts">
  import { onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { FONTS } from "./fonts.js";

  export let value: string;

  const dispatch = createEventDispatcher<{ change: string }>();

  function emitChange(nextValue: string) {
    dispatch("change", nextValue);
  }

  function injectGoogleFont(name: string) {
    const id = `gf-${name.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}&display=swap`;
    document.head.appendChild(link);
  }

  function isGoogleFont(name: string): boolean {
    return FONTS.find((font) => font.name === name)?.google === true;
  }

  function normalizeFontName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const withoutFallback = trimmed.split(",")[0]?.trim() ?? "";
    return withoutFallback.replace(/^['\"]+|['\"]+$/g, "").trim();
  }

  function formatFontFamily(name: string): string {
    return `'${name.replace(/'/g, "\\'")}', sans-serif`;
  }

  $: normalizedValue = normalizeFontName(value || "");
  $: selectedFont = FONTS.some((font) => font.name === normalizedValue) ? normalizedValue : "Arial";

  $: if (selectedFont && isGoogleFont(selectedFont)) {
    injectGoogleFont(selectedFont);
  }

  onMount(() => {
    if (selectedFont && isGoogleFont(selectedFont)) {
      injectGoogleFont(selectedFont);
    }
  });
</script>

<section class="flex flex-col gap-2">
  <label class="form-control w-full">
    <span class="label-text mb-1">Font</span>
    <select
      class="select select-bordered select-sm w-full"
      value={selectedFont}
      on:input={(event) => emitChange(event.currentTarget.value)}
      on:change={(event) => emitChange(event.currentTarget.value)}
    >
      {#each FONTS as font}
        <option value={font.name}>{font.name}</option>
      {/each}
    </select>
  </label>

  <div class="text-sm opacity-80">
    <span class="mr-2">Preview:</span>
    <span style={`font-family:${formatFontFamily(selectedFont)};font-size:14px;line-height:1.4;`}>
      The quick brown fox jumps over the lazy dog
    </span>
  </div>
</section>