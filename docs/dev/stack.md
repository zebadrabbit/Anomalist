# Stack

Anomalist is a TypeScript monorepo with a small set of focused packages.

## Main parts

- `apps/server` handles authentication, state, Twitch integration, and socket events.
- `apps/dashboard` provides the browser-based control panel.
- `apps/overlay` renders the browser source that OBS loads.
- `packages/types` holds shared runtime types and socket event names.
- `packages/widget-sdk` provides the widget authoring surface.

For a broader data-flow view, see [Architecture Overview](/dev/architecture).
