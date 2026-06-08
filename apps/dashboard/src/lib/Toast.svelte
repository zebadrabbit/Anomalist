<script lang="ts">
  import { toasts, removeToast } from "./stores/toast.js";

  function alertClass(type: "info" | "success" | "warning" | "error"): string {
    if (type === "success") {
      return "alert-success";
    }

    if (type === "warning") {
      return "alert-warning";
    }

    if (type === "error") {
      return "alert-error";
    }

    return "alert-info";
  }
</script>

<div class="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
  {#each $toasts as toast (toast.id)}
    <div class={`alert shadow-lg ${alertClass(toast.type)}`} role="status">
      <span class="text-sm">{toast.message}</span>
      <button class="btn btn-ghost btn-xs" type="button" on:click={() => removeToast(toast.id)}>x</button>
    </div>
  {/each}
</div>
