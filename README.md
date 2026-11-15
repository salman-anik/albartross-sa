# Albartross SA

Albartross SA is a browser-based 3D flight and exploration game. Pilot an albatross over a procedurally generated archipelago, explore its islands and changing weather, and fly with an autonomous companion bird.

**Live demo:** [albartross-sa.vercel.app](https://albartross-sa.vercel.app)

## Features

- **Free flight:** steer, climb, dive, boost, and look around while the bird glides continuously.
- **Living archipelago:** generated islands, forests, flower meadows, mountain peaks, rivers, waterfalls, and changing coastlines.
- **Sky and weather:** a day and night cycle, clouds, sun, moon, stars, rain, snow, wind, and selectable weather presets.
- **Wildlife and scenery:** bird flocks, land animals, and animated stone heads and figures.
- **Companion bird:** a smaller albatross explores around the mini map, sometimes flies farther out, and eventually returns naturally. Its position appears on the map, and you can follow it manually. **Fly Together** has the companion fly in naturally, circle the player twice, then fly beside the player for one minute.
- **Flight color changes:** over five minutes of flight, the male bird's dark wing tips gradually turn blue with wing glow and sparkles, while the female bird gradually turns pink with body glow and sparkles. The effects follow each bird whichever one you control.
- **Choose your bird:** choose Male or Female while the world loads. The choice is saved on this device and can be changed in Settings. The companion is always the opposite gender. The male bird is slightly larger and its dark wings turn blue; the female bird changes from white to pink, whether she is the player or companion.
- **Rotating mini map:** shows nearby islands, rivers, waterfalls, the player, and the companion.
- **Sound:** a looping soundtrack and environmental effects, with separate music and SFX switches and an **M** mute shortcut.
- **Display settings:** choose Low, Medium, High, or Ultra graphics; optional low battery mode can lower resolution when frames slow, but never raises it above the selected preset. Music and SFX remain separate settings. Weather and daylight change automatically in the world. Fullscreen is available from the game screen.
- **Additional views:** use the in-game tabs to open the Field, Heads, Pillars, Obelisks, Trees, Albatross, and Scene pages.
- **Touch support:** swipe to steer and climb, and press and hold to boost.
- **Installable and offline-ready:** after four minutes of mobile flight, an install option appears. The browser menu can install the same app at any time. The service worker saves the app shell and game resources as they load, so after the first online play the installed game can launch without a connection.
- **Search-ready homepage:** descriptive page title and summary, canonical URL, Open Graph metadata, a `WebSite` structured-data entry, and crawlable `robots.txt` and `sitemap.xml` endpoints.

## Controls

| Input | Action |
| --- | --- |
| **A / D** or **Left / Right** | Turn |
| **W / Up** | Climb |
| **S / Down** | Dive |
| **Hold Space** | Boost |
| **Mouse drag** | Steer/look around, depending on the input area |
| **Mouse wheel** | Change camera distance |
| **Touch and drag** | Steer and climb |
| **Touch and hold** | Boost |
| **M** | Mute or unmute audio |

The bird keeps moving forward while flying. **Fly Together** is a manual companion action; she does not join automatically on a timer. Open **Settings** to change graphics quality and toggle music or sound effects. Weather and time of day continue changing automatically during flight.

On iPhone or iPad, use **Share → Add to Home Screen** to install. On Android, use **Install app** in the browser menu or the in-game install option after four minutes of flight.

## Run locally

### Requirements

- Node.js 20.9 or newer
- npm

### Development

```bash
npm install
npm run dev
```

On Windows, you can also run `start.bat` to start the development server and open the game in a browser.

### Production

```bash
npm run build
npm run start
```

## Project layout

- `app/page.js` mounts the existing game experience in the Next.js page.
- `app/layout.js` provides the page metadata, styles, and Three.js import map.
- `app/robots.js` and `app/sitemap.js` publish crawl rules and the canonical homepage URL for search engines.
- `public/albatross/` contains the game interface, Three.js world, models, shaders, sound files, fonts, mini map, and additional views.
- `public/sw.js` caches the app shell and same-origin game resources for offline launches.
- `public/app-icon.svg` is the installable app icon.
- `scripts/run-next.mjs` starts the local development server on an available port.
- `next.config.mjs` contains the Next.js configuration.
- `start.bat` is the Windows development launcher.

The app uses Next.js App Router, React, and Three.js. The game itself and its assets are served from `public/albatross/`.

## Credits

Inspired by [Anokhee Jandhyala](https://anokhee.dev) and recreated by [Salman Anik](https://salmananik.vercel.app/).
