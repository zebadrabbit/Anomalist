# What is Anomalist?

Anomalist is a free, self-hosted stream overlay control system for OBS. It gives you a live canvas editor, a full widget library, Twitch integration, and a permission system — all running on your own server.

Think of it as the open-source alternative to [Poltergeist](https://poltergeist.cc/), built for streamers who want control over their setup without a subscription or a third-party dependency.

## How it works

Anomalist runs as a small server on your machine (or a VPS). Your OBS browser source points at the overlay URL. Your dashboard — open in any browser — lets you add, move, and configure widgets in real time. Changes stream instantly to your overlay via WebSockets.

<img src="/screenshots/dashboard.png" alt="Dashboard overview" />

## What you can do

- **Build layouts visually** — drag, resize, rotate, and layer widgets on a canvas
- **Use built-in widgets** — text, images, timers, counters, marquees, clocks, shapes, soundboards, chat overlays, custom HTML
- **Connect Twitch** — get follow, subscribe, and raid alerts; run chatbot commands; manage your stream title and game
- **Control access** — give moderators exactly the permissions they need, nothing more
- **Save and restore scenes** — switch between preset layouts instantly

## Who is it for?

Anomalist is built for streamers who are comfortable with Docker and want to self-host, and for developers who want to extend the widget library. The dashboard is designed to be usable by non-technical moderators once the owner sets things up.

## Next steps

- [Install Anomalist](/guide/getting-started)
- [Run first-time setup](/guide/first-run)
- [Explore the widget library](/guide/widgets)
