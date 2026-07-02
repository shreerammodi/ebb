# Security review (2026-07-02)

Scope: full application audit covering the web build, the Tauri desktop shell,
the auto-updater, import/export IO, CI workflows, and dependencies, plus a
focused review of the pending branch changes (sheet drag-and-drop reordering).

## Summary

No high-severity, directly exploitable vulnerability was found in application
code. The app's local-first design (no backend, no accounts, no untrusted
cross-origin input at runtime) keeps the attack surface small. Three findings
warrant action, all with straightforward fixes.

## Findings

### 1. Desktop webview runs with CSP disabled

* Location: `src-tauri/tauri.conf.json` (`"app.security.csp": null`)
* Severity: Medium (defense in depth)
* Category: missing_csp / hardening
* Description: The Tauri window has no Content Security Policy. React's
  escaping makes injection unlikely today, but if any XSS ever lands in the
  webview (for example via a future rendering change or a compromised
  dependency), the injected script inherits the window's Tauri IPC access,
  including the `updater:default` and `process:default` capabilities
  (check/install updates, relaunch the app).
* Exploit scenario: a script-injection bug in the frontend escalates from
  "runs in a browser tab" to "drives the desktop app's IPC surface".
* Fix: set a strict CSP in `tauri.conf.json`. Tauri injects nonces/hashes for
  bundled assets automatically, so a tight policy works with the static
  export. Suggested starting point (`connect-src` covers the updater manifest
  and download endpoints):

  ```json
  "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://github.com https://objects.githubusercontent.com"
  }
  ```

  Verify the updater and the xlsx template fetch (`/templates/Flow.xlsx`,
  same-origin) still work after enabling it.

### 2. Vulnerable dev dependency: vite 8.0.15

* Location: `package-lock.json` (vite via vitest / @vitejs/plugin-react)
* Severity: Medium in practice (advisory is High, but dev-server only)
* Category: vulnerable_dependency
* Description: vite 8.0.0 to 8.0.15 carries two advisories:
  GHSA-v6wh-96g9-6wx3 (launch-editor NTLMv2 hash disclosure via UNC paths on
  Windows) and GHSA-fx2h-pf6j-xcff (`server.fs.deny` bypass on Windows
  alternate paths). Both require a running dev server and mostly affect
  Windows; production builds are unaffected.
* Fix: `npm audit fix` (patched vite is available in the 8.0.x line).

### 3. next 15.5.18 bundles a vulnerable postcss

* Location: `package-lock.json` (postcss 8.4.31 nested under next)
* Severity: Low (build-time only)
* Category: vulnerable_dependency
* Description: GHSA-qx2v-qp2m-jg93, XSS via unescaped `</style>` in PostCSS
  stringify output for postcss < 8.5.10. Only reachable if untrusted CSS is
  processed at build time, which this project does not do.
* Fix: upgrade `next` when a release depending on postcss >= 8.5.10 ships, or
  force the nested copy now with an override in `package.json`:

  ```json
  "overrides": { "next": { "postcss": "^8.5.10" } }
  ```

### 4. GitHub Actions pinned by tag, not commit SHA

* Location: `.github/workflows/deploy-web.yml` (and other workflows)
* Severity: Low (supply-chain hardening)
* Category: ci_hardening
* Description: `actions/checkout@v4`, `actions/setup-node@v4`,
  `actions/upload-pages-artifact@v3`, and `actions/deploy-pages@v4` are pinned
  to mutable major tags. A compromised tag would run attacker code with the
  workflow's `pages: write` and `id-token: write` permissions. The workflow's
  permissions block is otherwise least-privilege, which is good.
* Fix: pin each action to a full commit SHA (for example
  `actions/checkout@<sha> # v4`) and let Dependabot keep the pins current.

## Pending branch changes (sheet reordering)

Reviewed `Sidebar.tsx`, `sheets.ts`, and `useRoundStore.ts` from the current
branch. No vulnerabilities: the drag-and-drop feature manipulates only local
Zustand state with sheet IDs originating from the app itself, sheet titles
render through React text nodes (auto-escaped), and no new IO, network, or
serialization surface is introduced.

## Verified-safe areas (for future reference)

* **Round import** (`src/lib/persistence/io.ts`): untrusted `.json` files are
  parsed with `JSON.parse` (no eval/deserialization), shape-validated, version
  gated, normalized, and re-keyed with a fresh ID. Imported strings only ever
  render through React.
* **xlsx export** (`src/lib/export/xlsxParts.ts`, `xlsx.ts`): all user text is
  passed through `escXml` before interpolation into OOXML, and cells are
  written as `t="inlineStr"` (never formulas), so spreadsheet formula
  injection (`=cmd|...`) is not possible. There is no CSV export path.
* **Auto-updater** (`src/lib/update/`, `tauri.conf.json`): manifest fetched
  over HTTPS from GitHub Releases; download and install go through Tauri's
  updater, which verifies the Ed25519/minisign signature against the pinned
  `pubkey` and discards on mismatch. Release notes are treated as plain text.
* **Tauri capabilities** (`src-tauri/capabilities/default.json`): minimal set
  (core, window, webview, app, event, menu, updater, process). No filesystem,
  shell, or HTTP permissions are exposed to the webview, and the Rust shell
  registers no custom commands.
* **No hidden network calls**: the only runtime fetches are the updater
  manifest (desktop only) and the same-origin xlsx template. No telemetry,
  no dangerouslySetInnerHTML/eval/innerHTML anywhere in `src/`.
* **localStorage settings loaders** parse JSON defensively and ignore
  failures; data is same-origin only.
