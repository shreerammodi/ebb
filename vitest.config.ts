import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./vitest.setup.ts"],
        // Nested git worktrees under .claude/ ship their own copies of the
        // suite (and their own node_modules → a second React), which otherwise
        // pollute a root `vitest run` with duplicate, failing tests.
        exclude: [...configDefaults.exclude, "**/.claude/**"],
    },
});
