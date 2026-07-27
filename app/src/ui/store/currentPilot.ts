/**
 * UZ Aero — tożsamość zalogowanego pilota.
 *
 * `CLAUDE.md`: *tożsamość pilota jest znana w całej sesji — NIE pytamy o kod pilota
 * w formularzach*. Ekran 00-login jeszcze nie istnieje, więc do czasu jego powstania
 * trzymamy tu jedno miejsce z tą wiedzą — zamiast rozsiewać `'TMK'` po ekranach.
 *
 * ⚠️ TYMCZASOWE: po zaimplementowaniu logowania (00) i odblokowania PIN-em (01) tę
 * wartość ustawia proces logowania, a `PILOT_ID` znika. Do tego czasu ekrany i tak
 * czytają ją stąd, więc podmiana będzie zmianą w jednym pliku.
 */

import { create } from 'zustand';

import type { ReferencePilot } from '../../domain';

/** Kod pilota scenariusza (zgodny z zaślepką floty w `infrastructure/referenceSeed.ts`). */
export const PILOT_ID = 'TMK';

interface CurrentPilotStore {
  id: string;
  /** Wpis z cache referencyjnego — źródło nazwiska pokazywanego na pasku tożsamości. */
  profile: ReferencePilot | null;
  setProfile(profile: ReferencePilot | null): void;
}

export const useCurrentPilot = create<CurrentPilotStore>((set) => ({
  id: PILOT_ID,
  profile: null,
  setProfile: (profile) => set({ profile }),
}));
