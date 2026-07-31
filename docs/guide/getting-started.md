# Installation

Anomalist runs via Docker. You need [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed on your server or computer.

## Quick start

```bash
# Clone the repo
git clone https://github.com/zebadrabbit/Anomalist.git
cd Anomalist

# Copy and edit the environment file
cp .env.example .env

# Start Anomalist
docker compose up -d
```

Open the local dashboard in your browser. You'll be walked through first-run setup.

## Environment variables

Edit `.env` before starting:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3001` |
| `OWNER_TOKEN` | Emergency backdoor token (set once, keep safe) | — |
| `DB_PATH` | Where the SQLite database lives | `/app/data/anomalist.db` in Docker, `./anomalist.db` otherwise |
| `MEDIA_DIR` | Where uploaded media is stored | `/app/media` in Docker, `./media` otherwise |
| `MEDIA_MAX_BYTES` | Largest upload accepted | `104857600` (100 MB) |
| `CORS_ORIGIN` | Comma-separated origins allowed to connect | all |

::: tip
`OWNER_TOKEN` is a last-resort access method. Once your owner account is created during first-run setup, you won't need it day-to-day.
:::

## Adding the OBS browser source

The overlay needs its own access token, so copy the URL from the dashboard rather than
typing it by hand.

1. In the dashboard, open **Settings** and find **Overlay URL**
2. Click **Copy** — the URL looks like `http://your-server:3001/overlay?token=...`
3. In OBS, add a **Browser Source** and paste that URL
4. Match the width and height to your stream resolution (e.g. 1920×1080)
5. Uncheck **Shutdown source when not visible**

That's it — the overlay updates live as you make changes in the dashboard.

::: warning
The overlay URL is a credential. It is read-only — it can display your overlay but never
change it — but anyone holding the link can watch your overlay, so don't show it on stream
or paste it in chat. If it leaks, click **Rotate** in Settings; overlays using the old link
are disconnected immediately and you re-paste the new URL into OBS.
:::

## Updating

```bash
git pull
docker compose up -d --build
```

Anomalist is built from source rather than pulled from a registry, so
`docker compose pull` has nothing to fetch — it reports `Skipped - No image to
be pulled` and leaves you on the old build. `--build` is what actually updates.

### One-time step when upgrading from a build before the container dropped root

The container now runs as the unprivileged `node` user (uid 1000) instead of
root. Docker volumes created by an older build are owned by root, so the new
container cannot write to them. It refuses to start and tells you as much:

```
Error: /app/data is not writable by uid 1000.
```

Hand the volumes over once, then start normally:

```bash
docker compose down
docker run --rm -v anomalist_data:/d alpine chown -R 1000:1000 /d
docker run --rm -v anomalist_media:/d alpine chown -R 1000:1000 /d
docker compose up -d
```

Fresh installs need none of this — Docker seeds a new volume with the
ownership already baked into the image.

## Next steps

- [First-run setup](/guide/first-run)
- [Canvas editor](/guide/canvas)
