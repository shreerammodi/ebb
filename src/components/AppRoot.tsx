"use client";

/**
 * AppRoot — top-level component that boots the app.
 *
 * On mount:
 *   1. Attaches debounced autosave to the round store (IndexedDB via Dexie).
 *   2. Loads the most recently saved round, if any, into the store.
 *
 * Renders <Workspace /> when a round is active, <RoundSetup /> otherwise.
 */

import { useEffect, useState } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { attachAutosave, loadLastRound } from "@/lib/persistence/autosave";
import Workspace from "./Workspace";
import RoundSetup from "./RoundSetup";

export default function AppRoot() {
  const round = useRoundStore((s) => s.round);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = attachAutosave(useRoundStore);

    loadLastRound()
      .then((r) => {
        if (mounted && r) {
          const flowSheets = [...r.sheets]
            .filter((s) => s.kind !== "cx")
            .sort((a, b) => a.order - b.order);
          const firstSheet = flowSheets[0] ?? [...r.sheets].sort((a, b) => a.order - b.order)[0];
          useRoundStore.setState({ round: r, activeSheetId: firstSheet?.id ?? null });
        }
      })
      .catch(() => {
        // IndexedDB unavailable — start fresh
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!loaded) return null;

  return round ? <Workspace /> : <RoundSetup />;
}
