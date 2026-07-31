# Widget Types

Every widget shares the same envelope and differs only in `type` and `props`.

## The shared shape

```ts
interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  locked?: boolean;
  createdBy?: string;
  layerId: string;
  props: Record<string, unknown>;
}
```

Geometry, visibility, locking and layering are handled by the canvas for every
type. A widget implementation only cares about `props`.

## Built-in types

| Type | Renders |
|---|---|
| `text` | Styled static text |
| `image` | An image from the media library |
| `timer` | Count up or down |
| `counter` | A labelled number, drivable from chat |
| `marquee` | Scrolling text |
| `clock` | Current time |
| `shape` | Rectangles, circles and similar |
| `soundboard` | Triggerable sounds |
| `chat` | Live Twitch chat feed |
| `particle` | Particle effects |
| `custom-html` | Arbitrary markup in a sandboxed iframe |

## Where the two halves live

Each type has a settings panel in the dashboard and a renderer in the overlay:

```
apps/dashboard/src/lib/widgets/<Name>Settings.svelte   # editing props
apps/overlay/src/lib/widgets/<Name>Widget.svelte       # drawing it
```

The dashboard writes `props`, the server persists and broadcasts, the overlay
renders. Neither half imports the other.

## `custom-html` is the sharp one

It renders operator-supplied markup in an iframe sandboxed with
`allow-scripts` — and deliberately **not** `allow-same-origin`. Granting both
together is the documented way to defeat the sandbox entirely: the frame can
reach back into the parent origin, read session state and call the API.

Only owners and editors may add one. Moderators are refused, and that check reads
the user's current role rather than the role they had when they connected.

## Adding a type

1. Add it to the dashboard's `WidgetType` union.
2. Create `<Name>Settings.svelte` for editing its props.
3. Create `<Name>Widget.svelte` to render it, and branch to it in the overlay's
   scene layer.
4. Give it sensible defaults so a freshly added widget looks like something.

Community widgets should target `@anomalist/widget-sdk` instead — see
[Building Widgets](/dev/widget-sdk).

## Next steps

- [Building widgets](/dev/widget-sdk)
- [Permissions](/dev/permissions)
