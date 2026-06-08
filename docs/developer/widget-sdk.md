# Widget SDK Guide

This guide shows how to add a new widget to Anomalist.

## WidgetDefinition

Use the WidgetDefinition interface from @anomalist/widget-sdk:

- id: unique widget type string.
- name: display name.
- defaultProps: default settings object.
- renderUrl: URL path used by overlay rendering.
- settingsSchema: optional JSON Schema for future UI generation.

## Built-in Widget Types

| Type ID | Display Name |
| --- | --- |
| `text` | Text |
| `image` | Image |
| `timer` | Timer |
| `counter` | Counter |
| `marquee` | Marquee |
| `clock` | Clock |
| `shape` | Shape |
| `soundboard` | Soundboard |
| `chat` | Chat Feed |
| `custom-html` | Custom HTML |

## Add A Widget

1. Create an overlay renderer component in apps/overlay/src/lib/widgets.
2. Create a dashboard settings component in apps/dashboard/src/lib/widgets.
3. Register the widget in packages/widget-sdk/src/widgets with registerWidget.
4. Wire the new type into dashboard add-widget controls and overlay component routing.

## Minimal Registration Example

```ts
import { registerWidget, type WidgetDefinition } from "@anomalist/widget-sdk";

const myWidget: WidgetDefinition = {
  id: "my-widget",
  name: "My Widget",
  defaultProps: {
    message: "Hello"
  },
  renderUrl: "/widgets/my-widget"
};

registerWidget(myWidget);
```

## Overlay Renderer Notes

- Accept a single Widget prop.
- Read widget.props safely with fallbacks.
- Use inline styles for position and size based on widget.x, y, width, height.
- Keep rendering pure; client-side timers/animations are okay when needed.
- Some widgets are dashboard-only controls and intentionally render nothing on overlay.
- For these overlay-invisible widgets, keep an empty renderer component so routing stays consistent.

## Dashboard Settings Notes

- Accept a single Widget prop.
- Emit WIDGET_UPDATE immediately when fields change.
- Keep controls simple and task-focused.

## Socket Events

- `chat:message`: emitted by server for each Twitch chat message.
Payload shape:
`{ id, username, color, message, badges, timestamp }`
- `twitch:alert`: emitted by server when an EventSub event resolves to an alert action.
Payload shape:
`{ type, user, viewers?, soundUrl, widgetId, duration }`

## Submitting A PR

1. Add your files under the widget folders and widgets/ if you include external assets.
2. Run npm run typecheck from the repository root.
3. Include a short demo note in your PR.
4. Keep the PR focused on one widget or one related feature.
