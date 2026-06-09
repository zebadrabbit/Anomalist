# Widgets Guide

Widgets are the building blocks of your overlay. Add them in the dashboard, tune their settings, and push to live when you are happy with the result.

## Quick Workflow

1. Open the dashboard and connect with your owner token.
2. In Add Widget, choose Text, Image, Timer, Counter, Marquee, Clock, or Shape.
3. Click the widget in Staging Widgets to open its settings.
4. Adjust the settings and watch the preview update.
5. Click Push to Live to send the changes to your OBS overlay.
6. To remove a widget, select it and click Remove Widget.

## Fonts Across Text Widgets

Text, Timer, Counter, Marquee, and Clock widgets all include a Font picker.

How to use it:
1. Select your widget on the canvas.
2. Open its settings in the right panel.
3. Pick a font from the Font dropdown.
4. Check the preview line in the settings panel to see how it looks.

You do not need to install fonts yourself. Google Fonts are loaded automatically when you choose one.

## CSS Effects (Per Widget)

Most visual widgets support quick effects in the Effects panel:
- Glow: adds a soft colored light around the widget.
- Drop Shadow: adds depth and separation from the background.
- Text Outline: adds an edge around letters for readability.
- Gradient Text: fills text with a color gradient.

Important: Text Outline and Gradient Text cannot both be active at once. If Gradient Text is enabled, it takes priority.

Tip: try subtle values first, then increase until it reads well in your stream scene.

## Entrance Animations

Entrance animations play when you turn a widget visible.

Available styles include fade, slide directions, pop, and bounce.

How to set it:
1. Select a widget.
2. In settings, open the Animation section.
3. Choose the animation type.
4. Adjust duration.
5. Toggle the widget visible to preview.

These animations play in both the live overlay and the dashboard canvas preview.

## Text Widget

The Text widget shows words on screen, like alerts, instructions, or segment titles.

Use it when:
- You want a quick message such as "Be Right Back".
- You need a heading for a custom scene.

Settings include content, size, color, bold text, and optional background color.

## Image Widget

The Image widget displays an image from a URL.

Use it when:
- You want sponsor logos.
- You want a static frame, badge, or event graphic.

Settings include the image URL, opacity, and corner roundness.
If the URL is empty, the overlay shows a placeholder box.

## Timer Widget

The Timer widget can run as a countdown or a stopwatch.

Use it when:
- You run speedrun splits or challenge timers.
- You need giveaway countdowns.
- You want to track how long a segment has lasted.

You can switch mode, set countdown seconds, start, stop, reset, and style the timer text.

## Counter Widget

The Counter widget tracks a number and optional label.

Use it when:
- You count deaths, wins, attempts, or chat goals.
- You track daily progress during a long stream.

Use the + and - buttons to change the value by the step amount. Use Reset to return to zero.

## Marquee Widget

The Marquee widget scrolls text across the widget space, perfect for persistent announcements.

Great for scrolling sponsor names, social handles, or announcing a giveaway across the bottom of your stream.

You can edit content, direction, speed, size, text color, background color, and pause-on-hover behavior.

## Clock Widget

The Clock widget shows live time and keeps updating while your stream is live.

Show your local time or your viewers' timezone - useful for international communities.

You can switch 12h/24h format, enable or disable seconds, choose from built-in timezone options, and style text size, color, and weight.

## Shape Widget

The Shape widget renders a simple color block that can act as visual structure behind other widgets.

Use a dark rectangle as a backing bar behind your text for better readability.

Pick rectangle, circle, or pill styles and tune fill color, border color, opacity, and border width.

## Soundboard Widget

The Soundboard widget gives your moderators fast one-click sound triggers during a live show.

How to use it:
1. Add a Soundboard widget from the Add Widget list.
2. Select it, open settings, and click Add Sound.
3. Pick audio files from the media library (Audio tab).
4. Set friendly sound labels and per-sound volume.
5. Trigger sounds from the Soundboard grid in settings or from the persistent Sounds section in the sidebar.

OBS audio note:
When your overlay is loaded as a browser source, OBS captures these sound plays automatically from the browser source audio output.

## Chat Feed

The Chat Feed widget shows your live Twitch chat directly on the overlay.

It requires Twitch to be connected in Settings.

How to use it:
1. Add Chat Feed from the Add Widget list.
2. Resize and place it on your canvas like any other widget.
3. Open the widget settings and tune the display.

Settings:
- Max Messages: how many chat lines stay visible at once.
- Font Size: text size in pixels.
- Show Badges: show role labels next to names.
- Color by Username: use each chatter's Twitch name color.
- Background: widget background color (supports transparency).
- Message Timeout: remove messages after N seconds (`0` keeps them forever).

The Chat Feed only shows Twitch chat messages. It does not pull messages from other platforms.

## Particle Emitter Widget

The Particle Emitter widget creates animated particles inside the widget area.

Think of it like a visual effect layer you can place where you want motion.

Presets:
- Sparkles: light twinkling points.
- Snow: soft falling flakes.
- Confetti: colorful burst-style pieces.
- Fire: rising ember-like particles.

Controls:
- Speed: how fast particles move.
- Density: how many particles are on screen.
- Opacity: how transparent or solid particles look.

Tip: make the widget large and place it over the part of the screen you want covered.

## Custom HTML Widget

The Custom HTML widget lets you paste your own HTML, CSS, and JavaScript snippets into a widget-sized frame.

This is useful for:
- Custom animations you want to design yourself.
- Third-party widget snippets.
- Data tickers and other embedded mini-apps.

Safety model (plain language):
- Your code runs inside a sandboxed iframe, not in the dashboard itself.
- That frame cannot directly reach your dashboard session, cookies, or local storage.
- You should still only paste code you wrote yourself or fully trust.

Access:
- This widget is available to owner and editor roles only.
- Moderators cannot add Custom HTML widgets.

## Practical Tips

- Keep widgets in staging while you test placements and colors.
- Push to live only when everything looks right in OBS.
- If something is too large, lower font size or resize the widget in future layout tools.
