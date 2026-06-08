<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { login } from "./stores/auth.js";

  const dispatch = createEventDispatcher<{ success: void }>();

  let username = "";
  let password = "";
  let isSubmitting = false;
  let error = "";

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    isSubmitting = true;
    error = "";

    const result = await login(username.trim(), password);
    if (result.success) {
      dispatch("success");
    } else {
      error = result.error;
    }

    isSubmitting = false;
  }
</script>

<div class="hero min-h-screen">
  <div class="card w-full max-w-md bg-base-200 shadow-xl">
    <form class="card-body gap-5" on:submit={handleSubmit}>
      <div class="text-center">
        <div class="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <svg viewBox="0 0 24 24" class="h-7 w-7" fill="currentColor" aria-hidden="true">
            <path d="M9 2a2 2 0 0 0-2 2v1.07A8 8 0 0 0 4 12v6a2 2 0 0 0 2 2h3v2h2v-2h2v2h2v-2h3a2 2 0 0 0 2-2v-6a8 8 0 0 0-3-6.93V4a2 2 0 0 0-2-2H9Zm0 2h6v1.24a8.08 8.08 0 0 0-6 0V4Zm-3 8a6 6 0 1 1 12 0v6H6v-6Z" />
          </svg>
        </div>
        <h1 class="text-2xl font-semibold">Anomalist</h1>
        <p class="mt-1 text-sm text-base-content/70">Sign in to control your stream overlay</p>
      </div>

      <label class="form-control w-full">
        <span class="label-text mb-2">Username</span>
        <input
          bind:value={username}
          type="text"
          placeholder="Username"
          class="input input-bordered w-full"
          autocomplete="username"
          required
        />
      </label>

      <label class="form-control w-full">
        <span class="label-text mb-2">Password</span>
        <input
          bind:value={password}
          type="password"
          placeholder="Password"
          class="input input-bordered w-full"
          autocomplete="current-password"
          required
        />
      </label>

      <button type="submit" class={`btn btn-primary w-full ${isSubmitting ? "btn-disabled" : ""}`}>
        {isSubmitting ? "Connecting..." : "Connect"}
      </button>

      {#if error}
        <div class="alert alert-error text-sm">{error}</div>
      {/if}
    </form>
  </div>
</div>
