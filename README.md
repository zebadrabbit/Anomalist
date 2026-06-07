# Anomalist

Self-hosted stream overlay control for OBS.

Anomalist lets streamers run their own real-time overlay control stack while giving moderators a remote dashboard to manage scenes, layers, and widgets during a live broadcast. The system is open source and self-hosted, so communities can customize and operate it on their own infrastructure.

## Quick Start

1. Clone the repository.
2. Install dependencies: `npm install`
3. Start development: `npm run dev`

## How It Works

The OBS browser source loads the overlay app, which syncs in real time with the server over WebSockets. Moderators use the dashboard to control state and push changes to the live overlay.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

MIT
