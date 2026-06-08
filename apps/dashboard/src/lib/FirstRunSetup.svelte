<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { login } from "./stores/auth.js";

  const dispatch = createEventDispatcher<{ success: void }>();

  let username = "";
  let password = "";
  let confirmPassword = "";
  let isSubmitting = false;
  let error = "";

  function validateUsername(value: string): boolean {
    return /^[A-Za-z0-9_]{3,32}$/.test(value);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const normalizedUsername = username.trim();
    if (!validateUsername(normalizedUsername)) {
      error = "Username must be 3-32 characters using letters, numbers, or underscore.";
      return;
    }

    if (password.length < 8) {
      error = "Password must be at least 8 characters.";
      return;
    }

    if (password !== confirmPassword) {
      error = "Passwords do not match.";
      return;
    }

    isSubmitting = true;
    error = "";

    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: normalizedUsername, password })
      });

      const payload = (await response.json().catch(() => ({ error: "Setup failed" }))) as {
        error?: string;
      };

      if (!response.ok) {
        error = payload.error ?? "Setup failed";
        isSubmitting = false;
        return;
      }

      const loginResult = await login(normalizedUsername, password);
      if (!loginResult.success) {
        error = loginResult.error;
      } else {
        dispatch("success");
      }
    } catch (setupError) {
      error = setupError instanceof Error ? setupError.message : "Setup failed";
    }

    isSubmitting = false;
  }
</script>

<div class="hero min-h-screen">
  <div class="card w-full max-w-lg bg-base-200 shadow-xl">
    <form class="card-body gap-5" on:submit={handleSubmit}>
      <div class="text-center">
        <div class="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <svg viewBox="0 0 24 24" class="h-7 w-7" fill="currentColor" aria-hidden="true">
            <path d="M9 2a2 2 0 0 0-2 2v1.07A8 8 0 0 0 4 12v6a2 2 0 0 0 2 2h3v2h2v-2h2v2h2v-2h3a2 2 0 0 0 2-2v-6a8 8 0 0 0-3-6.93V4a2 2 0 0 0-2-2H9Zm0 2h6v1.24a8.08 8.08 0 0 0-6 0V4Zm-3 8a6 6 0 1 1 12 0v6H6v-6Z" />
          </svg>
        </div>
        <h1 class="text-2xl font-semibold">Welcome to Anomalist</h1>
        <p class="mt-1 text-sm text-base-content/70">
          Create your owner account to get started. This account has full access to everything.
        </p>
      </div>

      <label class="form-control w-full">
        <span class="label-text mb-2">Username</span>
        <input
          bind:value={username}
          type="text"
          placeholder="Choose a username"
          class="input input-bordered w-full"
          required
        />
        <span class="mt-1 text-xs text-base-content/60">3-32 chars, letters/numbers/underscore only</span>
      </label>

      <label class="form-control w-full">
        <span class="label-text mb-2">Password</span>
        <input
          bind:value={password}
          type="password"
          placeholder="Create password"
          class="input input-bordered w-full"
          required
        />
      </label>

      <label class="form-control w-full">
        <span class="label-text mb-2">Confirm Password</span>
        <input
          bind:value={confirmPassword}
          type="password"
          placeholder="Confirm password"
          class="input input-bordered w-full"
          required
        />
      </label>

      <button type="submit" class={`btn btn-primary w-full ${isSubmitting ? "btn-disabled" : ""}`}>
        {isSubmitting ? "Creating..." : "Create Account"}
      </button>

      {#if error}
        <div class="alert alert-error text-sm">{error}</div>
      {/if}
    </form>
  </div>
</div>
