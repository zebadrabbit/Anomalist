# Alerts

Anomalist subscribes to Twitch EventSub and can react on the overlay when
someone follows, subscribes or raids you.

## What is supported

| Event | Default duration |
|---|---|
| Follow | 3 seconds |
| Subscription | 5 seconds |
| Raid | 8 seconds |

## Configuring an alert

For each event you can set:

- **Sound** — a file from your [media library](/guide/media), played through the
  overlay when the event fires.
- **Widget** — a widget to reveal for the duration of the alert. Anything on the
  canvas works: a text banner, an image, a particle burst.
- **Duration** — how long the widget stays visible, in seconds.

Leaving a field empty simply skips that part, so you can have a sound with no
visual, or a visual with no sound.

## How it reaches the overlay

Alerts arrive over the same authenticated socket connection as everything else,
so they show up without a page reload and without polling. If the EventSub
connection drops, Anomalist reconnects on its own.

## Requirements

- Twitch must be connected — see [Connecting Twitch](/guide/twitch).
- Configuring alerts requires the `stream.manage` permission, which owners have
  by default. Editors and moderators do not.

## Testing without waiting for a real event

The simplest check is to trigger the pieces directly: play the alert's sound
from the [soundboard](/guide/soundboard), and toggle the alert widget's
visibility on the canvas. If both work, the alert will work — what EventSub adds
is only the trigger.

## Next steps

- [Connecting Twitch](/guide/twitch)
- [Chatbot commands](/guide/chatbot)
