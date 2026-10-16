# 🌍 Flag & Capital Quiz

A small browser game to practise country names, capitals and flags.

## Features

- Modes: Flag → Country, Country → Capital, Capital → Country, Mixed
- Filter by region and choose the number of questions
- Score, streak and timer
- Review your mistakes and practise just those
- Best score saved in your browser
- Keyboard: press `1`–`4` to answer and `Enter` for the next question

## Tech

Written in TypeScript and bundled with [Vite](https://vite.dev).

```
src/
  data.ts    country list and types
  main.ts    quiz logic and UI
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

Flag images come from [flagcdn.com](https://flagcdn.com).
