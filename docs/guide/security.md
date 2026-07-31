# Security

Anomalist is meant to be exposed to the internet — your mods need to reach it,
and OBS needs to load the overlay. This page covers what that means in practice.

## Put it behind a reverse proxy

Run Anomalist behind nginx, Caddy or Cloudflare with TLS. Then tell it so:

```bash
TRUST_PROXY=1
```

Without this, the server sees every request as coming from the proxy, so the
login rate limiter counts all of your users as one client — ten failed logins by
anyone locks out everybody.

::: danger Do not set `TRUST_PROXY=true`
`true` means "trust every hop", which makes the client's own
`X-Forwarded-For` header authoritative. Anyone could then forge a fresh identity
per request and never be rate limited at all. Anomalist refuses to start with
that value. Use the number of proxies in front of it, or a list of their
addresses.
:::

If the server is reachable directly, leave `TRUST_PROXY` unset.

## Rate limiting

Failed sign-ins are counted per **account and client address**, so one person
fumbling their password cannot lock out anyone else, and someone who holds a
second account cannot reset the counter by signing into it.

| Limit | Window |
|---|---|
| 10 failed sign-ins per account, per address | 15 minutes |
| 50 failed sign-ins per address, across all accounts | 15 minutes |
| 20 failed overlay/dashboard connections per address | 15 minutes |

The second limit exists because the sign-in response is identical whether or not
an account exists, but only a real account costs the server a password hash —
without a ceiling, that timing difference is a way to enumerate usernames.

## The overlay URL is a credential

The overlay URL you paste into OBS contains a token. Anyone with that URL can
connect to your overlay feed and watch your canvas and chat in real time. Treat
it like a password: do not show it on stream, and do not paste it into a public
Discord.

If it leaks, **Settings → Overlay URL → Rotate** issues a new one and disconnects
anything still using the old one. Then update the browser source in OBS.

## What revocation actually does

Demoting someone, revoking a single permission, deleting their account or
changing their password all take effect on their **open session**, not just at
their next sign-in. A deleted or signed-out account is also disconnected from the
live feed, so it stops receiving canvas updates and chat immediately.

## Custom HTML widgets

The custom HTML widget renders markup you supply inside a sandboxed iframe with
scripting allowed but **same-origin access denied**. That combination means a
script in the widget cannot read your session, call the API as you, or touch the
rest of the page.

Moderators cannot add custom HTML widgets — only owners and editors.

## OWNER_TOKEN

`OWNER_TOKEN` is a first-run bootstrap, not a permanent login. It is only
accepted while no accounts exist, and is ignored the moment you create your
owner account. The literal value `change-me` is treated as unset.

## The container

The image runs as an unprivileged user (uid 1000) rather than root, and only the
data and media directories are writable. Nothing in the published image contains
your `.env` or your database.

## Reporting a problem

Please open a GitHub issue for anything you find. If you believe it is sensitive,
say so in the issue without the details and a maintainer will follow up.

## Next steps

- [Managing users](/guide/users)
- [Roles](/guide/roles)
