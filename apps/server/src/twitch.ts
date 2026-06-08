import { randomBytes } from "node:crypto";
import {
  getSetting,
  getTwitchConfig,
  setTwitchConfig,
  type TwitchConfig
} from "./db.js";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";
const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const OAUTH_SCOPE =
  "chat:read chat:edit channel:read:subscriptions moderator:read:followers channel:read:raids channel:manage:broadcast";
const EXPIRY_REFRESH_WINDOW_SECONDS = 300;

let pendingOAuthState: string | null = null;

function getRedirectUri(): string {
  return process.env.TWITCH_REDIRECT_URI ?? "http://localhost:3000/auth/twitch/callback";
}

function getOauthClientConfig(): { clientId: string; clientSecret: string } {
  const clientId = getSetting("twitch_client_id");
  const clientSecret = getSetting("twitch_client_secret");

  if (!clientId || !clientSecret) {
    throw new Error("Twitch credentials are not configured");
  }

  return { clientId, clientSecret };
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function requestToken(params: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Twitch token request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as Partial<TokenResponse>;
  if (
    typeof payload.access_token !== "string"
    || typeof payload.refresh_token !== "string"
    || typeof payload.expires_in !== "number"
  ) {
    throw new Error("Invalid Twitch token response");
  }

  return payload as TokenResponse;
}

async function fetchTwitchUser(accessToken: string, clientId: string): Promise<{
  id: string;
  login: string;
  display_name: string;
}> {
  const response = await fetch(USERS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId
    }
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Failed to fetch Twitch user (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id?: string;
      login?: string;
      display_name?: string;
    }>;
  };

  const user = payload.data?.[0];
  if (!user || typeof user.id !== "string" || typeof user.login !== "string" || typeof user.display_name !== "string") {
    throw new Error("Failed to parse Twitch user profile");
  }

  return {
    id: user.id,
    login: user.login,
    display_name: user.display_name
  };
}

export async function getTwitchToken(): Promise<string> {
  const config = getTwitchConfig();
  if (!config) {
    throw new Error("Twitch not connected");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (config.expires_at - nowSeconds <= EXPIRY_REFRESH_WINDOW_SECONDS) {
    const refreshed = await refreshTwitchToken(config.refresh_token);
    return refreshed.access_token;
  }

  return config.access_token;
}

export async function refreshTwitchToken(refreshToken: string): Promise<TwitchConfig> {
  const current = getTwitchConfig();
  if (!current) {
    throw new Error("Twitch not connected");
  }

  const { clientId, clientSecret } = getOauthClientConfig();
  const token = await requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  );

  const refreshed: TwitchConfig = {
    ...current,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + token.expires_in
  };

  setTwitchConfig(refreshed);
  return refreshed;
}

export function buildOAuthUrl(): string {
  const clientId = getSetting("twitch_client_id");
  if (!clientId) {
    throw new Error("Twitch client ID is not configured");
  }

  pendingOAuthState = randomBytes(8).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: OAUTH_SCOPE,
    state: pendingOAuthState
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string, state: string): Promise<TwitchConfig> {
  if (!pendingOAuthState || state !== pendingOAuthState) {
    throw new Error("Invalid OAuth state");
  }

  pendingOAuthState = null;

  const { clientId, clientSecret } = getOauthClientConfig();
  const token = await requestToken(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getRedirectUri()
    })
  );

  const user = await fetchTwitchUser(token.access_token, clientId);
  const config: TwitchConfig = {
    twitch_user_id: user.id,
    twitch_login: user.login,
    twitch_display_name: user.display_name,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + token.expires_in
  };

  setTwitchConfig(config);
  return config;
}
