import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";

import ConfigFileSync from "@/components/ConfigFileSync";
import { DesktopMenu } from "@/components/DesktopMenu";
import SettingsPanel from "@/components/settings/SettingsPanel";
import ThemeSync from "@/components/ThemeSync";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateProvider } from "@/components/update/UpdateProvider";

import "./globals.css";

// Applies the persisted theme before first paint so there's no flash of the
// wrong appearance. Kept in sync afterward by <ThemeSync>. This app is a
// static export with no per-request server render, so a synchronous inline
// script is the only way to beat first paint.
const NO_FLASH_THEME_SCRIPT = `
(function () {
    try {
        var raw = localStorage.getItem("ebb-display-settings");
        var theme = raw ? JSON.parse(raw).theme : "system";
        var dark =
            theme === "dark" ||
            (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
        if (dark) document.documentElement.classList.add("dark");
    } catch (e) {}
})();
`;

const commitMono = localFont({
    src: [
        {
            path: "./fonts/commit-mono/commit-mono-latin-200-normal.woff2",
            weight: "200",
            style: "normal",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-200-italic.woff2",
            weight: "200",
            style: "italic",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-300-normal.woff2",
            weight: "300",
            style: "normal",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-300-italic.woff2",
            weight: "300",
            style: "italic",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-400-normal.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-400-italic.woff2",
            weight: "400",
            style: "italic",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-500-normal.woff2",
            weight: "500",
            style: "normal",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-500-italic.woff2",
            weight: "500",
            style: "italic",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-600-normal.woff2",
            weight: "600",
            style: "normal",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-600-italic.woff2",
            weight: "600",
            style: "italic",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-700-normal.woff2",
            weight: "700",
            style: "normal",
        },
        {
            path: "./fonts/commit-mono/commit-mono-latin-700-italic.woff2",
            weight: "700",
            style: "italic",
        },
    ],
    variable: "--font-commit-mono",
    display: "swap",
});

const dmSans = localFont({
    src: [
        {
            path: "./fonts/dm-sans/dm-sans-latin-400-normal.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/dm-sans/dm-sans-latin-400-italic.woff2",
            weight: "400",
            style: "italic",
        },
        {
            path: "./fonts/dm-sans/dm-sans-latin-500-normal.woff2",
            weight: "500",
            style: "normal",
        },
        {
            path: "./fonts/dm-sans/dm-sans-latin-600-normal.woff2",
            weight: "600",
            style: "normal",
        },
        {
            path: "./fonts/dm-sans/dm-sans-latin-700-normal.woff2",
            weight: "700",
            style: "normal",
        },
    ],
    variable: "--font-dm-sans",
    display: "swap",
});

const ibmPlexSans = localFont({
    src: [
        {
            path: "./fonts/ibm-plex-sans/ibm-plex-sans-400-normal.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/ibm-plex-sans/ibm-plex-sans-400-italic.woff2",
            weight: "400",
            style: "italic",
        },
        {
            path: "./fonts/ibm-plex-sans/ibm-plex-sans-500-normal.woff2",
            weight: "500",
            style: "normal",
        },
        {
            path: "./fonts/ibm-plex-sans/ibm-plex-sans-600-normal.woff2",
            weight: "600",
            style: "normal",
        },
        {
            path: "./fonts/ibm-plex-sans/ibm-plex-sans-700-normal.woff2",
            weight: "700",
            style: "normal",
        },
    ],
    variable: "--font-ibm-plex-sans",
    display: "swap",
});

const ibmPlexMono = localFont({
    src: [
        {
            path: "./fonts/ibm-plex-mono/ibm-plex-mono-latin-400-normal.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/ibm-plex-mono/ibm-plex-mono-latin-400-italic.woff2",
            weight: "400",
            style: "italic",
        },
        {
            path: "./fonts/ibm-plex-mono/ibm-plex-mono-latin-500-normal.woff2",
            weight: "500",
            style: "normal",
        },
        {
            path: "./fonts/ibm-plex-mono/ibm-plex-mono-latin-600-normal.woff2",
            weight: "600",
            style: "normal",
        },
        {
            path: "./fonts/ibm-plex-mono/ibm-plex-mono-latin-700-normal.woff2",
            weight: "700",
            style: "normal",
        },
    ],
    variable: "--font-ibm-plex-mono",
    display: "swap",
});

const cabin = localFont({
    src: [
        {
            path: "./fonts/cabin/cabin-latin-400-normal.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/cabin/cabin-latin-400-italic.woff2",
            weight: "400",
            style: "italic",
        },
        {
            path: "./fonts/cabin/cabin-latin-500-normal.woff2",
            weight: "500",
            style: "normal",
        },
        {
            path: "./fonts/cabin/cabin-latin-600-normal.woff2",
            weight: "600",
            style: "normal",
        },
        {
            path: "./fonts/cabin/cabin-latin-700-normal.woff2",
            weight: "700",
            style: "normal",
        },
    ],
    variable: "--font-cabin",
    display: "swap",
});

const lato = localFont({
    src: [
        {
            path: "./fonts/lato/lato-latin-400-normal.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/lato/lato-latin-400-italic.woff2",
            weight: "400",
            style: "italic",
        },
        {
            path: "./fonts/lato/lato-latin-700-normal.woff2",
            weight: "700",
            style: "normal",
        },
    ],
    variable: "--font-lato",
    display: "swap",
});

const openSans = localFont({
    src: [
        {
            path: "./fonts/open-sans/open-sans-latin-400-normal.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/open-sans/open-sans-latin-400-italic.woff2",
            weight: "400",
            style: "italic",
        },
        {
            path: "./fonts/open-sans/open-sans-latin-500-normal.woff2",
            weight: "500",
            style: "normal",
        },
        {
            path: "./fonts/open-sans/open-sans-latin-600-normal.woff2",
            weight: "600",
            style: "normal",
        },
        {
            path: "./fonts/open-sans/open-sans-latin-700-normal.woff2",
            weight: "700",
            style: "normal",
        },
    ],
    variable: "--font-open-sans",
    display: "swap",
});

export const metadata: Metadata = {
    title: {
        default: "ebb",
        template: "%s · ebb",
    },
    description:
        "A local-first, privacy-centric, keyboard-first app for flowing competitive debate rounds.",
    applicationName: "ebb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html
            lang="en"
            className={`${commitMono.variable} ${dmSans.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} ${cabin.variable} ${lato.variable} ${openSans.variable}`}
            suppressHydrationWarning
        >
            <head>
                <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
            </head>
            <body className="font-sans antialiased">
                <DesktopMenu />
                <ThemeSync />
                <ConfigFileSync />
                <TooltipProvider>
                    <UpdateProvider>
                        {children}
                        {/* Inside UpdateProvider so the Updates settings pane can
                            read the update context, and mounted here (not per
                            screen) so the settings chord works on the dashboard
                            and trash as well as in a flow. */}
                        <SettingsPanel />
                    </UpdateProvider>
                </TooltipProvider>
                <Toaster position="bottom-center" />
            </body>
        </html>
    );
}
