import type { SVGProps } from "react";

import { useWindowWidth } from "@/lib/hooks/useWindowWidth";

/**
 * The ebb brand marks, as inline SVG. Paths sourced verbatim from
 * assets/logo/svg/. Letters use `currentColor` so the parent's text color
 * controls them; the accent bar is always the brand violet.
 */

const ACCENT = "#7c3aed";

/** Wordmark: "ebb" + accent bar. Letters follow `currentColor`. */
export function Wordmark({ "aria-label": ariaLabel = "ebb", ...props }: SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="89 0 4007 1513"
            role="img"
            aria-label={ariaLabel}
            {...props}
        >
            <g transform="translate(0 1490) scale(1 -1)" fill="currentColor">
                <path d="M632 -23Q463 -23 341.5 48Q220 119 154.5 248Q89 377 89 552Q89 725 153.5 855Q218 985 336.5 1058.5Q455 1132 615 1132Q717 1132 809.5 1099Q902 1066 973.5 997Q1045 928 1085.5 821.5Q1126 715 1126 568L1126 486L212 486L212 663L997 663L875 611Q875 705 846 776.5Q817 848 759.5 888Q702 928 616 928Q530 928 470 887.5Q410 847 378.5 779.5Q347 712 347 629L347 507Q347 401 383 328Q419 255 484 218Q549 181 635 181Q692 181 738.5 197.5Q785 214 819 246.5Q853 279 870 326L1109 277Q1082 187 1017 119.5Q952 52 854.5 14.5Q757 -23 632 -23Z" />
                <path
                    transform="translate(1170.3182422947818 0)"
                    d="M728 -20Q633 -20 569 12.5Q505 45 467 91Q429 137 409 177L392 177L392 0L138 0L138 1490L398 1490L398 933L409 933Q429 973 466 1019Q503 1065 566.5 1098.5Q630 1132 729 1132Q859 1132 963 1066Q1067 1000 1128.5 871.5Q1190 743 1190 557Q1190 373 1130 244Q1070 115 965.5 47.5Q861 -20 728 -20ZM658 194Q745 194 804 241.5Q863 289 893 371.5Q923 454 923 558Q923 662 893.5 743.5Q864 825 805 871.5Q746 918 658 918Q572 918 513 873Q454 828 423.5 747.5Q393 667 393 558Q393 449 423.5 367Q454 285 513.5 239.5Q573 194 658 194Z"
                />
                <path
                    transform="translate(2407.8357522123897 0)"
                    d="M728 -20Q633 -20 569 12.5Q505 45 467 91Q429 137 409 177L392 177L392 0L138 0L138 1490L398 1490L398 933L409 933Q429 973 466 1019Q503 1065 566.5 1098.5Q630 1132 729 1132Q859 1132 963 1066Q1067 1000 1128.5 871.5Q1190 743 1190 557Q1190 373 1130 244Q1070 115 965.5 47.5Q861 -20 728 -20ZM658 194Q745 194 804 241.5Q863 289 893 371.5Q923 454 923 558Q923 662 893.5 743.5Q864 825 805 871.5Q746 918 658 918Q572 918 513 873Q454 828 423.5 747.5Q393 667 393 558Q393 449 423.5 367Q454 285 513.5 239.5Q573 194 658 194Z"
                />
            </g>
            <rect x="3768" y="0" width="328" height="1490" rx="82" fill={ACCENT} />
        </svg>
    );
}

/** Monogram: "e" on a white rounded tile. Fixed colors. */
export function Monogram({ "aria-label": ariaLabel = "ebb", ...props }: SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            role="img"
            aria-label={ariaLabel}
            {...props}
        >
            <rect width="256" height="256" rx="56.32" fill="#ffffff" />
            <path
                transform="translate(87.5 164.97) scale(0.0666650390625 -0.0666650390625)"
                fill={ACCENT}
                d="M632 -23Q463 -23 341.5 48Q220 119 154.5 248Q89 377 89 552Q89 725 153.5 855Q218 985 336.5 1058.5Q455 1132 615 1132Q717 1132 809.5 1099Q902 1066 973.5 997Q1045 928 1085.5 821.5Q1126 715 1126 568L1126 486L212 486L212 663L997 663L875 611Q875 705 846 776.5Q817 848 759.5 888Q702 928 616 928Q530 928 470 887.5Q410 847 378.5 779.5Q347 712 347 629L347 507Q347 401 383 328Q419 255 484 218Q549 181 635 181Q692 181 738.5 197.5Q785 214 819 246.5Q853 279 870 326L1109 277Q1082 187 1017 119.5Q952 52 854.5 14.5Q757 -23 632 -23Z"
            />
        </svg>
    );
}

/**
 * Responsive Logo component.
 * Shows Wordmark on larger screens, Monogram on narrow windows.
 * The Monogram uses h-6 with a subtle shadow to maintain visual presence
 * when the full wordmark would look cramped in a narrow window.
 */
export function Logo({
    "aria-label": ariaLabel = "ebb",
    className,
    ...props
}: SVGProps<SVGSVGElement>) {
    const width = useWindowWidth();
    // Use monogram when window is narrow
    const isNarrow = width > 0 && width < 900;

    // When narrow, use larger height (h-6) for monogram to maintain visual weight
    const narrowClassName = isNarrow ? `${className ?? ""} h-6` : className;

    return isNarrow ? (
        <Monogram aria-label={ariaLabel} className={narrowClassName} {...props} />
    ) : (
        <Wordmark aria-label={ariaLabel} className={className} {...props} />
    );
}

/** Inline monogram for narrow viewport use - just the "e" glyph.
 * Used when Monogram tile background is undesirable.
 * Follows currentColor so it inherits the text color and blends into the header.
 */
export function InlineMonogram({
    "aria-label": ariaLabel = "ebb",
    ...props
}: SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 320 380"
            role="img"
            aria-label={ariaLabel}
            {...props}
        >
            <path
                transform="translate(140 340) scale(0.025 -0.025)"
                fill="currentColor"
                d="M632 -23Q463 -23 341.5 48Q220 119 154.5 248Q89 377 89 552Q89 725 153.5 855Q218 985 336.5 1058.5Q455 1132 615 1132Q717 1132 809.5 1099Q902 1066 973.5 997Q1045 928 1085.5 821.5Q1126 715 1126 568L1126 486L212 486L212 663L997 663L875 611Q875 705 846 776.5Q817 848 759.5 888Q702 928 616 928Q530 928 470 887.5Q410 847 378.5 779.5Q347 712 347 629L347 507Q347 401 383 328Q419 255 484 218Q549 181 635 181Q692 181 738.5 197.5Q785 214 819 246.5Q853 279 870 326L1109 277Q1082 187 1017 119.5Q952 52 854.5 14.5Q757 -23 632 -23Z"
            />
        </svg>
    );
}
