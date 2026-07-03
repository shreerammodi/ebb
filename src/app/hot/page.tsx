"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { SpikeMeta } from "./SpikeGrid";
import SpikePrint from "./SpikePrint";

// Handsontable touches window at import time; keep it out of prerendering.
const SpikeGrid = dynamic(() => import("./SpikeGrid"), { ssr: false });

export default function HotSpikePage() {
    const [snap, setSnap] = useState<{
        data: (string | null)[][];
        meta: SpikeMeta;
    }>({ data: [], meta: {} });

    return (
        <main style={{ padding: 16 }}>
            <h1>Handsontable spike</h1>
            <button onClick={() => window.print()}>Print</button>
            <SpikeGrid onSnapshot={(data, meta) => setSnap({ data, meta })} />
            <SpikePrint data={snap.data} meta={snap.meta} />
        </main>
    );
}
