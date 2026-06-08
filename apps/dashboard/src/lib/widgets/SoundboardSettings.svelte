<script lang="ts">
  import type { SoundEntry, Widget } from "@anomalist/types";
  import { SocketEvents } from "@anomalist/types";
  import type { Socket } from "socket.io-client";
  import MediaLibrary from "../MediaLibrary.svelte";

  export let widget: Widget;
  export let socket: Socket | null;

  let showAudioPicker = false;

  function asString(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function asSoundArray(value: unknown): SoundEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Partial<SoundEntry> => !!item && typeof item === "object")
      .map((item) => ({
        id: asString(item.id, crypto.randomUUID()),
        name: asString(item.name, "Sound"),
        url: asString(item.url, ""),
        volume: Math.min(1, Math.max(0, asNumber(item.volume, 1)))
      }))
      .filter((item) => item.url.startsWith("/media/"));
  }

  function fileNameWithoutExtension(path: string): string {
    const base = path.split("/").pop() ?? path;
    const dotIndex = base.lastIndexOf(".");
    if (dotIndex <= 0) {
      return base;
    }

    return base.slice(0, dotIndex);
  }

  function updateProps(next: Partial<{ sounds: SoundEntry[]; columns: number; buttonColor: string; buttonTextColor: string }>) {
    socket?.emit(SocketEvents.WIDGET_UPDATE, {
      id: widget.id,
      props: next
    });
  }

  function updateSound(index: number, patch: Partial<SoundEntry>) {
    const next = sounds.map((sound, i) => (i === index ? { ...sound, ...patch } : sound));
    updateProps({ sounds: next });
  }

  function removeSound(index: number) {
    const next = sounds.filter((_sound, i) => i !== index);
    updateProps({ sounds: next });
  }

  function addSound(url: string) {
    if (!url.startsWith("/media/")) {
      return;
    }

    if (sounds.some((sound) => sound.url === url)) {
      showAudioPicker = false;
      return;
    }

    const next: SoundEntry[] = [
      ...sounds,
      {
        id: crypto.randomUUID(),
        name: fileNameWithoutExtension(url),
        url,
        volume: 1
      }
    ];

    updateProps({ sounds: next });
    showAudioPicker = false;
  }

  function playSound(sound: SoundEntry) {
    socket?.emit(SocketEvents.PLAY_SOUND, {
      url: sound.url,
      volume: Math.min(1, Math.max(0, sound.volume))
    });
  }

  $: sounds = asSoundArray(widget.props.sounds);
  $: columns = Math.max(1, Math.min(6, Math.round(asNumber(widget.props.columns, 3))));
  $: buttonColor = asString(widget.props.buttonColor, "#7c3aed");
  $: buttonTextColor = asString(widget.props.buttonTextColor, "#ffffff");
</script>

<section class="flex flex-col gap-4">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/70">Soundboard Controls</h3>
    <button type="button" class="btn btn-sm" on:click={() => (showAudioPicker = !showAudioPicker)}>
      {showAudioPicker ? "Close Library" : "Add Sound"}
    </button>
  </div>

  {#if showAudioPicker}
    <div class="rounded-lg border border-base-300 p-2">
      <MediaLibrary initialFilter="audio" onSelect={(url, item) => item?.mediaType === "audio" && addSound(url)} />
    </div>
  {/if}

  <label class="form-control w-full">
    <span class="label-text mb-1">Columns ({columns})</span>
    <input
      class="range range-primary range-sm"
      type="range"
      min="1"
      max="6"
      step="1"
      value={columns}
      on:input={(event) => updateProps({ columns: Number(event.currentTarget.value) })}
    />
  </label>

  <div class="grid grid-cols-2 gap-3">
    <label class="form-control w-full">
      <span class="label-text mb-1">Button Color</span>
      <input class="h-9 w-full" type="color" value={buttonColor} on:input={(event) => updateProps({ buttonColor: event.currentTarget.value })} />
    </label>

    <label class="form-control w-full">
      <span class="label-text mb-1">Text Color</span>
      <input class="h-9 w-full" type="color" value={buttonTextColor} on:input={(event) => updateProps({ buttonTextColor: event.currentTarget.value })} />
    </label>
  </div>

  <div class="space-y-2">
    {#if sounds.length === 0}
      <div class="rounded-lg border border-dashed border-base-300 p-3 text-sm text-base-content/70">
        Add sounds from your media library to build your board.
      </div>
    {:else}
      {#each sounds as sound, index (sound.id)}
        <div class="rounded-lg border border-base-300 p-2">
          <div class="mb-2 flex items-center gap-2">
            <input
              class="input input-bordered input-sm flex-1"
              value={sound.name}
              on:input={(event) => updateSound(index, { name: event.currentTarget.value })}
            />
            <button type="button" class="btn btn-xs" on:click={() => playSound(sound)}>Play</button>
            <button type="button" class="btn btn-xs btn-error" on:click={() => removeSound(index)} aria-label={`Remove ${sound.name}`}>
              x
            </button>
          </div>
          <label class="form-control w-full">
            <span class="label-text mb-1">Volume ({sound.volume.toFixed(2)})</span>
            <input
              class="range range-primary range-xs"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={sound.volume}
              on:input={(event) => updateSound(index, { volume: Number(event.currentTarget.value) })}
            />
          </label>
        </div>
      {/each}
    {/if}
  </div>

  <div>
    <h4 class="mb-2 text-sm font-semibold">Soundboard Grid Preview</h4>
    <div class="grid gap-2" style={`grid-template-columns:repeat(${columns}, minmax(0, 1fr));`}>
      {#each sounds as sound (sound.id)}
        <button
          type="button"
          class="btn btn-sm"
          style={`background:${buttonColor};color:${buttonTextColor};border-color:transparent;`}
          on:click={() => playSound(sound)}
        >
          {sound.name}
        </button>
      {/each}
    </div>
  </div>
</section>
