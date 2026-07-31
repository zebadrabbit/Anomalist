# Permissions

Every action a user can take is gated on a named permission. Roles are a default
set of those, and per-user overrides adjust individuals.

## The permissions

| Permission | Grants |
|---|---|
| `widget.add` | Add widgets to the canvas |
| `widget.remove` | Delete widgets |
| `widget.edit` | Change widget properties |
| `widget.transform` | Move, resize and rotate |
| `widget.visibility` | Show and hide widgets |
| `scene.manage` | Scenes, layers and presets |
| `media.upload` | Upload to the media library |
| `media.delete.own` | Delete your own uploads |
| `media.delete.any` | Delete anyone's uploads |
| `soundboard.play` | Trigger soundboard sounds |
| `stream.manage` | Twitch connection and alerts |
| `user.manage` | Create, modify and delete users |

## Role defaults

| Permission | Owner | Editor | Moderator |
|---|:---:|:---:|:---:|
| `widget.add` | ✅ | ✅ | — |
| `widget.remove` | ✅ | ✅ | — |
| `widget.edit` | ✅ | ✅ | — |
| `widget.transform` | ✅ | ✅ | ✅ |
| `widget.visibility` | ✅ | ✅ | ✅ |
| `scene.manage` | ✅ | ✅ | — |
| `media.upload` | ✅ | ✅ | ✅ |
| `media.delete.own` | ✅ | ✅ | ✅ |
| `media.delete.any` | ✅ | ✅ | — |
| `soundboard.play` | ✅ | ✅ | ✅ |
| `stream.manage` | ✅ | — | — |
| `user.manage` | ✅ | — | — |

## Resolution order

`resolvePermission(role, permission, overrides)` decides in this order:

1. An owner always has `user.manage`. This is not overridable — without it you
   could lock every administrator out of the installation.
2. A per-user override for that permission wins, whether it grants or revokes.
3. Otherwise the role default applies.

## Resolved per request, not per session

Permissions are read from the database on **every** check, including on an
already-connected socket. There is no cached copy on the connection.

That matters because a dashboard or OBS tab stays open for an entire stream. If
permissions were snapshotted when the socket authenticated, revoking one would
do nothing until that person happened to reconnect.

The same check also confirms the account still exists and its session is still
valid, so deleting an account or signing it out stops it acting immediately —
and drops its socket, so it stops receiving broadcasts too.

## Two identities have no database row

The overlay and the first-run owner token are synthesised when the socket
authenticates:

- **Overlay** — resolves to a role with no entries in the permission table, so it
  can receive broadcasts and change nothing.
- **Owner token** — honoured only while no accounts exist, matching the HTTP
  path, so a socket opened during first-run setup cannot keep owner rights after
  you create your account.

Any code that looks a socket's user up again has to allow for these; looking them
up in the users table returns nothing and would disconnect every OBS source.

## Adding a permission

1. Add it to `Permissions` in `apps/server/src/permissions.ts`.
2. Add it to the roles in `roleDefaults` that should have it by default.
3. Gate the route or socket handler on it.
4. Add a test that a role without it is refused.

Existing users pick it up automatically from their role.

## Next steps

- [Real-time sync](/dev/realtime)
- [Roles](/guide/roles)
