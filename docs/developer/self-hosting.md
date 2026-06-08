# Self-Hosting

Anomalist production deployment is a single container that serves dashboard, overlay, API, and WebSocket on one port.

## Environment variables reference

- PORT: HTTP port (default 3001)
- DB_PATH: SQLite database file path
- MEDIA_DIR: uploaded media storage directory
- MEDIA_MAX_MB: upload size limit in MB
- SESSION_HOURS: session token lifetime in hours
- OWNER_TOKEN: legacy/emergency backdoor for bootstrap scenarios

## Data Persistence

docker-compose.yml mounts a named volume:

- anomalist_data -> /app/data

This keeps SQLite state across restarts and upgrades.

## Run

```bash
docker compose up -d
```

## Running without Docker

From the repository root:

```bash
npm install
npm run build --workspace=packages/types
npm run build --workspace=packages/widget-sdk
npm run build --workspace=apps/dashboard
npm run build --workspace=apps/overlay
npm run build --workspace=apps/server
```

Then run the server in production mode:

```bash
cd apps/server
NODE_ENV=production npm run start
```

## Reverse Proxy (Nginx)

Example for proxying to Anomalist on localhost:3001:

```nginx
server {
  listen 80;
  server_name your-domain.example;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Upgrade

```bash
git pull
docker compose up -d --build
```

If compose file or image layers changed, Docker rebuilds and restarts automatically while preserving /app/data.
