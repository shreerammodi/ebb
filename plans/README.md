# Animation improvement plans

Produced by an improve-animations audit at commit 6dc4cbdfaad9 (2026-07-16),
under the agreed design register: crisp keyboard-first instrument
(Linear/Raycast family), one motion vocabulary, speed is respect.

Each plan is self-contained: exact current code, exact target values, steps,
boundaries, and a feel check. Execute with any agent; if quoted code has
drifted, the executor must stop and report rather than improvise.

## Plans

| # | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Retune the Radix surfaces (curve, budgets, asymmetric exits, reduced motion) | HIGH | TODO |
| 002 | Open the search palette instantly | HIGH | TODO |
| 003 | Critically damp the update chip entrance | LOW | TODO |
| 004 | Tighten the dashboard grouped/flat view swap | LOW | TODO |
| 005 | One scrim token for every overlay | LOW | TODO |
| 006 | Flash the landing cell after a search-palette jump | MEDIUM | TODO |

## Execution order and dependencies

1. **001** first - it defines the `ease-out-quart` Tailwind token and rewrites
   the class strings that 002 and 005 build on.
2. **002** and **005** next, in either order (both quote post-001 dialog.tsx /
   sheet.tsx code).
3. **003**, **004**, **006** are independent and can run any time, in parallel.

## Deliberately not planned

- Sidebar, InfoPanel, RfdDrawer, SettingsPanel mount with no animation. That is
  correct for keyboard-toggled panels in this app; do not add motion there.
- Dashboard card filter/reorder animations (`layout` + `popLayout`) are already
  right; leave them.
- Card entrance stagger on the dashboard was considered and rejected: the
  dashboard is a daily surface, and the crisp register favors instant presence.
- Handsontable grid interior (typing, selection movement) must never animate:
  it is the paper, and it is on the critical flowing path.
