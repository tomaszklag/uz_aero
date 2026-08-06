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
  /** Czas meldowania (UTC) — domyślnie „teraz" z chwili WEJŚCIA na krok 1, edytowalny. */
  dutyStart: number;
  /**
   * Czy pilot podał godzinę meldunku sam (arkusz na kroku 1).
   *
   * Rozstrzyga, czy wolno podstawić „teraz" przy kolejnym wejściu na ekran
   * (`refreshDutyStart`). Bez tej flagi powrót z kroku 2 kasowałby świeżo wpisaną
   * godzinę — dokładnie ten sam mechanizm, co `taskTouched` niżej.
   */
  dutyStartEdited: boolean;
  dualId: string | null;
  client: string | null;

  /** Odczyt paliwa z paliwomierza (L). */
  fuelL: number;
  /** Odczyt licznika motogodzin (godziny dziesiętne). */
  mh: number;
  /** Czy odczyty pochodzą z przekazania, czy pilot wpisał je sam. */
  readingSource: 'handover' | 'manual';
  /**
   * Czy pilot dotknął pól ZADANIA (operacja, trasa, klient) w tym preflighcie.
   *
   * Rozstrzyga, czy krok 02e wolno wypełnić podpowiedzią z ostatniego dnia
   * (`useTaskMemory`). Bez tej flagi powrót na krok wstecz i ponowne wejście kasowałoby
   * świeżo wpisaną trasę, bo ekran montuje się od nowa i znowu „pomagał".
   */
  taskTouched: boolean;
}

/** Pola opisujące ZADANIE dnia — ich zmiana wyłącza podpowiadanie (patrz `taskTouched`). */
const TASK_FIELDS: readonly (keyof PreflightDraft)[] = [
  'operation',
  'departureIcao',
  'arrivalIcao',
  'client',
];

interface PreflightDraftStore extends PreflightDraft {
  setAircraft(aircraft: ReferenceAircraft): void;
  set<K extends keyof PreflightDraft>(key: K, value: PreflightDraft[K]): void;
  /**
   * Podstawia „teraz" jako godzinę meldunku — woła to krok 1 przy każdym wejściu.
   *
   * Osobna akcja, bo szkic żyje w pamięci procesu tak długo jak aplikacja: wartość
   * z `initial()` powstawała RAZ, przy pierwszym dotknięciu store'u, więc pilot, który
   * otworzył aplikację o 6:00, a zaczynał dzień o 8:00, dostawał na ekranie 6:00
   * (zgłoszenie z urządzenia, issue #12). Godzina wpisana ręcznie jest nietykalna.
   */
  refreshDutyStart(now: number): void;
  /**
   * Wypełnienie zadania podpowiedzią z ostatniego dnia. Osobno od `set`, bo NIE liczy
   * się jako dotknięcie pól przez pilota — inaczej podpowiedź zablokowałaby samą siebie.
   */
  suggestTask(task: Pick<PreflightDraft, 'operation' | 'client'>, route: Pick<PreflightDraft, 'departureIcao' | 'arrivalIcao'>): void;
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
    dutyStartEdited: false,
    dualId: null,
    client: null,
    fuelL: 0,
    mh: 0,
    readingSource: 'manual',
    taskTouched: false,
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
    // Dotknięcie zadania zamyka drogę podpowiedzi — od tej chwili obowiązuje wpis pilota.
    if (TASK_FIELDS.includes(key)) set({ taskTouched: true });
    // Ta sama zasada dla godziny meldunku: wpis pilota wygrywa z „teraz".
    if (key === 'dutyStart') set({ dutyStartEdited: true });
  },

  refreshDutyStart(now) {
    if (get().dutyStartEdited) return;
    set({ dutyStart: now });
  },

  suggestTask(task, route) {
    if (get().taskTouched) return;
    set({ ...task, ...route });
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
