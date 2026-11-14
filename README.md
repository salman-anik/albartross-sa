# Albartross-SA (Salman Anik Version)

A Next.js App Router edition of the 3D **Albatross** flight & island exploration experience, built with Three.js, React 19, and Next.js 16.

## Features

- **Next.js App Router** (`app/page.js`, `app/layout.js`) mounting the interactive Three.js world
- **Self-contained assets** in `public/albatross/` (Three.js, fonts, ambient & reactive audio, shaders/modules)
- **Dynamic world**: islands with forests, tulip gardens, rivers, waterfalls, drifting clouds, sunset lighting, flocking birds, and land wildlife with independent activity states
- **Settings**: weather, time of day, audio, and graphics quality options

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
