/**
 * UZ Aero — szkic preflightu (stan UI, nie domena).
 *
 * Preflight to trzy ekrany (02 → 02a → 03), które wspólnie budują JEDNO zdarzenie
 * `preflight_confirm`. Dopóki pilot nie potwierdzi na ekranie 3, **nic nie jest
 * zapisane** — dlatego szkic żyje w pamięci UI, a nie w rejestrze zdarzeń.
 *
 * To rozróżnienie jest celowe: rejestr jest append-only, więc nie wolno do niego
 * wpisywać stanów pośrednich, które pilot może jeszcze zmienić albo porzucić.
 */

import { create } from 'zustand';

import type { MhFormat, OperationType, ReferenceAircraft } from '../../domain';

export interface PreflightDraft {
  aircraft: ReferenceAircraft | null;
  operation: OperationType;
  departureIcao: string;
  arrivalIcao: string;
  /** Czas meldowania (UTC) — domyślnie „teraz", edytowalny. */
  dutyStart: number;
  dualId: string | null;
  client: string | null;

  /** Odczyt paliwa z paliwomierza (L). */
  fuelL: number;
  /** Odczyt licznika motogodzin (godziny dziesiętne). */
  mh: number;
  /** Czy odczyty pochodzą z przekazania, czy pilot wpisał je sam. */
  readingSource: 'handover' | 'manual';
}

interface PreflightDraftStore extends PreflightDraft {
  setAircraft(aircraft: ReferenceAircraft): void;
  set<K extends keyof PreflightDraft>(key: K, value: PreflightDraft[K]): void;
  reset(): void;
  /** Format MH wybranego samolotu — steruje wyświetlaniem (§5.4). */
  mhFormat(): MhFormat;
  /** Czy krok 1 jest kompletny (m.in. wymóg Duala dla An-2). */
  step1Valid(): boolean;
}

function initial(): PreflightDraft {
  return {
    aircraft: null,
    operation: 'skoki',
    departureIcao: '',
    arrivalIcao: '',
    dutyStart: Date.now(),
    dualId: null,
    client: null,
    fuelL: 0,
    mh: 0,
    readingSource: 'manual',
  };
}

export const usePreflightDraft = create<PreflightDraftStore>((set, get) => ({
  ...initial(),

  setAircraft(aircraft) {
    // Wybór samolotu podstawia odczyty z przekazania (jeśli są) — to one, a nie
    // wpisy z palca, są punktem odniesienia łańcucha MH (§4.5). Gdy przekazania brak,
    // zostawiamy zera i UI mówi wprost „wpisz z licznika".
    const handover = aircraft.handover;
    set({
      aircraft,
      // Wymóg Duala jest właściwością samolotu — zmiana maszyny kasuje poprzedni wybór.
      dualId: null,
      fuelL: handover?.reading.fuelL ?? 0,
      mh: handover?.reading.mh ?? 0,
      readingSource: handover != null ? 'handover' : 'manual',
    });
  },

  set(key, value) {
    set({ [key]: value } as Pick<PreflightDraft, typeof key>);
  },

  reset() {
    set(initial());
  },

  mhFormat() {
    return get().aircraft?.mhFormat ?? 'decimal';
  },

  step1Valid() {
    const { aircraft, dualId } = get();
    if (aircraft == null) return false;
    if (aircraft.serviceStatus === 'disabled') return false;
    // An-2 i podobne: bez drugiego pilota nie ruszamy (§3.1, konfiguracja §5.4).
    if (aircraft.dualRequired && dualId == null) return false;
    return true;
  },
}));
