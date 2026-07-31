# Scenes

A scene is one arrangement of widgets on the canvas. Switching scenes swaps
everything the overlay is showing at once, so you can move between "starting
soon", "gameplay" and "be right back" without touching OBS.

## Switching scenes

Pick a scene from the scene bar above the canvas. The change reaches every
connected overlay immediately — OBS does not need to reload the browser source.

## Transitions

By default a scene change is an instant cut. You can soften it in
**Settings → Scene transition**:

| Transition | Effect |
|---|---|
| `cut` | Instant swap, no animation |
| `fade` | Cross-fade between scenes |
| `slide-left` | New scene slides in from the right |
| `slide-right` | New scene slides in from the left |

Duration is configurable between 100 ms and 2000 ms, defaulting to 400 ms. The
setting is global rather than per-scene.

## Presets

A preset is a saved snapshot of the whole canvas that you can restore later.
Presets are useful for seasonal layouts, per-game arrangements, or keeping a
known-good copy before you rearrange things.

- **Save preset** stores the current canvas under a name you choose.
- **Load preset** replaces the current canvas with the saved one.
- **Delete preset** removes it.

Loading a preset overwrites the live canvas for everyone, so it takes effect on
stream straight away.

::: warning
Presets require the `scene.manage` permission. Moderators do not have it by
default, so the preset list stays hidden for them rather than failing when they
click.
:::

## Layers

Widgets sit on named layers, and layers can be hidden as a group. Hiding a layer
hides its widgets on the overlay without deleting anything, which is handy for
toggling a whole cluster of alerts or decorations at once.

## Next steps

- [Canvas editor](/guide/canvas)
- [Widgets](/guide/widgets)
