# Self-Hosting

Anomalist production deployment is a single container that serves dashboard, overlay, API, and WebSocket on one port.

## Environment Variables

- PORT: HTTP port inside the container (default 3001).
- DB_PATH: SQLite database file path (default /app/data/anomalist.db in compose).
- OWNER_TOKEN: required dashboard auth token. Set a strong value.

Example root .env:

```env
PORT=3001
OWNER_TOKEN=replace-with-strong-token
```

## Data Persistence

docker-compose.yml mounts a named volume:

- anomalist_data -> /app/data

This keeps SQLite state across restarts and upgrades.

## Run

```bash
docker compose up --build -d
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
  }
}
```

## Upgrade

```bash
git pull
docker compose up --build -d
```

If compose file or image layers changed, Docker rebuilds and restarts automatically while preserving /app/data.
