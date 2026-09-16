/**
 * Ninerdeck - NAZWA KLUBU na kafelku operacji (mockup `01e`, wielofirmowość §7.2).
 *
 * „Mój dzień" i historia pokazują operacje WSZYSTKICH klubów pilota, więc kafelek musi
 * powiedzieć, w którym klubie odbyła się ta operacja. Nazwę składa się z dwóch rzeczy,
 * które i tak są na telefonie: klubu operacji (`session_orgs`) i listy członkostw
 * z profilu logowania.
 *
 * ══ PLAKIETKA ISTNIEJE WYŁĄCZNIE PRZY WIĘCEJ NIŻ JEDNYM CZŁONKOSTWIE ══
 * Przy jednym świeciłaby przy KAŻDYM kafelku i niczego by nie odróżniała - dokładnie to,
 * czym issue #12 uzasadniło milczenie SyncChipa online. Decyzja siedzi tutaj, a nie
 * w ekranie, bo dotyczy obu list naraz (01 i 12) i rozjazd między nimi byłby cichy.
 *
 * Klub, którego nie ma na liście członkostw (pilot wyszedł z niego po locie), zostaje
 * bez nazwy - kafelek pokazuje wtedy sam kafelek, jak przed 2.0.0. Zmyślanie nazwy
 * z identyfikatora dałoby na ekranie surowy guid, czyli to, co ta plakietka ma zastąpić.
 */

import { useCallback } from 'react';

import { useAuthStore } from '../store/authStore';
import { useSessionOrgs } from './useSessionOrgs';

/** Nazwa klubu operacji; `null` = jeden klub albo klub nieznany. */
export type ClubNameOf = (sessionUuid: string) => string | null;

export function useOperationClub(): ClubNameOf {
  const memberships = useAuthStore((s) => s.memberships);
  const orgOf = useSessionOrgs();

  // `useCallback` z tego samego powodu, co w `useSessionOrgs`: rezolwer wchodzi do
  // wspólnych builderów kafelka, a stamtąd łatwo trafia do listy zależności efektu.
  // Nowa tożsamość przy każdym renderze zapętliłaby taki efekt na urządzeniu.
  return useCallback(
    (sessionUuid: string) => {
      if (memberships.length < 2) return null;
      const orgId = orgOf(sessionUuid);
      if (orgId == null) return null;
      return memberships.find((m) => m.org.id === orgId)?.org.name ?? null;
    },
    [memberships, orgOf],
  );
}
