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

### Connecting Twitch (optional)

Twitch is optional. Anomalist works fine without it.

If you do connect Twitch, you unlock chatbot commands, event alerts, and stream management from inside the dashboard.

1. Go to dev.twitch.tv and create an application.
2. Name it anything you want (for example, My Anomalist).
3. Set the OAuth redirect URI to the URL shown in your Anomalist settings panel.
4. Copy the Client ID and Client Secret.
5. In Anomalist, click the Settings button (gear icon at the bottom of the left sidebar, owners only).
6. Paste your Client ID and Client Secret, then click Save Credentials.
7. Click Connect Twitch and log in when Twitch asks.
8. You will return to Anomalist and see Connected as [your channel].

Your credentials are stored locally on your own Anomalist server. They are only used to talk to Twitch and are not sent to any other service.

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
