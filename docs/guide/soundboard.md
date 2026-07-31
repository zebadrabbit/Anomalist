# Soundboard

The soundboard widget plays audio through the overlay, which means it comes out
of the same browser source OBS is already capturing. Nothing extra to route.

## Setting it up

1. Add a **Soundboard** widget to the canvas.
2. Upload your audio to the [media library](/guide/media).
3. In the widget's settings, add each sound with a label and pick its file.
4. Optionally set a per-sound volume between 0 and 1.

The label is what chat types, and what you click in the dashboard. If you leave
it blank, the filename without its extension is used instead.

## Playing sounds

- **From the dashboard** — click a sound in the widget's panel.
- **From chat** — viewers type `!sound <label>`.

Playing requires the `soundboard.play` permission, which owners, editors and
moderators all have.

## Chat cooldown

`!sound` is open to everyone in chat, not just moderators — viewer-triggered
sounds are the point of the feature. To stop one person holding the airhorn down
for the whole stream, there is a **5 second global cooldown**: after any sound
plays, further `!sound` requests are ignored until it expires.

The cooldown is global rather than per-viewer, because a per-viewer limit still
lets ten people take turns. A request that matches no sound does not start the
clock, so a typo will not block the next real request.

::: tip
The cooldown is not currently configurable. If you want the command restricted
to moderators instead, that is a code change rather than a setting — open an
issue describing your use case.
:::

## OBS audio

Because the sound plays inside the browser source, make sure OBS is capturing
audio from it: in the browser source properties, **Control audio via OBS** lets
you route and mix it like any other source. Without that, you will hear it
locally but your viewers will not.

## Next steps

- [Chatbot commands](/guide/chatbot)
- [Media library](/guide/media)
