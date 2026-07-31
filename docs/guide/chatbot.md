# Chatbot Commands

Once Twitch is connected, Anomalist can read your chat and let viewers drive
parts of the overlay directly.

## Enabling it

Connect Twitch first ([Connecting Twitch](/guide/twitch)), then turn the chatbot
on in **Settings**. The bot joins your channel and starts listening.

## Command prefix

Every command starts with a prefix, `!` by default. Change it in **Settings →
Chatbot prefix** if it collides with another bot in your channel — set it to
`?` and the commands below become `?sound` and `?counter`.

## `!sound <label>`

Plays a sound from the soundboard widget on the active scene.

```
!sound airhorn
```

Open to everyone in chat. A **5 second global cooldown** applies — see
[Soundboard](/guide/soundboard) for why it works that way.

If there is no soundboard on the current scene, or no sound matches the label,
the command is silently ignored.

## `!counter <label> +` / `!counter <label> -`

Increments or decrements a counter widget.

```
!counter deaths +
!counter deaths -
```

**Moderators only.** Unlike `!sound`, this changes persistent state that stays
on screen, so it is restricted to your mods and yourself.

The label matches the counter widget's label, case-insensitively.

## Chat feed widget

Separately from commands, the **Chat** widget renders your Twitch chat onto the
overlay, so you can show conversation on stream without a second service.
Messages older than two minutes are dropped from the feed automatically.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No commands respond | Chatbot disabled, or Twitch not connected |
| Commands respond with the wrong prefix | Another bot is using the same prefix — change yours |
| `!sound` does nothing | No soundboard widget on the *active* scene, or the label does not match |
| `!sound` works once then stops | The 5 second cooldown; wait and retry |
| `!counter` ignored | The sender is not a moderator |

## Next steps

- [Alerts](/guide/alerts)
- [Soundboard](/guide/soundboard)
