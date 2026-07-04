/**
 * Generates every app icon from the brand mark: the lowercase "e" alone,
 * matching the Monogram in src/components/brand/Logo.tsx (the caret appears
 * only in the wordmark). Geometry constants below are shared with that file;
 * change them together.
 *
 * Outputs:
 *   src/app/icon.svg            favicon (dark tile, dark-theme violet marks)
 *   src/app/apple-icon.png      180px  (white tile, brand violet marks)
 *   public/icons/icon-512.png   512px
 *   public/icons/icon-1024.png  1024px (also the master for `tauri icon`)
 *
 * Run via `npm run icons`, which follows up with `tauri icon` to fan the
 * master out into src-tauri/icons/.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const E_PATH =
    "M632 -23Q463 -23 341.5 48Q220 119 154.5 248Q89 377 89 552Q89 725 153.5 855Q218 985 336.5 1058.5Q455 1132 615 1132Q717 1132 809.5 1099Q902 1066 973.5 997Q1045 928 1085.5 821.5Q1126 715 1126 568L1126 486L212 486L212 663L997 663L875 611Q875 705 846 776.5Q817 848 759.5 888Q702 928 616 928Q530 928 470 887.5Q410 847 378.5 779.5Q347 712 347 629L347 507Q347 401 383 328Q419 255 484 218Q549 181 635 181Q692 181 738.5 197.5Q785 214 819 246.5Q853 279 870 326L1109 277Q1082 187 1017 119.5Q952 52 854.5 14.5Q757 -23 632 -23Z";

// Glyph extents in font units (y-up), from Logo.tsx.
const E_LEFT = 89;
const E_RIGHT = 1126;
const E_TOP = 1132;
const E_BOTTOM = -23;

const MARK_W = E_RIGHT - E_LEFT;
const MARK_H = E_TOP - E_BOTTOM;

const r2 = (n) => Math.round(n * 100) / 100;
const r5 = (n) => Math.round(n * 100000) / 100000;

/**
 * One tile icon: rounded-square tile with the mark centered on it.
 * `markFrac` is the fraction of the tile width the mark spans.
 */
function tileSvg({ size, tileFill, tileRx, markFill, markFrac }) {
    const s = (size * markFrac) / MARK_W;
    const x0 = (size - MARK_W * s) / 2;
    const yTop = (size - MARK_H * s) / 2;
    const baseline = yTop + E_TOP * s;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="ebb">
<rect width="${size}" height="${size}" rx="${r2(tileRx)}" fill="${tileFill}"/>
<path transform="translate(${r2(x0 - E_LEFT * s)} ${r2(baseline)}) scale(${r5(s)} ${r5(-s)})" fill="${markFill}" d="${E_PATH}"/>
</svg>
`;
}

// Favicon: dark tile, dark-theme selection violet so it reads in browser chrome.
writeFileSync(
    path.join(root, "src/app/icon.svg"),
    tileSvg({ size: 64, tileFill: "#18181b", tileRx: 16, markFill: "#a78bfa", markFrac: 0.58 }),
);

// Raster icons: white tile, brand violet (matches the Monogram in Logo.tsx).
const master = tileSvg({
    size: 1024,
    tileFill: "#ffffff",
    tileRx: 0,
    markFill: "#7c3aed",
    markFrac: 0.52,
});

const targets = [
    { file: "public/icons/icon-1024.png", px: 1024 },
    { file: "public/icons/icon-512.png", px: 512 },
    { file: "src/app/apple-icon.png", px: 180 },
];

await Promise.all(
    targets.map(({ file, px }) =>
        sharp(Buffer.from(master)).resize(px, px).png().toFile(path.join(root, file)),
    ),
);

console.log("wrote src/app/icon.svg +", targets.map((t) => t.file).join(", "));
