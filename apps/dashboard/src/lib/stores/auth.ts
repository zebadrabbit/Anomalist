import { derived, writable } from "svelte/store";
import type { User } from "@anomalist/types";

interface AuthState {
  user: User | null;
  token: string | null;
  permissions: string[];
}

const initialAuthState: AuthState = {
  user: null,
  token: null,
  permissions: []
};

export const authStore = writable<AuthState>(initialAuthState);

export const can = derived(authStore, ($auth) => {
  return (permission: string): boolean => $auth.permissions.includes(permission);
});

function getAuthToken(): string | null {
  let token: string | null = null;
  const unsubscribe = authStore.subscribe((value) => {
    token = value.token;
  });
  unsubscribe();
  return token;
}

function getHeaders(includeJson = true): HeadersInit {
  const headers: HeadersInit = {};
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function checkSetup(): Promise<{ setup: boolean }> {
  const response = await fetch("/api/auth/status", {
    headers: getHeaders(false)
  });

  if (!response.ok) {
    throw new Error("Failed to load auth status");
  }

  return (await response.json()) as { setup: boolean };
}

export async function login(
  username: string,
  password: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const loginResponse = await fetch("/api/auth/login", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ username, password })
    });

    const loginPayload = (await loginResponse.json().catch(() => ({ error: "Login failed" }))) as {
      token?: string;
      user?: User;
      error?: string;
    };

    if (!loginResponse.ok || !loginPayload.token || !loginPayload.user) {
      return {
        success: false,
        error: loginPayload.error ?? "Login failed"
      };
    }

    const token = loginPayload.token;

    const meResponse = await fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const mePayload = (await meResponse.json().catch(() => ({ error: "Failed to load user profile" }))) as {
      id?: string;
      username?: string;
      role?: User["role"];
      permissions?: string[];
      error?: string;
    };

    if (!meResponse.ok || !mePayload.id || !mePayload.username || !mePayload.role) {
      return {
        success: false,
        error: mePayload.error ?? "Failed to load user profile"
      };
    }

    authStore.set({
      token,
      user: {
        id: mePayload.id,
        username: mePayload.username,
        role: mePayload.role
      },
      permissions: mePayload.permissions ?? []
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed"
    };
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: getHeaders()
    });
  } finally {
    authStore.set(initialAuthState);
  }
}
