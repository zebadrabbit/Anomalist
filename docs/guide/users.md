# Managing Users

Anomalist is multi-user by design: you run the stream, your mods help, and
nobody needs your password to do it.

## Adding someone

**Settings → Users → Add user**, then choose a username, a password and a role.
Usernames are 3–32 characters, letters, numbers and underscores. Passwords must
be at least 8 characters.

Managing users requires the `user.manage` permission, which only owners have.

## Roles

| Role | Intended for |
|---|---|
| Owner | You. Full control, including users and Twitch settings |
| Editor | Trusted collaborators who build and arrange overlays |
| Moderator | Helpers who run the overlay during a stream |

See [Roles](/guide/roles) for the exact permission matrix.

## Per-user overrides

Roles are a starting point, not a cage. For any individual you can grant or
revoke a single permission without changing their role — for example, giving one
trusted moderator `widget.edit` while leaving the rest of the moderators alone.

An override always wins over the role default, in both directions.

::: tip
One rule cannot be overridden: an owner always keeps `user.manage`. Otherwise it
would be possible to lock yourself out of your own installation.
:::

## Changes apply immediately

Demoting someone, revoking a permission, or deleting an account takes effect on
their **open session**, not just the next time they sign in. A dashboard tab
left open all stream loses the privilege the moment you remove it, and a deleted
account is disconnected from the live overlay feed rather than quietly
continuing to watch it.

## Removing someone

Deleting an account signs them out everywhere and drops their socket. The last
remaining owner cannot be deleted, so there is always someone who can administer
the installation.

If you only want to end their current session, have them sign out — or change
their password, which invalidates the session they are holding.

## Next steps

- [Roles](/guide/roles)
- [Security](/guide/security)
