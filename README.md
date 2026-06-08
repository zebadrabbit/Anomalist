# Anomalist

Self-hosted, open-source stream overlay control for OBS

Anomalist is a real-time overlay control system for streamers who want full ownership of their stack.
It is built for owners, editors, and moderators to run overlays from the browser while OBS displays the result live.
Because it is open-source and self-hosted, your data stays on your server and the platform is easy for the community to extend.

## Features

- **Visual canvas editor** - drag, resize, and rotate widgets in real time
- **Widget library** - text, image, timer, counter, clock, marquee, shape, soundboard, chat feed, custom HTML
- **Twitch integration** - chatbot commands, event alerts, stream management
- **User roles** - owner, editor, moderator with per-user permission overrides
- **Media library** - host your own images, video, and audio
- **Scene presets** - save and restore full canvas layouts
- **Self-hosted** - your data stays on your server, Docker deployment included

## Quick Start

Prerequisites: Docker, OBS Studio

```bash
git clone https://github.com/zebadrabbit/Anomalist.git
cd Anomalist
docker compose up -d
```

Then open http://localhost:3001

## Documentation

- User guide: [docs/user/getting-started.md](docs/user/getting-started.md)
- Developer architecture: [docs/developer/architecture.md](docs/developer/architecture.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

New widgets are especially welcome - see the widget SDK docs.

## License

MIT - Anomalist Contributors
