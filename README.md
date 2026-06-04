# Debate Flow

A local-first, keyboard-first web app for flowing competitive debate rounds (Policy and LD). No
accounts. All data stays on your device.

## Features

- **Elastic flow grid** — arguments arranged as clash threads; parent spans its answers
- **Vim/Excel/Basic keymaps** — fully remappable; modal normal/insert model
- **Auto-numbered responses** — sibling numbering with break-point overrides
- **Drop detection** — highlights arguments with no answer in the next opposing speech
- **Status marks** — conceded (green) and extended (green) annotations
- **Timers** — speech countdown and per-side prep clocks
- **Quick switcher** — ⌘K fuzzy sheet picker
- **Keymap settings** — per-command chord override, persisted to localStorage
- **Export / Import** — round-trip JSON files
- **Print / PDF** — clean `window.print()` layout
- **Autosave** — debounced IndexedDB persistence via Dexie; last round restored on reload

## Getting started

```bash
npm install
npm run dev       # development server at http://localhost:3000
npm run build     # production static export → out/
npm test          # run tests (vitest)
npm run test:watch
```

## Default keybindings (Vim)

| Key            | Action                                        |
| -------------- | --------------------------------------------- |
| `h j k l`      | Move selection left / down / up / right       |
| `i` or `Enter` | Edit (insert mode)                            |
| `Escape`       | Exit insert mode                              |
| `o`            | Add answer (sibling under same parent)        |
| `a`            | Answer across (child in next opposing speech) |
| `O`            | New root argument                             |
| `x`            | Delete node                                   |
| `c` / `e`      | Toggle conceded / extended                    |
| `s`            | Toggle speech timer                           |
| `p` / `P`      | Toggle Aff / Neg prep                         |
| `]` / `[`      | Next / prev sheet                             |
| `⌘K`           | Quick switcher                                |
| `⌘N`           | New sheet                                     |
| `⌘,`           | Keymap settings                               |
| `⌘1–9`         | Jump to sheet 1–9                             |

## Design constraints

- **Reserved colors**: blue = Aff, red = Neg, only ever for sides. Selection = violet, drop = amber,
  conceded/extended = green.
- **Light mode only**.
- **Local-first**: IndexedDB + localStorage only, no network requests.
