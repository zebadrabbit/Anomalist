<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  interface MediaItem {
    id: string;
    filename: string;
    originalName: string;
    mimetype: string;
    mediaType: "image" | "video" | "audio";
    size: number;
    uploadedAt: string;
    url: string;
  }

  type MediaFilter = "all" | "image" | "video" | "audio";

  export let onSelect: ((url: string, item?: MediaItem) => void) | undefined;
  export let initialFilter: MediaFilter = "all";

  let items: MediaItem[] = [];
  let selectedFilter: MediaFilter = "all";
  let isLoading = false;
  let isUploading = false;
  let error = "";
  let previewAudio: HTMLAudioElement | null = null;
  let previewingId: string | null = null;

  function isVideo(item: MediaItem): boolean {
    return item.mimetype.startsWith("video/") || item.mediaType === "video";
  }

  function isAudio(item: MediaItem): boolean {
    return item.mimetype.startsWith("audio/") || item.mediaType === "audio";
  }

  function stopPreview() {
    if (!previewAudio) {
      previewingId = null;
      return;
    }

    previewAudio.pause();
    previewAudio.currentTime = 0;
    previewAudio = null;
    previewingId = null;
  }

  async function toggleAudioPreview(item: MediaItem) {
    if (!isAudio(item)) {
      return;
    }

    if (previewingId === item.id) {
      stopPreview();
      return;
    }

    stopPreview();
    const audio = new Audio(item.url);
    previewAudio = audio;
    previewingId = item.id;
    audio.addEventListener("ended", () => {
      if (previewAudio === audio) {
        previewAudio = null;
        previewingId = null;
      }
    });

    try {
      await audio.play();
    } catch {
      stopPreview();
      error = "Audio preview failed to play.";
    }
  }

  function mediaMatchesFilter(item: MediaItem): boolean {
    if (selectedFilter === "all") {
      return true;
    }

    return item.mediaType === selectedFilter;
  }

  function getFileStem(name: string): string {
    const index = name.lastIndexOf(".");
    if (index <= 0) {
      return name;
    }

    return name.slice(0, index);
  }

  function setFilter(filter: MediaFilter) {
    selectedFilter = filter;
  }

  function handleSelect(item: MediaItem) {
    if (isAudio(item)) {
      void toggleAudioPreview(item);
    }

    onSelect?.(item.url, item);
  }

  $: filteredItems = items.filter(mediaMatchesFilter);

  async function refreshItems() {
    isLoading = true;
    error = "";
    try {
      const response = await fetch("/api/media");
      if (!response.ok) {
        throw new Error("Failed to load media library");
      }

      items = (await response.json()) as MediaItem[];
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load media library";
    } finally {
      isLoading = false;
    }
  }

  async function handleUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    isUploading = true;
    error = "";

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/media", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Upload failed" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Upload failed");
      }

      await refreshItems();
    } catch (err) {
      error = err instanceof Error ? err.message : "Upload failed";
    } finally {
      isUploading = false;
      input.value = "";
    }
  }

  async function handleDelete(id: string) {
    error = "";
    try {
      const response = await fetch(`/api/media/${id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error("Failed to delete media");
      }

      await refreshItems();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to delete media";
    }
  }

  onMount(() => {
    selectedFilter = initialFilter;
    void refreshItems();
  });

  onDestroy(() => {
    stopPreview();
  });
</script>

<section class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-2">
    <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/70">Media Library</h3>
    <label class={`btn btn-sm btn-primary ${isUploading ? "btn-disabled" : ""}`} aria-disabled={isUploading}>
      {isUploading ? "Uploading..." : "Upload"}
      <input
        class="hidden"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/mpeg,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/flac,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mpeg,.webm,.mp3,.wav,.ogg,.flac"
        disabled={isUploading}
        on:change={handleUpload}
      />
    </label>
  </div>

  <div class="tabs tabs-boxed tabs-sm">
    <button type="button" class={`tab ${selectedFilter === "all" ? "tab-active" : ""}`} on:click={() => setFilter("all")}>All</button>
    <button type="button" class={`tab ${selectedFilter === "image" ? "tab-active" : ""}`} on:click={() => setFilter("image")}>Images</button>
    <button type="button" class={`tab ${selectedFilter === "video" ? "tab-active" : ""}`} on:click={() => setFilter("video")}>Videos</button>
    <button type="button" class={`tab ${selectedFilter === "audio" ? "tab-active" : ""}`} on:click={() => setFilter("audio")}>Audio</button>
  </div>

  <label class="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-100 px-4 py-5 text-sm text-base-content/70 hover:border-primary hover:text-primary">
    {isUploading ? "Uploading..." : "Drop file here or click to upload"}
    <input
      class="hidden"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/mpeg,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/flac,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mpeg,.webm,.mp3,.wav,.ogg,.flac"
      disabled={isUploading}
      on:change={handleUpload}
    />
  </label>

  {#if error}
    <div class="alert alert-error text-sm">{error}</div>
  {/if}

  {#if isLoading}
    <div class="flex items-center gap-2 text-sm text-base-content/70">
      <span class="loading loading-spinner loading-sm"></span>
      Loading media...
    </div>
  {:else if filteredItems.length === 0}
    <p class="text-sm text-base-content/70">No media uploaded yet.</p>
  {:else}
    <div class="grid grid-cols-2 gap-2">
      {#each filteredItems as item (item.id)}
        <div class="group relative overflow-hidden rounded-lg border border-base-300 bg-base-100">
          <button
            type="button"
            class="btn btn-circle btn-xs btn-error absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover:opacity-100"
            on:click|stopPropagation={() => handleDelete(item.id)}
            aria-label={`Delete ${item.originalName}`}
          >
            x
          </button>
          <button type="button" class="w-full text-left" on:click={() => handleSelect(item)}>
            {#if isVideo(item)}
              <video class="block aspect-video w-full bg-neutral object-cover" src={item.url} muted autoplay loop playsinline></video>
            {:else if isAudio(item)}
              <div class="flex aspect-video w-full flex-col items-center justify-center bg-neutral text-neutral-content">
                <div class="text-3xl">music</div>
                <span class="mt-1 max-w-[90%] truncate px-2 text-xs opacity-80" title={item.originalName}>{getFileStem(item.originalName)}</span>
              </div>
            {:else}
              <img class="block aspect-video w-full bg-neutral object-cover" src={item.url} alt={item.originalName} loading="lazy" />
            {/if}
            <span class="block truncate px-2 py-1 text-xs" title={item.originalName}>{item.originalName}</span>
          </button>

          {#if isAudio(item)}
            <div class="px-2 pb-2">
              <button
                type="button"
                class="btn btn-xs w-full"
                on:click|stopPropagation={() => toggleAudioPreview(item)}
              >
                {previewingId === item.id ? "Stop Preview" : "Play Preview"}
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
