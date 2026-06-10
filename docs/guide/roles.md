# Roles & Permissions

Anomalist has three built-in roles. Every user gets a role, and the owner can also set per-user permission overrides on top of the role defaults.

## Roles

| Role | Who it's for |
|---|---|
| **Owner** | You. Full access to everything including user management and Twitch settings. |
| **Editor** | Trusted co-streamers. Full canvas and media access, no user or stream management. |
| **Moderator** | Chat mods. Can move/show/hide widgets and play sounds — can't change content. |

## Permission reference

| Permission | Owner | Editor | Moderator |
|---|---|---|---|
| `widget.add` | ✅ | ✅ | ❌ |
| `widget.remove` | ✅ | ✅ | ❌ |
| `widget.edit` | ✅ | ✅ | ❌ |
| `widget.transform` | ✅ | ✅ | ✅ |
| `widget.visibility` | ✅ | ✅ | ✅ |
| `scene.manage` | ✅ | ✅ | ❌ |
| `media.upload` | ✅ | ✅ | ✅ |
| `media.delete.own` | ✅ | ✅ | ✅ |
| `media.delete.any` | ✅ | ✅ | ❌ |
| `soundboard.play` | ✅ | ✅ | ✅ |
| `user.manage` | ✅ | ❌ | ❌ |
| `stream.manage` | ✅ | ❌ | ❌ |

## Per-user overrides

Go to **Settings → Users**, click a user, and toggle individual permissions. Overrides stack on top of the role — useful for giving one trusted mod editor-level access without promoting them.

## Adding users

Users create their own accounts at the login page. The owner then assigns them a role in **Settings → Users**.

::: warning
New accounts default to no role and cannot access the dashboard until an owner assigns one.
:::
