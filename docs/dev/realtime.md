# Real-time Sync

Everything the dashboard does reaches the overlay over a single socket.io
connection. There is no polling and no save button.

## Connecting

1. The client opens a socket.
2. It emits `JOIN` with a token — a session token for the dashboard, the overlay
   token for OBS.
3. The server answers `auth:success` and adds the socket to the authenticated
   room, or `AUTH_ERROR` and disconnects it.

A socket that never joins stays connected but receives nothing.

::: warning Re-join on every connect, not just the first
socket.io reconnects with a **new** server-side socket that has not joined. The
overlay re-emits `JOIN` on every `connect` event for exactly this reason. A
client that joins only once goes silent after its first dropped connection.
:::

## Broadcasts are room-scoped

Every broadcast targets the authenticated room rather than every connected
socket. A plain `io.emit()` would reach sockets that merely opened a connection
and never authenticated, which is why the room exists — the constant lives in
`apps/server/src/broadcast.ts` so the server, chatbot and EventSub modules cannot
drift apart.

## Events

Client to server:

| Event | Permission |
|---|---|
| `WIDGET_ADD` | `widget.add` |
| `WIDGET_REMOVE` | `widget.remove` |
| `WIDGET_UPDATE` | Depends on the change — see below |
| `widget:transform` | `widget.transform` |
| `widget:lock` | `widget.transform` |
| `widget:reorder` | `widget.transform` |
| `SCENE_CHANGE` | `scene.manage` |
| `scene:clear` | `widget.remove` |
| `preset:save`, `preset:load`, `preset:delete`, `preset:list` | `scene.manage` |
| `sound:play` | `soundboard.play` |

`WIDGET_UPDATE` picks its permission from what the update actually touches, so a
moderator can hide a widget without being able to rewrite it:

| The update changes | Permission |
|---|---|
| Only `visible` | `widget.visibility` |
| Only geometry | `widget.transform` |
| Anything else | `widget.edit` |

Server to client:

| Event | Meaning |
|---|---|
| `CANVAS_UPDATE` | Full canvas state; the overlay re-renders from it |
| `widget:transform` | A live drag in progress, relayed to other clients |
| `chat:message` | A Twitch chat message |
| `sound:play` | Play a sound |
| `twitch:alert` | A follow, sub or raid |
| `permission:denied` | The last action was refused, with the permission name |
| `AUTH_ERROR` | Token rejected, rate limited, or session no longer valid |

## Why transforms are separate

`CANVAS_UPDATE` carries the whole canvas and is persisted. `widget:transform`
carries one widget's geometry, is relayed straight to the other clients without
touching the database, and fires continuously while a drag is in progress.

Sending a full canvas update per mouse move would be both slow and a great deal
of disk writing, so the drag streams transforms and one `WIDGET_UPDATE` lands the
final position.

## Authorization is not cached

Permission checks read the database on every event, and also confirm the account
still exists and the session is still valid. See [Permissions](/dev/permissions)
for why, and for the two synthetic identities that need special handling.

Connections are rate limited per client address, so a failed `JOIN` cannot be
retried indefinitely.

## Next steps

- [Permissions](/dev/permissions)
- [Architecture](/dev/architecture)
