"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { loadSpike, saveSpike } from "@/lib/spike/spikeDb";

import type { SpikeMeta } from "./SpikeGrid";
import SpikePrint from "./SpikePrint";

// Handsontable touches window at import time; keep it out of prerendering.
const SpikeGrid = dynamic(() => import("./SpikeGrid"), { ssr: false });

export default function HotSpikePage() {
    const [snap, setSnap] = useState<{
        data: (string | null)[][];
        meta: SpikeMeta;
    }>({ data: [], meta: {} });
    // undefined = still loading; null = nothing saved. The grid mounts only
    // after the load settles so a saved doc is not raced by sample data.
    const [initial, setInitial] = useState<
        { data: (string | null)[][]; meta: SpikeMeta } | null | undefined
    >(undefined);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        loadSpike().then((doc) => setInitial(doc ? { data: doc.data, meta: doc.meta } : null));
    }, []);

    const handleSnapshot = (data: (string | null)[][], meta: SpikeMeta) => {
        setSnap({ data, meta });
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            void saveSpike({ id: "spike", data, meta, savedAt: Date.now() });
        }, 500);
    };

    return (
        <main style={{ padding: 16 }}>
            <h1>Handsontable spike</h1>
            <button onClick={() => window.print()}>Print</button>
            {initial !== undefined && (
                <SpikeGrid onSnapshot={handleSnapshot} initial={initial ?? undefined} />
            )}
            <SpikePrint data={snap.data} meta={snap.meta} />
        </main>
    );
}
