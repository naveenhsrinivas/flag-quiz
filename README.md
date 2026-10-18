# 🌍 Flag & Capital Quiz

A small browser game to practise country names, capitals and flags.

## Features

- Modes: Flag → Country, Country → Capital, Capital → Country, Find on Map, Mixed
- Find on Map: tap the named country on an interactive world map (drag, pinch or scroll to zoom); tiny countries get a dot so they're easy to tap
- Filter by region and choose the number of questions
- Score, streak and timer
- Review your mistakes and practise just those
- Best score saved in your browser
- Keyboard: press `1`–`4` to answer, `Enter` to confirm / go to the next question, `+` / `-` to zoom the map

## Tech

Written in TypeScript and bundled with [Vite](https://vite.dev).

```
src/
  data.ts    country list and types
  main.ts    quiz logic and UI
  map.ts     interactive world map (loaded only when a map game starts)
  map-ids.ts links country codes to shapes in the map data
  style.css
index.html
```

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev        # dev server with hot reload
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
npm run typecheck  # type-check only
```

## Host on GitHub Pages

A GitHub Actions workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) builds the site and publishes it on every push to `main`.

1. Push this repo to GitHub.
2. On GitHub, go to **Settings → Pages**.
3. Set **Source** to *GitHub Actions*.
4. The site goes live at `https://<your-username>.github.io/flag-quiz/`.

Flag images come from [flagcdn.com](https://flagcdn.com). Map shapes come from [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth) and are drawn with [d3](https://d3js.org).
