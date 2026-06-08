# Twitch Integration

Twitch integration is optional, but it adds powerful live tools to Anomalist.

Once connected, you can:
- Let chat trigger sounds and counters
- Show automatic alerts for subs, follows, and raids
- Change stream title and category without leaving the dashboard

## The Chatbot

The chatbot lets your channel chat control parts of your overlay with simple commands.

Available commands:
- `!sound [name]`: any viewer can play a soundboard sound.
The name must match a sound you added in a Soundboard widget.
- `!counter [label] +/-`: moderators (and you) can increase or decrease a Counter widget.

How to enable:
1. Connect Twitch first.
2. Open Settings (gear icon).
3. In Twitch Integration, find Chatbot.
4. Click Enable Chatbot.

Tip: the chatbot uses your own Twitch account right now, so chat activity appears through your channel identity. A separate bot account flow may be added in a future version.

## Event Alerts

Event alerts let Anomalist react when viewers subscribe, follow, or raid.

For each event, Anomalist can:
- Play a sound
- Temporarily show a widget

How to set up:
1. Add a widget to your canvas for the alert (for example, a Text widget that says New sub!).
2. Hide it by default with the eye icon.
3. Open Settings (gear icon), then go to Twitch Integration -> Alerts.
4. Choose Sub, Follow, or Raid.
5. Enter:
- Sound URL (from your Media Library item URL)
- Widget ID (shown in that widget's settings)
- Duration in seconds
6. Click Save for that alert type.

The next time that event happens on Twitch, Anomalist will handle it automatically.

Note: alert widgets appear on the overlay output only. Your dashboard preview does not flash when alerts trigger.

## Stream Management

Stream management lets you update your live stream title and category directly from Anomalist.

Where to find it:
- Click the broadcast icon in the left sidebar.
- This is visible only to users who have stream management permission (owners by default).

How to use:
- Type a new title and click Update Title.
- Search for a game/category name.
- Click a search result.
- Click Set Category.

When Twitch is connected, changes are applied on Twitch right away.

Tip: owners can allow trusted editors to use this panel through User Management permissions.