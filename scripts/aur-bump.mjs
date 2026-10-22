#!/usr/bin/env node
// Points packaging/aur/ebb-bin at a published tag: pkgver, the sha256 of that
// release's .deb, and the .SRCINFO generated from the result. The AUR
// repository is a separate remote holding copies of the same three files; the
// copies here are the recipe, and this script is what keeps them describing a
// release that exists.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "packaging",
    "aur",
    "ebb-bin",
);
const repo = "shreerammodi/ebb";

/**
 * The asset name a release publishes for Linux x64.
 * @param {string} version
 * @returns {string}
 */
export function debName(version) {
    return `ebb_${version}_amd64.deb`;
}

/**
 * Rewrites the two lines that name a release and leaves the recipe alone.
 * A new version also resets pkgrel to 1, since pkgrel counts packaging
 * revisions of one upstream release; re-running against the version already
 * named keeps it. Throws when either line is gone, so a reshaped PKGBUILD
 * fails here instead of committing a version or checksum that describes no
 * download.
 * @param {string} text
 * @param {{ version: string, sha256: string }} release
 * @returns {string}
 */
export function rewritePkgbuild(text, { version, sha256 }) {
    if (!/^pkgver=/m.test(text)) throw new Error("PKGBUILD has no pkgver line");
    const current = text.match(/^pkgver=(.*)$/m)[1];
    let bumped = text.replace(/^pkgver=.*$/m, `pkgver=${version}`);
    if (current !== version) bumped = bumped.replace(/^pkgrel=.*$/m, "pkgrel=1");

    if (!/^sha256sums=\(/m.test(text)) throw new Error("PKGBUILD has no sha256sums line");
    const summed = bumped.replace(/^sha256sums=\(.*\)$/m, `sha256sums=('${sha256}')`);

    return summed;
}

async function main() {
    const version = (process.argv[2] ?? "").replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        console.error("usage: node scripts/aur-bump.mjs <version>    e.g. 1.4.3");
        process.exitCode = 1;
        return;
    }

    const url = `https://github.com/${repo}/releases/download/v${version}/${debName(version)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);

    // Hash the bytes rather than trusting a digest from the API: this is the
    // same file makepkg downloads, and the checksum it recomputes.
    const digest = await response.arrayBuffer();
    const sha256 = createHash("sha256").update(Buffer.from(digest)).digest("hex");

    const pkgbuildPath = join(packageDir, "PKGBUILD");
    const pkgbuild = readFileSync(pkgbuildPath, "utf8");
    writeFileSync(pkgbuildPath, rewritePkgbuild(pkgbuild, { version, sha256 }));

    try {
        const srcinfo = execFileSync("makepkg", ["--printsrcinfo"], {
            cwd: packageDir,
            encoding: "utf8",
        });
        writeFileSync(join(packageDir, ".SRCINFO"), srcinfo);
    } catch (error) {
        // Without makepkg the PKGBUILD is still correct; the .SRCINFO it should
        // have produced is what the AUR publishes, so leaving it stale is worth
        // saying out loud rather than failing the bump outright.
        if (error.code !== "ENOENT") {
            if (error.stderr) process.stderr.write(error.stderr);
            throw error;
        }
        console.warn(
            "makepkg is not on PATH, so .SRCINFO still names the old release; regenerate it on Arch before pushing",
        );
    }

    console.log(`ebb-bin ${version}: ${sha256}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
