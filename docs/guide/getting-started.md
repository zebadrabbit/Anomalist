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
| `PORT` | Port the server listens on | `3000` |
| `OWNER_TOKEN` | Emergency backdoor token (set once, keep safe) | — |
| `DATA_DIR` | Where SQLite and media files are stored | `./data` |

::: tip
`OWNER_TOKEN` is a last-resort access method. Once your owner account is created during first-run setup, you won't need it day-to-day.
:::

## Adding the OBS browser source

1. In OBS, add a **Browser Source**
2. Set the URL to `http://your-server:3000/overlay`
3. Match the width and height to your stream resolution (e.g. 1920×1080)
4. Uncheck **Shutdown source when not visible**

That's it — the overlay updates live as you make changes in the dashboard.

## Updating

```bash
git pull
docker compose pull
docker compose up -d
```

## Next steps

- [First-run setup](/guide/first-run)
- [Canvas editor](/guide/canvas)
