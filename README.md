# Albartross-SA (Salman Anik Version)

A Next.js App Router edition of the 3D **Albatross** flight & island exploration experience, built with Three.js, React 19, and Next.js 16.

**Live Demo:** https://albartross-sa.vercel.app

## Features

- **Next.js App Router** (`app/page.js`, `app/layout.js`) mounting the interactive Three.js world
- **Self-contained assets** in `public/albatross/` (Three.js, fonts, ambient & reactive audio, shaders/modules)
- **Dynamic world**: islands with dense forests, tulip gardens, rivers, waterfalls, high-altitude clouds, sunset & moonlit lighting, large bird flocks, companion birds, and land wildlife herds
- **Relaxation audio**: looped 5-minute relaxing soundtrack with danger/harsh SFX disabled
- **Mobile-ready controls**: swipe steering, touch-and-hold speed boost, and compact bottom-left mini-map

## Upgrades from Original (Albartross-SA)

| Area | Original | Albartross-SA | Upgrade |
| :--- | :--- | :--- | :--- |
| **Platform & Hosting** | Static local HTML/JS | Next.js 16 App Router + Vercel | Full-stack web app |
| **Active Birds (`SkyFlocks`)** | 20 birds (20 flocks) | 96 birds (25 flocks) + Companion Bird (every 5m for 20s) | **+380%** birds |
| **Active Land Animals (`LandLife`)** | 12 active (2–6 / island) | 60 active (8–17 / island) with herd walking | **+400%** active |
| **Forest & Trees (`WOOD`)** | 18–36 / island (3–8 / clump) | 42–78 / island (5–11 / clump) | **+122%** trees |
| **Garden Creeps & Flowers (`MEADOW`)** | 1,350–1,650 / clearing | 2,000–2,400 / clearing | **+47%** density |
| **Cloud Altitude & Climb Pitch** | `-22..+21` relative, `0.45` rad | `52..100` sky altitude, `0.72` rad climb | **+60%** climb angle |
| **Long-Distance Visibility** | `SIGHT 120`, fog `18–96` | `SIGHT 150`, fog `82.5–202.5`, brighter night/twilight | **+111%** view range |
| **Weather Cycle Timer** | 15–45s (~30s avg) | 120s (2 minutes) | **+300%** duration |
| **Music & Relaxation Audio** | Default `bgm.mp3` (`0.3` gain), thunder/stone SFX on | Custom looped relaxing YouTube track (`0.85` gain), danger SFX off | **+183%** music gain |
| **Mobile Controls & HUD** | Desktop-first HUD | Touch-and-hold boost (`1.7×`), `55px` swipe reach, compact bottom-left mini-map, icon-only Settings | Mobile-optimized |

## Requirements

- Node.js 20.9 or newer and npm

## Getting Started

```bash
npm install
npm run dev
```

Or on Windows, double-click `start.bat` to automatically pick a free port, start Next.js, and open the game in your default browser.

### Production Build

```bash
npm run build
npm run start
```

## Controls

- **WASD** or **Arrow Keys**: steer, climb, and dive
- **Space** (hold): fly faster
- **Mouse drag**: look around
- **Mouse wheel**: adjust camera distance
- **M**: mute / unmute audio
- **P**: toggle performance stats in the browser console

## Project Structure

- `app/page.js` & `app/layout.js` — Next.js App Router entry point and layout
- `public/albatross/` — Three.js game engine, modules, fonts, sounds, and assets
- `scripts/run-next.mjs` — local launcher with free-port selection
- `next.config.mjs` — Next.js configuration
- `start.bat` — Windows quick launcher
