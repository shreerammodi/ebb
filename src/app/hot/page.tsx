"use client";

import dynamic from "next/dynamic";

// Handsontable touches window at import time; keep it out of prerendering.
const SpikeGrid = dynamic(() => import("./SpikeGrid"), { ssr: false });

export default function HotSpikePage() {
    return (
        <main style={{ padding: 16 }}>
            <h1>Handsontable spike</h1>
            <SpikeGrid />
        </main>
    );
}
