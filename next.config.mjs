import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "export",
    // Emit `route/index.html` (not `route.html`) so Tauri's asset server can
    // resolve a hard load / reload of `/flow` and `/trash`. Without it those
    // routes 404 on any non-client navigation and WKWebView shows its native
    // "This page couldn't load" error (e.g. after an updater relaunch).
    trailingSlash: true,
    outputFileTracingRoot: __dirname,
    images: {
        unoptimized: true,
    },
};

export default nextConfig;
