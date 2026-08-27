/**
 * UZ Aero — szkic preflightu (stan UI, nie domena).
 *
 * Przejęcie to trzy ekrany (02 → 02e → 02a), które wspólnie budują JEDNO zdarzenie
 * `preflight_confirm`. Dopóki pilot nie naciśnie „PRZEJMIJ I LEĆ" na kroku 3, **nic nie
 * jest zapisane** — dlatego szkic żyje w pamięci UI, a nie w rejestrze zdarzeń.
 *
 * To rozróżnienie jest celowe: rejestr jest append-only, więc nie wolno do niego
 * wpisywać stanów pośrednich, które pilot może jeszcze zmienić albo porzucić.
 *
 * GODZINY MELDUNKU TU NIE MA i to jest decyzja (§3.6a, 2026-08-06; domknięta issue #23,
 * 2026-08-11): dzień pilota to LISTA SESJI — klamra służby nie istnieje w modelu
 * w ogóle, więc nie ma godziny, którą szkic miałby zbierać. Pytanie o nią przy
 * przejęciu kosztowało krok w drodze do kokpitu i sugerowało, że bez odpowiedzi
 * nie wolno lecieć.
 */

import { create } from 'zustand';

import { isSameFieldOperation } from '../../domain';
import type { JumperCounts, MhFormat, OperationType, ReferenceAircraft } from '../../domain';

export interface PreflightDraft {
  aircraft: ReferenceAircraft | null;
  operation: OperationType;
  departureIcao: string;
  arrivalIcao: string;
  dualId: string | null;
  client: string | null;
  /**
   * Notatka pilota do dnia (issue #14) — wolny tekst, wielolinijkowy.
   *
   * Świadomie POZA `TASK_FIELDS` i poza pamięcią zadania: klient i trasa powtarzają się
   * z dnia na dzień (ten sam klub, ten sam plac), a notatka opisuje JEDEN dzień
   * („lot z uczniem", „drugi zbiornik nie działa"). Podpowiadanie jej wczorajszej treści
   * byłoby podpowiadaniem nieprawdy — podpowiedzi w arkuszu pilot wybiera sam.
   */
  notes: string | null;
  /**
   * Domyślny skład skoczków sesji (operacja Skoki, 2026-08-17) — ustawiany na kroku
   * „zadanie" (02e), zanim padnie pierwszy `boarding`. Ma sens WYŁĄCZNIE przy operacji
   * skoki; `confirmPreflight` filtruje go po `isJumpOperation`, więc odręczna zmiana
   * operacji po ustawieniu defaultu nie wysyła sierocej wartości.
   */
  jumperDefaults: JumperCounts | null;

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

/**
 * Trasa skoków to JEDNA wartość w dwóch polach rekordu (issue #13).
 *
 * Formularz pyta o jedno lotnisko — bo skoki startują i lądują na tym samym placu
 * (`isSameFieldOperation`) — ale szkic trzyma obie wartości równe. Dzięki temu ani
 * projekcja, ani karta arkusza, ani panel nie muszą znać wyjątku „przy skokach patrz
 * tylko na start": `departureIcao` i `arrivalIcao` znaczą zawsze to samo co dotąd.
 *
 * Egzekwowane w JEDNYM miejscu — przy każdym zapisie do szkicu — bo inwariant pilnowany
 * przez pamiętanie o nim w trzech miejscach ekranu jest inwariantem tylko do pierwszej
 * zmiany w tym ekranie.
 */
function withRouteShape(draft: PreflightDraft): PreflightDraft {
  if (!isSameFieldOperation(draft.operation)) return draft;
  if (draft.arrivalIcao === draft.departureIcao) return draft;
  return { ...draft, arrivalIcao: draft.departureIcao };
}

interface PreflightDraftStore extends PreflightDraft {
  setAircraft(aircraft: ReferenceAircraft): void;
  set<K extends keyof PreflightDraft>(key: K, value: PreflightDraft[K]): void;
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
  /**
   * Czy w szkicu jest jakikolwiek WYBÓR pilota do obrony (issue #55): bramka
   * „wstecz" na kroku 1 pyta o rezygnację tylko wtedy, gdy jest czego bronić —
   * pusty formularz wychodzi bez pytania, a arkusz nad niczym pytałby o zgodę
   * na nic. Pyta o samolot i Duala, bo tylko te dwa da się ustawić na kroku 1;
   * pola zadania (krok 2) są nieosiągalne bez wybranego samolotu.
   */
  dirty(): boolean;
}

function initial(): PreflightDraft {
  return {
    aircraft: null,
    operation: 'skoki',
    departureIcao: '',
    arrivalIcao: '',
    dualId: null,
    client: null,
    notes: null,
    jumperDefaults: null,
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
    set((state) => withRouteShape({ ...state, [key]: value }));
    // Dotknięcie zadania zamyka drogę podpowiedzi — od tej chwili obowiązuje wpis pilota.
    if (TASK_FIELDS.includes(key)) set({ taskTouched: true });
  },

  suggestTask(task, route) {
    if (get().taskTouched) return;
    // Podpowiedź z ostatniego dnia też przechodzi przez kształt trasy: zapamiętana para
    // „EPKK → EPWA" przy operacji skoki opisywałaby dzień, którego się nie da polecieć.
    set((state) => withRouteShape({ ...state, ...task, ...route }));
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

  dirty() {
    const { aircraft, dualId } = get();
    return aircraft != null || dualId != null;
  },
}));
