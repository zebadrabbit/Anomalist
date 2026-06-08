<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { authStore } from "./stores/auth.js";
  import { addToast } from "./stores/toast.js";

  interface ManagedUser {
    id: string;
    username: string;
    role: "owner" | "editor" | "moderator";
    createdAt: string;
    overrides: Array<{ permission: string; granted: boolean }>;
  }

  interface PermissionItem {
    permission: string;
    granted: boolean;
    overridden: boolean;
  }

  const permissionLabels: Record<string, string> = {
    "widget.add": "Add Widgets",
    "widget.remove": "Remove Widgets",
    "widget.edit": "Edit Widget Settings",
    "widget.transform": "Move & Resize Widgets",
    "widget.visibility": "Show / Hide Widgets",
    "scene.manage": "Manage Scenes",
    "media.upload": "Upload Media",
    "media.delete.own": "Delete Own Media",
    "media.delete.any": "Delete Any Media",
    "soundboard.play": "Play Sounds",
    "stream.manage": "Manage Stream",
    "user.manage": "Manage Users"
  };

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  let users: ManagedUser[] = [];
  let isLoading = false;
  let error = "";

  let showAddUser = false;
  let newUsername = "";
  let newPassword = "";
  let newRole: "editor" | "moderator" = "moderator";

  let resetPasswordForUserId: string | null = null;
  let resetPasswordValue = "";

  let expandedPermissionsUserId: string | null = null;
  let permissionRows: PermissionItem[] = [];
  let loadingPermissions = false;

  let showDeleteConfirmForId: string | null = null;

  $: currentAuth = $authStore;

  $: if (open) {
    void loadUsers();
  }

  function getToken(): string | null {
    return currentAuth.token;
  }

  function roleBadgeClass(role: ManagedUser["role"]): string {
    if (role === "owner") {
      return "badge-primary";
    }

    if (role === "editor") {
      return "badge-secondary";
    }

    return "badge-accent";
  }

  async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const headers = new Headers(init.headers ?? {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return fetch(path, {
      ...init,
      headers
    });
  }

  function isOnlyOwner(user: ManagedUser): boolean {
    if (user.role !== "owner") {
      return false;
    }

    return users.filter((item) => item.role === "owner").length <= 1;
  }

  async function loadUsers() {
    isLoading = true;
    error = "";
    try {
      const response = await authFetch("/api/users");
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to load users" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to load users");
      }

      users = (await response.json()) as ManagedUser[];
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : "Failed to load users";
    } finally {
      isLoading = false;
    }
  }

  async function createUser() {
    const username = newUsername.trim();
    if (!username || newPassword.length < 8) {
      addToast("warning", "Username and a password of at least 8 chars are required.");
      return;
    }

    const response = await authFetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password: newPassword, role: newRole })
    });

    const payload = (await response.json().catch(() => ({ error: "Failed to create user" }))) as {
      error?: string;
    };

    if (!response.ok) {
      addToast("error", payload.error ?? "Failed to create user");
      return;
    }

    addToast("success", "User created");
    showAddUser = false;
    newUsername = "";
    newPassword = "";
    newRole = "moderator";
    await loadUsers();
  }

  async function updateRole(userId: string, role: ManagedUser["role"]) {
    const response = await authFetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ role })
    });

    const payload = (await response.json().catch(() => ({ error: "Failed to update role" }))) as {
      error?: string;
    };

    if (!response.ok) {
      addToast("error", payload.error ?? "Failed to update role");
      await loadUsers();
      return;
    }

    addToast("success", "Role updated");
    await loadUsers();
  }

  async function resetPassword(userId: string) {
    if (resetPasswordValue.length < 8) {
      addToast("warning", "Password must be at least 8 chars");
      return;
    }

    const response = await authFetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: resetPasswordValue })
    });

    const payload = (await response.json().catch(() => ({ error: "Failed to reset password" }))) as {
      error?: string;
    };

    if (!response.ok) {
      addToast("error", payload.error ?? "Failed to reset password");
      return;
    }

    addToast("success", "Password updated");
    resetPasswordForUserId = null;
    resetPasswordValue = "";
  }

  async function deleteUser(userId: string) {
    const response = await authFetch(`/api/users/${userId}`, {
      method: "DELETE"
    });

    const payload = (await response.json().catch(() => ({ error: "Failed to delete user" }))) as {
      error?: string;
    };

    if (!response.ok) {
      addToast("error", payload.error ?? "Failed to delete user");
      return;
    }

    addToast("success", "User deleted");
    showDeleteConfirmForId = null;
    await loadUsers();
  }

  async function loadPermissions(userId: string) {
    expandedPermissionsUserId = userId;
    loadingPermissions = true;

    try {
      const response = await authFetch(`/api/users/${userId}/permissions`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to load permissions" }))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to load permissions");
      }

      permissionRows = (await response.json()) as PermissionItem[];
    } catch (permissionError) {
      addToast("error", permissionError instanceof Error ? permissionError.message : "Failed to load permissions");
      permissionRows = [];
      expandedPermissionsUserId = null;
    } finally {
      loadingPermissions = false;
    }
  }

  async function setPermissionMode(userId: string, permission: string, mode: "default" | "grant" | "deny") {
    if (mode === "default") {
      const response = await authFetch(`/api/users/${userId}/permissions/${permission}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to clear override" }))) as {
          error?: string;
        };
        addToast("error", payload.error ?? "Failed to clear override");
      }
    } else {
      const response = await authFetch(`/api/users/${userId}/permissions/${permission}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ granted: mode === "grant" })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: "Failed to set override" }))) as {
          error?: string;
        };
        addToast("error", payload.error ?? "Failed to set override");
      }
    }

    await loadPermissions(userId);
    await loadUsers();
  }

  async function clearAllOverrides(userId: string) {
    for (const row of permissionRows) {
      if (row.overridden) {
        await authFetch(`/api/users/${userId}/permissions/${row.permission}`, {
          method: "DELETE"
        });
      }
    }

    addToast("success", "Overrides cleared");
    await loadPermissions(userId);
    await loadUsers();
  }

  function currentPermissionMode(item: PermissionItem): "default" | "grant" | "deny" {
    if (!item.overridden) {
      return "default";
    }

    return item.granted ? "grant" : "deny";
  }

  function closeModal() {
    dispatch("close");
  }
</script>

{#if open}
  <dialog class="modal modal-open">
    <div class="modal-box w-11/12 max-w-5xl">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-bold">User Management</h3>
        <button class="btn btn-sm" type="button" on:click={closeModal}>Close</button>
      </div>

      <div class="mb-4 flex items-center justify-between">
        <button class="btn btn-primary btn-sm" type="button" on:click={() => (showAddUser = !showAddUser)}>Add User</button>
      </div>

      {#if showAddUser}
        <div class="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-base-300 p-3 md:grid-cols-4">
          <input class="input input-bordered input-sm" placeholder="Username" bind:value={newUsername} />
          <input class="input input-bordered input-sm" type="password" placeholder="Password" bind:value={newPassword} />
          <select class="select select-bordered select-sm" bind:value={newRole}>
            <option value="editor">editor</option>
            <option value="moderator">moderator</option>
          </select>
          <button class="btn btn-primary btn-sm" type="button" on:click={createUser}>Create</button>
        </div>
      {/if}

      {#if error}
        <div class="alert alert-error mb-3 text-sm">{error}</div>
      {/if}

      {#if isLoading}
        <div class="py-8 text-center">
          <span class="loading loading-spinner loading-md"></span>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each users as user (user.id)}
                <tr class={user.id === currentAuth.user?.id ? "bg-base-300/40" : ""}>
                  <td>{user.username}</td>
                  <td>
                    <span class={`badge ${roleBadgeClass(user.role)}`}>{user.role}</span>
                  </td>
                  <td>
                    <div class="flex flex-wrap gap-2">
                      <select
                        class="select select-bordered select-xs"
                        value={user.role}
                        disabled={user.role === "owner"}
                        on:change={(event) => updateRole(user.id, event.currentTarget.value as ManagedUser["role"])}
                      >
                        <option value="owner">owner</option>
                        <option value="editor">editor</option>
                        <option value="moderator">moderator</option>
                      </select>

                      <button class="btn btn-xs" type="button" on:click={() => loadPermissions(user.id)}>Permissions</button>

                      <button class="btn btn-xs" type="button" on:click={() => (resetPasswordForUserId = user.id)}>Reset Password</button>

                      <button
                        class="btn btn-error btn-xs"
                        type="button"
                        disabled={isOnlyOwner(user)}
                        on:click={() => (showDeleteConfirmForId = user.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>

                {#if resetPasswordForUserId === user.id}
                  <tr>
                    <td colspan="3">
                      <div class="flex flex-wrap items-center gap-2 rounded border border-base-300 p-2">
                        <input
                          class="input input-bordered input-sm"
                          type="password"
                          placeholder="New password"
                          bind:value={resetPasswordValue}
                        />
                        <button class="btn btn-primary btn-sm" type="button" on:click={() => resetPassword(user.id)}>Save Password</button>
                        <button class="btn btn-sm" type="button" on:click={() => (resetPasswordForUserId = null)}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                {/if}

                {#if expandedPermissionsUserId === user.id}
                  <tr>
                    <td colspan="3">
                      <div class="rounded-lg border border-base-300 p-3">
                        {#if loadingPermissions}
                          <span class="loading loading-spinner loading-sm"></span>
                        {:else}
                          <div class="mb-2 flex items-center justify-between">
                            <h4 class="font-semibold">Permission Overrides</h4>
                            <button class="btn btn-xs" type="button" on:click={() => clearAllOverrides(user.id)}>Clear all overrides</button>
                          </div>
                          <div class="grid gap-2">
                            {#each permissionRows as row (row.permission)}
                              <div class={`rounded border p-2 ${row.overridden ? "border-primary/60 bg-primary/5" : "border-base-300"}`}>
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p class="text-sm font-medium">{permissionLabels[row.permission] ?? row.permission}</p>
                                    <p class="text-xs opacity-60">Default: {row.granted ? "Granted" : "Denied"}</p>
                                  </div>
                                  <select
                                    class="select select-bordered select-xs"
                                    value={currentPermissionMode(row)}
                                    on:change={(event) =>
                                      setPermissionMode(
                                        user.id,
                                        row.permission,
                                        event.currentTarget.value as "default" | "grant" | "deny"
                                      )}
                                  >
                                    <option value="default">Role Default</option>
                                    <option value="grant">Grant</option>
                                    <option value="deny">Deny</option>
                                  </select>
                                </div>
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if showDeleteConfirmForId}
        <div class="mt-4 rounded-lg border border-error/50 bg-error/10 p-3">
          <p class="mb-2 text-sm">Delete this user permanently?</p>
          <div class="flex gap-2">
            <button class="btn btn-error btn-sm" type="button" on:click={() => deleteUser(showDeleteConfirmForId!)}>Confirm Delete</button>
            <button class="btn btn-sm" type="button" on:click={() => (showDeleteConfirmForId = null)}>Cancel</button>
          </div>
        </div>
      {/if}
    </div>
    <form method="dialog" class="modal-backdrop">
      <button type="button" on:click={closeModal}>close</button>
    </form>
  </dialog>
{/if}
