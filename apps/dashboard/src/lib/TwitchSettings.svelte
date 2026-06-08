<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { authStore } from "./stores/auth.js";
  import { addToast } from "./stores/toast.js";

  interface TwitchStatus {
    connected: boolean;
    login?: string;
    display_name?: string;
    chatbot?: {
      enabled: boolean;
      connected: boolean;
    };
  }

  interface AlertAction {
    soundUrl: string;
    widgetId: string;
    duration: number;
  }

  interface AlertConfig {
    sub: AlertAction;
    follow: AlertAction;
    raid: AlertAction;
  }

  const DEFAULT_ALERT_CONFIG: AlertConfig = {
    sub: { soundUrl: "", widgetId: "", duration: 5 },
    follow: { soundUrl: "", widgetId: "", duration: 3 },
    raid: { soundUrl: "", widgetId: "", duration: 8 }
  };

  let clientId = "";
  let clientSecret = "";
  let credentialsSaved = false;
  let loadingStatus = true;
  let savingCredentials = false;
  let disconnecting = false;
  let togglingChatbot = false;
  let loadingAlerts = false;
  let savingAlertType: "sub" | "follow" | "raid" | null = null;
  let status: TwitchStatus = { connected: false };
  let alertConfig: AlertConfig = {
    sub: { ...DEFAULT_ALERT_CONFIG.sub },
    follow: { ...DEFAULT_ALERT_CONFIG.follow },
    raid: { ...DEFAULT_ALERT_CONFIG.raid }
  };
  let redirectUri = "";

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

  async function loadStatus(): Promise<void> {
    loadingStatus = true;
    try {
      const response = await fetch("/api/twitch/status", {
        headers: getAuthHeaders(false)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to load Twitch status" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to load Twitch status");
      }

      status = (await response.json()) as TwitchStatus;
      if (status.connected) {
        credentialsSaved = true;
        await loadAlertConfig();
      }
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to load Twitch status");
      status = { connected: false };
    } finally {
      loadingStatus = false;
    }
  }

  async function saveCredentials(): Promise<void> {
    const normalizedClientId = clientId.trim();
    const normalizedClientSecret = clientSecret.trim();
    if (!normalizedClientId || !normalizedClientSecret) {
      addToast("warning", "Client ID and Client Secret are required.");
      return;
    }

    savingCredentials = true;
    try {
      const response = await fetch("/api/twitch/credentials", {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          client_id: normalizedClientId,
          client_secret: normalizedClientSecret
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to save credentials" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to save credentials");
      }

      credentialsSaved = true;
      clientSecret = "";
      addToast("success", "Twitch credentials saved.");
      await loadStatus();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to save credentials");
    } finally {
      savingCredentials = false;
    }
  }

  function connectTwitch(): void {
    if (!credentialsSaved) {
      return;
    }

    window.location.href = "/auth/twitch/connect";
  }

  async function disconnectTwitch(): Promise<void> {
    disconnecting = true;
    try {
      const response = await fetch("/api/twitch/disconnect", {
        method: "DELETE",
        headers: getAuthHeaders(false)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to disconnect Twitch" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to disconnect Twitch");
      }

      status = { connected: false };
      alertConfig = {
        sub: { ...DEFAULT_ALERT_CONFIG.sub },
        follow: { ...DEFAULT_ALERT_CONFIG.follow },
        raid: { ...DEFAULT_ALERT_CONFIG.raid }
      };
      addToast("success", "Twitch disconnected.");
      await loadStatus();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to disconnect Twitch");
    } finally {
      disconnecting = false;
    }
  }

  async function toggleChatbot(): Promise<void> {
    const currentlyEnabled = status.chatbot?.enabled ?? true;
    const nextEnabled = !currentlyEnabled;

    togglingChatbot = true;
    try {
      const response = await fetch("/api/twitch/chatbot", {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ enabled: nextEnabled })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to update chatbot" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to update chatbot");
      }

      addToast("success", nextEnabled ? "Chatbot enabled." : "Chatbot disabled.");
      await loadStatus();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to update chatbot");
    } finally {
      togglingChatbot = false;
    }
  }

  async function loadAlertConfig(): Promise<void> {
    loadingAlerts = true;
    try {
      const response = await fetch("/api/twitch/alerts/config", {
        headers: getAuthHeaders(false)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to load alerts config" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to load alerts config");
      }

      const payload = (await response.json()) as Partial<AlertConfig>;
      alertConfig = {
        sub: {
          soundUrl: typeof payload.sub?.soundUrl === "string" ? payload.sub.soundUrl : DEFAULT_ALERT_CONFIG.sub.soundUrl,
          widgetId: typeof payload.sub?.widgetId === "string" ? payload.sub.widgetId : DEFAULT_ALERT_CONFIG.sub.widgetId,
          duration:
            typeof payload.sub?.duration === "number" && Number.isFinite(payload.sub.duration)
              ? payload.sub.duration
              : DEFAULT_ALERT_CONFIG.sub.duration
        },
        follow: {
          soundUrl:
            typeof payload.follow?.soundUrl === "string"
              ? payload.follow.soundUrl
              : DEFAULT_ALERT_CONFIG.follow.soundUrl,
          widgetId:
            typeof payload.follow?.widgetId === "string"
              ? payload.follow.widgetId
              : DEFAULT_ALERT_CONFIG.follow.widgetId,
          duration:
            typeof payload.follow?.duration === "number" && Number.isFinite(payload.follow.duration)
              ? payload.follow.duration
              : DEFAULT_ALERT_CONFIG.follow.duration
        },
        raid: {
          soundUrl: typeof payload.raid?.soundUrl === "string" ? payload.raid.soundUrl : DEFAULT_ALERT_CONFIG.raid.soundUrl,
          widgetId: typeof payload.raid?.widgetId === "string" ? payload.raid.widgetId : DEFAULT_ALERT_CONFIG.raid.widgetId,
          duration:
            typeof payload.raid?.duration === "number" && Number.isFinite(payload.raid.duration)
              ? payload.raid.duration
              : DEFAULT_ALERT_CONFIG.raid.duration
        }
      };
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to load alerts config");
      alertConfig = {
        sub: { ...DEFAULT_ALERT_CONFIG.sub },
        follow: { ...DEFAULT_ALERT_CONFIG.follow },
        raid: { ...DEFAULT_ALERT_CONFIG.raid }
      };
    } finally {
      loadingAlerts = false;
    }
  }

  async function saveAlertAction(type: "sub" | "follow" | "raid"): Promise<void> {
    savingAlertType = type;
    try {
      const response = await fetch("/api/twitch/alerts/config", {
        method: "PUT",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          [type]: {
            soundUrl: alertConfig[type].soundUrl,
            widgetId: alertConfig[type].widgetId,
            duration: Math.max(1, alertConfig[type].duration)
          }
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to save alerts config" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to save alerts config");
      }

      const payload = (await response.json()) as { config?: AlertConfig };
      if (payload.config) {
        alertConfig = payload.config;
      }

      addToast("success", `${type[0].toUpperCase()}${type.slice(1)} alert saved.`);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to save alerts config");
    } finally {
      savingAlertType = null;
    }
  }

  onMount(() => {
    redirectUri =
      (import.meta.env.VITE_TWITCH_REDIRECT_URI as string | undefined)
      ?? `${window.location.origin}/auth/twitch/callback`;
    void loadStatus();
  });
</script>

<div class="mx-auto w-full max-w-2xl rounded-2xl border border-base-300 bg-base-200 p-6 shadow-sm">
  <h2 class="text-xl font-semibold">Twitch Integration</h2>

  {#if loadingStatus}
    <div class="mt-5 flex items-center gap-3 text-base-content/70">
      <span class="loading loading-spinner loading-md"></span>
      <span>Loading Twitch connection status...</span>
    </div>
  {:else if status.connected}
    <div class="mt-5 space-y-4">
      <div class="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-success-content">
        Connected as <strong>{status.display_name}</strong> (@{status.login})
      </div>

      <button type="button" class="btn btn-error" disabled={disconnecting} on:click={disconnectTwitch}>
        {disconnecting ? "Disconnecting..." : "Disconnect"}
      </button>

      <div class="divider my-2">Chatbot</div>

      <div class="rounded-xl border border-base-300 bg-base-100 p-4">
        <div class="mb-3 flex items-center justify-between gap-4">
          <div class="text-sm">
            <div class="font-semibold">Status</div>
            <div class="mt-1 text-base-content/70">
              {#if status.chatbot?.enabled && status.chatbot?.connected}
                <span class="text-success">● Active</span>
              {:else}
                <span class="text-base-content/60">○ Inactive</span>
              {/if}
            </div>
          </div>

          <button type="button" class="btn btn-sm btn-outline" disabled={togglingChatbot} on:click={toggleChatbot}>
            {#if togglingChatbot}
              Updating...
            {:else if status.chatbot?.enabled ?? true}
              Disable Chatbot
            {:else}
              Enable Chatbot
            {/if}
          </button>
        </div>

        <div class="text-sm text-base-content/80">
          <div class="font-semibold">Commands:</div>
          <div class="mt-1 font-mono">!sound [name]    - plays a soundboard sound (all viewers)</div>
          <div class="font-mono">!counter [name] +/-  - adjusts a counter (mods only)</div>
        </div>
      </div>

      <div class="divider my-2">Alerts</div>

      <div class="rounded-xl border border-base-300 bg-base-100 p-4">
        <p class="mb-3 text-sm text-base-content/70">Configure what happens when events fire on your channel.</p>

        {#if loadingAlerts}
          <div class="text-sm text-base-content/70">Loading alert config...</div>
        {:else}
          <div class="space-y-3">
            <div class="grid gap-2 rounded-lg border border-base-300 p-3 md:grid-cols-[68px_1fr_1fr_110px_80px] md:items-center">
              <div class="font-semibold">Sub</div>
              <input class="input input-bordered input-sm" placeholder="Sound URL" bind:value={alertConfig.sub.soundUrl} />
              <input class="input input-bordered input-sm" placeholder="Widget ID" bind:value={alertConfig.sub.widgetId} />
              <label class="input input-bordered input-sm flex items-center gap-2">
                <input type="number" min="1" class="w-full" bind:value={alertConfig.sub.duration} />
                <span>s</span>
              </label>
              <button type="button" class="btn btn-sm" disabled={savingAlertType !== null} on:click={() => saveAlertAction("sub")}>Save</button>
            </div>

            <div class="grid gap-2 rounded-lg border border-base-300 p-3 md:grid-cols-[68px_1fr_1fr_110px_80px] md:items-center">
              <div class="font-semibold">Follow</div>
              <input class="input input-bordered input-sm" placeholder="Sound URL" bind:value={alertConfig.follow.soundUrl} />
              <input class="input input-bordered input-sm" placeholder="Widget ID" bind:value={alertConfig.follow.widgetId} />
              <label class="input input-bordered input-sm flex items-center gap-2">
                <input type="number" min="1" class="w-full" bind:value={alertConfig.follow.duration} />
                <span>s</span>
              </label>
              <button type="button" class="btn btn-sm" disabled={savingAlertType !== null} on:click={() => saveAlertAction("follow")}>Save</button>
            </div>

            <div class="grid gap-2 rounded-lg border border-base-300 p-3 md:grid-cols-[68px_1fr_1fr_110px_80px] md:items-center">
              <div class="font-semibold">Raid</div>
              <input class="input input-bordered input-sm" placeholder="Sound URL" bind:value={alertConfig.raid.soundUrl} />
              <input class="input input-bordered input-sm" placeholder="Widget ID" bind:value={alertConfig.raid.widgetId} />
              <label class="input input-bordered input-sm flex items-center gap-2">
                <input type="number" min="1" class="w-full" bind:value={alertConfig.raid.duration} />
                <span>s</span>
              </label>
              <button type="button" class="btn btn-sm" disabled={savingAlertType !== null} on:click={() => saveAlertAction("raid")}>Save</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="mt-5 space-y-4">
      <label class="form-control w-full">
        <span class="label-text mb-1">Client ID</span>
        <input class="input input-bordered w-full" placeholder="Twitch Client ID" bind:value={clientId} />
      </label>

      <label class="form-control w-full">
        <span class="label-text mb-1">Client Secret</span>
        <input class="input input-bordered w-full" type="password" placeholder="Twitch Client Secret" bind:value={clientSecret} />
      </label>

      <p class="text-sm text-base-content/75">
        Create an app at dev.twitch.tv to get your credentials. Set your OAuth redirect URI to: <span class="font-mono">{redirectUri}</span>
      </p>

      <div class="flex flex-wrap gap-3">
        <button type="button" class="btn btn-primary" disabled={savingCredentials} on:click={saveCredentials}>
          {savingCredentials ? "Saving..." : "Save Credentials"}
        </button>
        <button type="button" class="btn btn-secondary" disabled={!credentialsSaved} on:click={connectTwitch}>Connect Twitch</button>
      </div>
    </div>
  {/if}
</div>
