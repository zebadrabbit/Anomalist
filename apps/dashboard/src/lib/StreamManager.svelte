<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { authStore } from "./stores/auth.js";
  import { addToast } from "./stores/toast.js";

  interface StreamInfo {
    title: string;
    game_id: string;
    game_name: string;
  }

  interface GameResult {
    id: string;
    name: string;
    box_art_url: string;
  }

  let streamInfo: StreamInfo = {
    title: "",
    game_id: "",
    game_name: ""
  };
  let titleInput = "";
  let loadingStream = true;
  let streamError = "";

  let titleUpdating = false;
  let categoryUpdating = false;

  let searchQuery = "";
  let searchLoading = false;
  let searchResults: GameResult[] = [];
  let selectedGame: GameResult | null = null;
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;

  function getAuthHeaders(includeJson = false): HeadersInit {
    const headers: HeadersInit = {};
    if (includeJson) {
      headers["Content-Type"] = "application/json";
    }

    const token = get(authStore).token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  async function loadStream(): Promise<void> {
    loadingStream = true;
    streamError = "";

    try {
      const response = await fetch("/api/twitch/stream", {
        headers: getAuthHeaders(false)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to load stream" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Couldn't load stream details.");
      }

      const payload = (await response.json()) as StreamInfo;
      streamInfo = {
        title: payload.title ?? "",
        game_id: payload.game_id ?? "",
        game_name: payload.game_name ?? ""
      };
      titleInput = streamInfo.title;
    } catch (error) {
      streamError = error instanceof Error ? error.message : "Couldn't load stream details.";
    } finally {
      loadingStream = false;
    }
  }

  async function updateTitle(): Promise<void> {
    const title = titleInput.trim();
    if (title.length > 140) {
      addToast("error", "Title must be 140 characters or fewer.");
      return;
    }

    titleUpdating = true;
    try {
      const response = await fetch("/api/twitch/stream", {
        method: "PATCH",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ title })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to update title" }))) as {
          error?: string;
          details?: string;
        };
        throw new Error(payload.details ? `${payload.error ?? "Failed to update title"}: ${payload.details}` : (payload.error ?? "Failed to update title"));
      }

      addToast("success", "Stream title saved.");
      await loadStream();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Couldn't update stream title.");
    } finally {
      titleUpdating = false;
    }
  }

  async function searchGames(query: string): Promise<void> {
    const q = query.trim();
    if (q.length < 2) {
      searchResults = [];
      searchLoading = false;
      return;
    }

    searchLoading = true;
    try {
      const response = await fetch(`/api/twitch/stream/search-games?q=${encodeURIComponent(q)}`, {
        headers: getAuthHeaders(false)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to search games" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Couldn't search categories right now.");
      }

      const payload = (await response.json()) as GameResult[];
      searchResults = Array.isArray(payload) ? payload : [];
    } catch (error) {
      searchResults = [];
      addToast("error", error instanceof Error ? error.message : "Couldn't search categories right now.");
    } finally {
      searchLoading = false;
    }
  }

  function onSearchInput(value: string): void {
    searchQuery = value;
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }

    searchDebounce = setTimeout(() => {
      void searchGames(searchQuery);
    }, 300);
  }

  async function setCategory(): Promise<void> {
    if (!selectedGame) {
      return;
    }

    categoryUpdating = true;
    try {
      const response = await fetch("/api/twitch/stream", {
        method: "PATCH",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ game_id: selectedGame.id })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to update category" }))) as {
          error?: string;
          details?: string;
        };
        throw new Error(payload.details ? `${payload.error ?? "Failed to update category"}: ${payload.details}` : (payload.error ?? "Failed to update category"));
      }

      addToast("success", "Category saved.");
      await loadStream();
      searchResults = [];
      searchQuery = "";
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Couldn't update category.");
    } finally {
      categoryUpdating = false;
    }
  }

  onMount(() => {
    void loadStream();
    return () => {
      if (searchDebounce) {
        clearTimeout(searchDebounce);
      }
    };
  });
</script>

<div class="mx-auto w-full max-w-3xl rounded-2xl border border-base-300 bg-base-200 p-6 shadow-sm">
  <h2 class="text-xl font-semibold">Stream Management</h2>

  {#if loadingStream}
    <div class="mt-5 flex items-center gap-3 text-base-content/70">
      <span class="loading loading-spinner loading-md"></span>
      <span>Loading stream info...</span>
    </div>
  {:else if streamError}
    <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
      Connect your Twitch account in Settings to manage your stream from here.
      <div class="mt-2 opacity-70">{streamError}</div>
    </div>
  {:else}
    <div class="mt-5 space-y-6">
      <section class="space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
        <h3 class="text-base font-semibold">Stream Title</h3>
        <input
          class="input input-bordered w-full"
          type="text"
          maxlength="140"
          bind:value={titleInput}
        />
        <div class="text-sm text-base-content/70">Character count: {titleInput.length}/140</div>
        <button class="btn btn-primary btn-sm" type="button" disabled={titleUpdating} on:click={updateTitle}>
          {titleUpdating ? "Updating..." : "Update Title"}
        </button>
      </section>

      <section class="space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
        <h3 class="text-base font-semibold">Game / Category</h3>
        <input
          class="input input-bordered w-full"
          type="text"
          placeholder="Search categories"
          value={searchQuery}
          on:input={(event) => onSearchInput(event.currentTarget.value)}
        />

        <div class="text-sm text-base-content/70">Current: {streamInfo.game_name || "None"}</div>

        {#if selectedGame}
          <div class="rounded-lg border border-primary/40 bg-primary/10 p-2 text-sm">
            Selected: {selectedGame.name}
          </div>
        {/if}

        {#if searchLoading}
          <div class="flex items-center gap-2 text-sm text-base-content/70">
            <span class="loading loading-spinner loading-sm"></span>
            Searching...
          </div>
        {:else if searchResults.length > 0}
          <div class="grid gap-2">
            {#each searchResults as game (game.id)}
              <button
                type="button"
                class={`flex items-center gap-3 rounded-lg border p-2 text-left ${selectedGame?.id === game.id ? "border-primary bg-primary/10" : "border-base-300"}`}
                on:click={() => (selectedGame = game)}
              >
                <img
                  src={game.box_art_url.replace("{width}", "80").replace("{height}", "106")}
                  alt={game.name}
                  class="h-12 w-9 rounded object-cover"
                />
                <span class="font-medium">{game.name}</span>
              </button>
            {/each}
          </div>
        {/if}

        <button class="btn btn-secondary btn-sm" type="button" disabled={!selectedGame || categoryUpdating} on:click={setCategory}>
          {categoryUpdating ? "Updating..." : "Set Category"}
        </button>
      </section>
    </div>
  {/if}
</div>
