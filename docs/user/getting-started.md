# Getting Started

You can run Anomalist on your own machine with Docker in just a few minutes.

## What You Need

- Docker Desktop installed and running.
- This Anomalist project folder.
- About 5 to 10 minutes.

## Install and Start

1. Open the project folder.
2. Create a file named .env in the project root.
3. Add your owner token to that file:

```env
OWNER_TOKEN=pick-a-strong-token-you-will-remember
```

4. Start Anomalist:

```bash
docker compose up --build
```

5. Wait until you see logs that the server is listening on port 3001.

That is it. Anomalist is now running.

## Add to OBS

1. In OBS, add a Browser Source.
2. URL: http://localhost:3001/overlay
3. Width: 1920
4. Height: 1080
5. Click OK.

Your overlay is now connected.

## Log In to the Dashboard

1. Open http://localhost:3001/ in your browser.
2. Enter the same token from your .env file.
3. Click Connect.

## Your First Overlay

1. In the dashboard, click Text under Add Widget.
2. Select the widget in the list.
3. Change the content to what you want on stream.
4. Click Push to Live.

You should immediately see the text in OBS.

## Stopping Anomalist

When you are done streaming, stop it with:

```bash
docker compose down
```

Your saved data stays on disk and will be there next time.
