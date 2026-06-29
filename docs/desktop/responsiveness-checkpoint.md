# Responsiveness Checkpoint (Component 4 of the design)

The shell choice (Tauri / WKWebView) is responsiveness-driven. Before investing
further, validate input latency, typing, scroll smoothness, and cold start on a
real Mac. This is a manual checkpoint — it needs a GUI session.

## Run it

```bash
npm run desktop:dev     # tauri dev — launches the WKWebView shell against the dev server
```

For a closer-to-production feel (bundled static export, no dev overhead):

```bash
npm run desktop:build   # produces a .app/.dmg under src-tauri/target/release/bundle
```

## What to measure

| Metric              | How                                                              | Bar                                              |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Cold start          | Time from launch to interactive grid                            | Feels instant (sub-second to first paint)        |
| Typing latency      | Type rapidly in a grid cell; watch for lag between key and glyph | No perceptible lag                               |
| Scroll smoothness   | Scroll a long flow with many columns                            | No jank / dropped frames                         |
| Large flow handling | Open the biggest realistic round                                | Stays responsive                                 |

## Decision

- **Clears the bar →** proceed with Tauri (current path).
- **Underperforms →** pivot to Electron. Only the shell + updater wiring change;
  `src/lib/update/` policy logic is shell-agnostic and carries over unchanged.

Record the result here once measured.
