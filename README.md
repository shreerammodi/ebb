<div align="center">

<img src="public/logo.svg" alt="ebb" width="180" />

# ebb

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-7c3aed.svg)](https://www.mozilla.org/MPL/2.0/)

</div>

**ebb** is a modern, keyboard-first app for flowing competitive debate rounds.
All data lives on your machine, and ebb is open source under the [Mozilla
Public License 2.0](https://www.mozilla.org/MPL/2.0/).

## Getting started

Requires [Node.js](https://nodejs.org/) and npm.

```bash
npm install
npm run dev        # start the local web app at http://localhost:3000
```

### Desktop app

The desktop build (via [Tauri](https://tauri.app/)) is the preferred way to run
ebb.

```bash
npm run desktop:dev      # run the desktop app against a live dev server
npm run desktop:build    # produce a native installer in src-tauri/target
```

## Development

```bash
npm test           # run the test suite (Vitest)
npm run lint       # lint (ESLint)
npm run format     # format (oxfmt)
npm run build      # static production build to ./out
```
