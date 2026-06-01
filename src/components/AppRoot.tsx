'use client';

/**
 * AppRoot — top-level component that boots the app.
 *
 * On mount:
 *   1. Attaches debounced autosave to the round store (IndexedDB via Dexie).
 *   2. Loads the most recently saved round, if any, into the store.
 *
 * Renders <Workspace /> when a round is active, <RoundSetup /> otherwise.
 */

import { useEffect, useState } from 'react';
import { useRoundStore } from '@/lib/store/useRoundStore';
import { attachAutosave, loadLastRound } from '@/lib/persistence/autosave';
import Workspace from './Workspace';
import RoundSetup from './RoundSetup';

export default function AppRoot() {
  const round = useRoundStore(s => s.round);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubscribe = attachAutosave(useRoundStore);

    loadLastRound().then(r => {
      if (r) useRoundStore.setState({ round: r });
      setLoaded(true);
    });

    return unsubscribe;
  }, []);

  if (!loaded) return null;

  return round ? <Workspace /> : <RoundSetup />;
}
