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
