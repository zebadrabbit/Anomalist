# Widget SDK

You can build custom widget types and contribute them to Anomalist. Each widget is a Svelte component pair: one for the canvas editor and one for the overlay renderer.

## Widget anatomy

A widget has two parts:

1. **Settings component** (`apps/dashboard/src/lib/widgets/[Type]Settings.svelte`) — the panel shown when the widget is selected in the editor
2. **Renderer component** (`apps/overlay/src/lib/widgets/[Type]Widget.svelte`) — what renders in the browser source

And a type definition in `packages/types/src/widgets.ts`.

## Adding a new widget type

### 1. Define the type

In `packages/types/src/widgets.ts`, add your widget to the `WidgetType` union and define its props interface:

```typescript
export type WidgetType = 
  | 'text' | 'image' | 'timer' // ... existing types
  | 'mywidget'                  // add yours here

export interface MyWidgetProps {
  myProp: string
  myNumber: number
}
```

Rebuild types after editing:
```bash
npm --workspace @anomalist/types run build
```

### 2. Register defaults

In `apps/server/src/canvas.ts`, add default props for your widget type to the `defaultProps` map:

```typescript
mywidget: {
  myProp: 'default value',
  myNumber: 42,
}
```

### 3. Build the settings component

Create `apps/dashboard/src/lib/widgets/MywidgetSettings.svelte`:

```svelte
<script lang="ts">
  import type { Widget } from '@anomalist/types'
  export let widget: Widget
  export let onUpdate: (props: Partial<Widget['props']>) => void
</script>

<label>
  My Prop
  <input
    type="text"
    value={widget.props.myProp}
    on:input={(e) => onUpdate({ myProp: e.currentTarget.value })}
  />
</label>
```

Then register it in `apps/dashboard/src/lib/WidgetSettings.svelte` — add a case to the widget type switch.

### 4. Build the renderer

Create `apps/overlay/src/lib/widgets/MywidgetWidget.svelte`:

```svelte
<script lang="ts">
  import type { Widget } from '@anomalist/types'
  export let widget: Widget
</script>

<div class="mywidget">
  {widget.props.myProp}
</div>
```

Register it in `apps/overlay/src/lib/WidgetRenderer.svelte`.

### 5. Add to the widget picker

In `apps/dashboard/src/lib/AddWidget.svelte`, add your widget to the list with a label and icon.

## Permissions

If your widget needs a specific permission to edit, use the `{#if hasPermission(...)}` pattern rather than `disabled` attributes. The server also enforces permissions on socket events — add a check in `server.ts` if your widget introduces new socket events.

## Submitting

Open a PR against `main`. Include a short demo GIF if possible. New widget types should ship with docs in `docs/guide/widgets.md`.
