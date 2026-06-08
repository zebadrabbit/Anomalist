# Architecture

## Overview

```text
OBS Browser Source <-> Overlay App (SvelteKit)
                     ^
                     | WebSocket (Socket.io)
                     v
Dashboard (SvelteKit) <-> Server (Express + Socket.io)
                          |
                          v
                    SQLite Database
```

## Apps and their roles

- server: state management, auth, REST API, and WebSocket relay
- dashboard: moderator/editor/owner control UI
- overlay: OBS browser source renderer (read-only client)

## Packages

- @anomalist/types: shared TypeScript interfaces and socket event constants
- @anomalist/widget-sdk: widget registration API for community contributions

## Data flow

Widget change flow:
1. Dashboard emits an event.
2. Server checks permissions.
3. Server mutates canvasState.
4. Server saves to SQLite.
5. Server broadcasts CANVAS_UPDATE.
6. Overlay re-renders.

## Real-time transform streaming

WIDGET_TRANSFORM bypasses state mutation and DB writes.

The server relays transform events directly so the overlay can preview live drag and resize smoothly.

WIDGET_UPDATE on mouseup persists the final position.

## Auth model

Session tokens are stored in SQLite and expire after SESSION_HOURS.

Every socket event is permission-checked server-side.
Dashboard UI gating is cosmetic only. The server is authoritative.

## Adding a widget

For widget authoring details, see docs/developer/widget-sdk.md.

## Twitch Integration

Server-side Twitch integration is split into three modules:

- `apps/server/src/twitch.ts`: OAuth credential/token management.
Exposes `getTwitchToken()`, which returns a valid access token and refreshes when expiry is within 5 minutes.
All server code that calls Twitch APIs should obtain tokens through this module.
- `apps/server/src/chatbot.ts`: Twitch IRC chatbot via `tmi.js`.
Lifecycle is `startChatbot()` and `stopChatbot()`.
On incoming chat commands, it emits `sound:play` for `!sound` and updates `canvasState` counters for `!counter` through callbacks passed at startup.
It also emits `chat:message` for every incoming chat message so overlay chat widgets can render it.
- `apps/server/src/eventsub.ts`: EventSub WebSocket client via `ws`.
Maintains a single persistent connection, subscribes to `channel.subscribe`, `channel.follow`, and `channel.raid` on `session_welcome`, and emits `twitch:alert` with resolved alert action (`soundUrl`, `widgetId`, `duration`).
Includes keepalive watchdog and reconnect behavior.

Lifecycle for all three modules:

- Auto-start on server boot when `twitch_config` exists in SQLite.
- Start after successful OAuth callback.
- Stop on owner disconnect.

Settings are stored in the `settings` table (`key`/`value`).
Relevant keys:

- `twitch_client_id`
- `twitch_client_secret`
- `chatbot_enabled`
- `chatbot_prefix`
- `alert_config`

New endpoint summary:

```text
GET  /api/twitch/status              - connection + chatbot state
POST /api/twitch/credentials         - save client ID + secret (owner)
GET  /auth/twitch/connect            - begin OAuth redirect (owner)
GET  /auth/twitch/callback           - OAuth code exchange
DEL  /api/twitch/disconnect          - disconnect + stop chatbot + eventsub (owner)
POST /api/twitch/chatbot             - enable/disable chatbot (owner)
GET  /api/twitch/alerts/config       - read alert config (owner)
PUT  /api/twitch/alerts/config       - update alert config (owner)
GET  /api/twitch/stream              - current title + game (stream.manage)
PATCH /api/twitch/stream             - update title and/or game_id (stream.manage)
GET  /api/twitch/stream/search-games - search Twitch categories (stream.manage)
```
