/**
 * UZ Aero - tożsamość zalogowanego pilota.
 *
 * `CLAUDE.md`: *tożsamość pilota jest znana w całej sesji - NIE pytamy o kod pilota
 * w formularzach*. Wartość ustawia proces logowania / odtworzenie profilu
 * (`authStore.restore()`), a ekrany renderują się dopiero po `signed_in` - więc
 * placeholder poniżej nigdy nie dociera do UI.
 */

import { create } from 'zustand';

import type { ReferencePilot } from '../../domain';

/** Placeholder sprzed provisioning - testom i StyleGuide wystarcza stała wartość. */
export const PILOT_ID = 'TMK';

interface CurrentPilotStore {
  id: string;
  /** Wpis z cache referencyjnego - źródło nazwiska pokazywanego na pasku tożsamości. */
  profile: ReferencePilot | null;
  setProfile(profile: ReferencePilot | null): void;
}

export const useCurrentPilot = create<CurrentPilotStore>((set) => ({
  id: PILOT_ID,
  profile: null,
  setProfile: (profile) => set({ profile }),
}));
