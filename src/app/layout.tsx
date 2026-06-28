import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

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

const inter = localFont({
    src: [
        {
            path: "./fonts/inter/inter-latin-400-normal.woff2",
            weight: "400",
            style: "normal",
        },
        {
            path: "./fonts/inter/inter-latin-400-italic.woff2",
            weight: "400",
            style: "italic",
        },
        {
            path: "./fonts/inter/inter-latin-500-normal.woff2",
            weight: "500",
            style: "normal",
        },
        {
            path: "./fonts/inter/inter-latin-600-normal.woff2",
            weight: "600",
            style: "normal",
        },
        {
            path: "./fonts/inter/inter-latin-700-normal.woff2",
            weight: "700",
            style: "normal",
        },
    ],
    variable: "--font-inter",
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
            className={`${commitMono.variable} ${dmSans.variable} ${ibmPlexMono.variable} ${inter.variable}`}
        >
            <body className="font-sans antialiased">
                <TooltipProvider>{children}</TooltipProvider>
                <Toaster position="bottom-center" />
            </body>
        </html>
    );
}
