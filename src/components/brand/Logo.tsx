import type { SVGProps } from "react";

/**
 * The ebb brand marks, as inline SVG so they inherit color and need no network
 * request. The letterforms use `currentColor` (set the text color of the parent
 * to recolor them); the trailing accent bar is always the brand violet.
 *
 * Masters live in `assets/brand/svg/`; keep these paths in sync if the brand
 * changes.
 */

const ACCENT = "#7c3aed";

/** Wordmark: "ebb" + accent bar. Letters follow `currentColor`. */
export function Wordmark({ "aria-label": ariaLabel = "ebb", ...props }: SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="8.76 -88.8 230.64 90"
            role="img"
            aria-label={ariaLabel}
            {...props}
        >
            <path
                fill="currentColor"
                d="M20.28-29.76L63.36-29.76L63.36-34.20C63.36-53.04 52.32-66 36.60-66C20.40-66 8.76-52.20 8.76-32.76C8.76-12.96 20.88 1.20 37.92 1.20C50.16 1.20 59.88-6.12 62.16-17.04L51.24-17.04C49.44-12 44.40-9 38.04-9C27.84-9 21.12-17.04 20.28-29.76ZM36.60-56.04C45.12-56.04 51.24-49.20 51.96-38.88L20.64-38.88C22.32-49.44 28.32-56.04 36.60-56.04ZM81.96 0L92.88 0L92.88-11.76L93.36-11.76C97.20-3.36 103.80 1.20 112.44 1.20C127.68 1.20 138.60-12.84 138.60-32.40C138.60-51.96 127.68-66 112.44-66C104.16-66 97.80-61.92 93.96-54.36L93.48-54.36L93.48-88.80L81.96-88.80ZM110.16-9.24C100.20-9.24 93.24-18.84 93.24-32.40C93.24-45.96 100.20-55.56 110.16-55.56C120.12-55.56 127.08-46.08 127.08-32.40C127.08-18.72 120.12-9.24 110.16-9.24ZM153.96 0L164.88 0L164.88-11.76L165.36-11.76C169.20-3.36 175.80 1.20 184.44 1.20C199.68 1.20 210.60-12.84 210.60-32.40C210.60-51.96 199.68-66 184.44-66C176.16-66 169.80-61.92 165.96-54.36L165.48-54.36L165.48-88.80L153.96-88.80ZM182.16-9.24C172.20-9.24 165.24-18.84 165.24-32.40C165.24-45.96 172.20-55.56 182.16-55.56C192.12-55.56 199.08-46.08 199.08-32.40C199.08-18.72 192.12-9.24 182.16-9.24Z"
            />
            <rect x="220.2" y="-88.8" width="19.2" height="88.8" rx="2.69" fill={ACCENT} />
        </svg>
    );
}

/** Monogram: "e" + accent bar on a dark rounded tile. Fixed colors. */
export function Monogram({ "aria-label": ariaLabel = "ebb", ...props }: SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            role="img"
            aria-label={ariaLabel}
            {...props}
        >
            <rect width="256" height="256" rx="56.32" fill="#18181b" />
            <path
                fill="#fafafa"
                d="M99.18 141.58L146.97 141.58L146.97 136.65C146.97 115.75 134.72 101.38 117.28 101.38C99.31 101.38 86.40 116.68 86.40 138.25C86.40 160.22 99.85 175.92 118.75 175.92C132.33 175.92 143.11 167.80 145.64 155.69L133.52 155.69C131.53 161.28 125.94 164.61 118.88 164.61C107.57 164.61 100.11 155.69 99.18 141.58ZM117.28 112.42C126.74 112.42 133.52 120.01 134.32 131.46L99.58 131.46C101.44 119.75 108.10 112.42 117.28 112.42Z"
            />
            <rect x="153.63" y="81.41" width="15.97" height="93.18" rx="4.79" fill={ACCENT} />
        </svg>
    );
}
