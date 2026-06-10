# Anomalist

Self-hosted, open-source stream overlay control for OBS

Anomalist is a real-time overlay control system for streamers who want full ownership of their stack.
It is built for owners, editors, and moderators to run overlays from the browser while OBS displays the result live.
Because it is open-source and self-hosted, your data stays on your server and the platform is easy for the community to extend.

## Features

- Browser-based dashboard, no installs for mods
- Visual canvas editor with drag, resize, and rotate
- Live transforms so OBS reflects movement while you drag
- Widget library: text, image, timer, counter, marquee, clock, shape, soundboard, custom HTML
- Media library for images, video, and audio
- Multi-user auth with roles and per-user permission overrides
- Scene presets for instant layout switching
- Self-hosted by default so all data stays on your server

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
