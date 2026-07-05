/**
 * Propagates the version npm just wrote into package.json out to the two
 * sibling manifests that carry their own copy: the Tauri config and the Rust
 * crate (plus its lockfile). Run by the `version` npm lifecycle hook, so the
 * files it edits are staged into the same release commit npm creates.
 *
 * Targeted string replacements, not JSON/TOML rewrites, to preserve each
 * file's existing formatting.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;

// Replace the first `"version": "..."` (Tauri) and `version = "..."` (Cargo);
// in both files the app version is the first such key.
const edits = [
    ["src-tauri/tauri.conf.json", /"version":\s*"[^"]*"/, `"version": "${version}"`],
    ["src-tauri/Cargo.toml", /version = "[^"]*"/, `version = "${version}"`],
];
for (const [rel, pattern, replacement] of edits) {
    const file = path.join(root, rel);
    const before = readFileSync(file, "utf8");
    const after = before.replace(pattern, replacement);
    if (after === before) throw new Error(`no version field matched in ${rel}`);
    writeFileSync(file, after);
}

// Keep Cargo.lock in step with the bumped crate version.
execFileSync("cargo", ["update", "-p", "ebb", "--manifest-path", "src-tauri/Cargo.toml"], {
    cwd: root,
    stdio: "inherit",
});
