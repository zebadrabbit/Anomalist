<script lang="ts">
  import { onMount } from "svelte";

  interface MediaItem {
    id: string;
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    uploadedAt: string;
    url: string;
  }

  export let onSelect: ((url: string) => void) | undefined;

  let items: MediaItem[] = [];
  let isLoading = false;
  let isUploading = false;
  let error = "";

  function isVideo(item: MediaItem): boolean {
    return item.mimetype.startsWith("video/");
  }

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
    void refreshItems();
  });
</script>

<section class="library">
  <div class="library-header">
    <h3>Media Library</h3>
    <label class="upload-button" aria-disabled={isUploading}>
      {isUploading ? "Uploading..." : "Upload"}
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/mpeg,video/webm,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mpeg,.webm"
        disabled={isUploading}
        on:change={handleUpload}
      />
    </label>
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if isLoading}
    <p>Loading media...</p>
  {:else if items.length === 0}
    <p>No media uploaded yet.</p>
  {:else}
    <div class="media-grid">
      {#each items as item (item.id)}
        <div class="media-card">
          <button
            type="button"
            class="delete"
            on:click|stopPropagation={() => handleDelete(item.id)}
            aria-label={`Delete ${item.originalName}`}
          >
            x
          </button>
          <button type="button" class="select" on:click={() => onSelect?.(item.url)}>
            {#if isVideo(item)}
              <video src={item.url} muted autoplay loop playsinline></video>
            {:else}
              <img src={item.url} alt={item.originalName} loading="lazy" />
            {/if}
            <span class="name" title={item.originalName}>{item.originalName}</span>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .library {
    display: grid;
    gap: 0.75rem;
  }

  .library-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .upload-button {
    position: relative;
    overflow: hidden;
    border: 1px solid #c7ceda;
    border-radius: 8px;
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.9rem;
    background: #f8f9fc;
  }

  .upload-button[aria-disabled="true"] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .upload-button input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .media-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .media-card {
    position: relative;
    border: 1px solid #d8deea;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }

  .select {
    width: 100%;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }

  .media-card img,
  .media-card video {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
    background: #0f172a;
  }

  .name {
    display: block;
    font-size: 0.78rem;
    padding: 0.4rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .delete {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 999px;
    border: 0;
    background: rgba(10, 10, 10, 0.7);
    color: #fff;
    font-size: 0.75rem;
    line-height: 1.2rem;
    text-align: center;
    z-index: 1;
    cursor: pointer;
  }

  .error {
    color: #b00020;
    font-size: 0.9rem;
    margin: 0;
  }
</style>
