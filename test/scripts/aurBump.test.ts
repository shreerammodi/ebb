import { describe, expect, it } from "vitest";

import { debName, rewritePkgbuild } from "../../scripts/aur-bump.mjs";

const PKGBUILD = [
    "# Maintainer: someone <someone@example.com>",
    "",
    "pkgname=ebb-bin",
    "pkgver=1.4.2",
    "pkgrel=1",
    'source=("https://example.com/v${pkgver}/ebb_${pkgver}_amd64.deb")',
    "sha256sums=('e7dde0f8')",
    "",
].join("\n");

describe("rewritePkgbuild", () => {
    it("moves the version and the checksum, and leaves the recipe alone", () => {
        const rewritten = rewritePkgbuild(PKGBUILD, { version: "1.5.0", sha256: "abc123" });

        expect(rewritten).toContain("pkgver=1.5.0\n");
        expect(rewritten).toContain("sha256sums=('abc123')\n");
        expect(rewritten).not.toContain("1.4.2");
        expect(rewritten).toContain("pkgrel=1\n");
        expect(rewritten).toContain(
            'source=("https://example.com/v${pkgver}/ebb_${pkgver}_amd64.deb")',
        );
    });

    it("resets pkgrel for a new version and keeps it for the same one", () => {
        const revised = PKGBUILD.replace("pkgrel=1", "pkgrel=3");

        expect(rewritePkgbuild(revised, { version: "1.5.0", sha256: "abc" })).toContain(
            "pkgrel=1\n",
        );
        expect(rewritePkgbuild(revised, { version: "1.4.2", sha256: "e7dde0f8" })).toContain(
            "pkgrel=3\n",
        );
    });

    it("refuses a PKGBUILD it cannot keep true", () => {
        const release = { version: "1.5.0", sha256: "abc" };

        expect(() => rewritePkgbuild("pkgname=ebb-bin\n", release)).toThrow(/pkgver/);
        expect(() => rewritePkgbuild("pkgver=1.4.2\n", release)).toThrow(/sha256sums/);
    });

    it("is unchanged by a re-run against the version it already names", () => {
        const rewritten = rewritePkgbuild(PKGBUILD, { version: "1.4.2", sha256: "e7dde0f8" });

        expect(rewritten).toBe(PKGBUILD);
    });
});

describe("debName", () => {
    it("names the asset the release publishes", () => {
        expect(debName("1.4.2")).toBe("ebb_1.4.2_amd64.deb");
    });
});
