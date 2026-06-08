# Getting Started

## What is Anomalist?

Anomalist is a self-hosted overlay control system for OBS.
You run it on your own machine or server, then trusted mods control overlays from any web browser while you focus on streaming.

## What you need

- A computer to host it (or a home server)
- Docker Desktop
- OBS Studio
- A web browser

That is it.

## Installation

### Step 1: Download Anomalist

```bash
git clone https://github.com/zebadrabbit/Anomalist.git
cd Anomalist
```

### Step 2: Set your owner token

Copy apps/server/.env.example to apps/server/.env.

Note: token is now replaced by your owner account - leave OWNER_TOKEN as-is, you will create your account in the browser.

### Step 3: Start it

```bash
docker compose up -d
```

### Step 4: Open the dashboard

Open http://localhost:3001

Create your owner account on first run.

## Adding it to OBS

1. Add Source -> Browser
2. URL: http://localhost:3001/overlay
3. Width: 1920
4. Height: 1080
5. Check "Shutdown source when not visible"
6. Uncheck "Refresh browser when scene becomes active"

## Your first overlay

1. Add a text widget.
2. Type your message.
3. Drag it into position on the canvas.
4. Click the eye icon to show it.

You should see it appear in OBS immediately.

## Giving mods access

Open User Management (gear icon), create a moderator account, then share the dashboard URL and their login.
