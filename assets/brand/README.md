# ebb / brand assets

Source-of-truth design files for the **ebb** brand (the product otherwise
described as "Debate Flow"). These files are **not** served by the app; they are
the masters from which the shipped assets are derived. Edit here, then propagate.

## Palette

| Token       | Hex       | Use                                  |
| ----------- | --------- | ------------------------------------ |
| Ink         | `#18181b` | Wordmark / monogram letterform       |
| Paper       | `#fafafa` | Letterform on dark tiles             |
| Accent      | `#7c3aed` | The trailing bar (also `--color-sel`)|
| Accent soft | `#a78bfa` | Accent on dark backgrounds (favicon) |

## Typography

- **Display / UI:** Commit Mono. The whole app renders in it. The full weight
  set (200–700, normal + italic) is self-hosted at
  `src/app/fonts/commit-mono/` and wired through `--font-commit-mono` in
  `src/app/layout.tsx`. Do not re-add a partial copy here.

## Files

```
svg/
  ebb-wordmark.svg       wordmark, ink letters + accent bar (light backgrounds)
  ebb-wordmark-dark.svg  wordmark for dark backgrounds
  ebb-monogram.svg       app-icon "e" + accent bar on a dark rounded tile
  ebb-favicon.svg        favicon variant (soft accent letterform)
png/
  ebb-lockup-ink.png     full lockup raster
  ebb-wordmark-*.png     wordmark rasters (ink / paper)
  icon-{180,512,1024}.png app-icon rasters
  favicon-{16,32,48}.png  favicon rasters
```

## Where the shipped assets live

| Shipped asset            | Derived from              | Purpose                          |
| ------------------------ | ------------------------- | -------------------------------- |
| `src/app/icon.svg`       | `svg/ebb-favicon.svg`     | Browser tab favicon (scalable)   |
| `src/app/apple-icon.png` | `png/icon-180.png`        | iOS home-screen icon             |
| `public/icons/icon-*.png`| `png/icon-{512,1024}.png` | PWA manifest icons               |
| `src/components/brand/`  | `svg/ebb-wordmark*.svg`   | In-app wordmark / monogram (TSX) |
