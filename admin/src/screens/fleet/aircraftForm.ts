/**
 * UZ Aero — panel: FORMULARZ SAMOLOTU (`A07a`) — walidacja i szkic (moduł CZYSTY).
 *
 * Serwer sprawdza to samo (`http/routes/admin/fleet.ts` + `domain/fleetGuards.ts`),
 * więc to NIE JEST zabezpieczenie. To różnica między „przycisk mówi, czego brakuje"
 * a „serwer odbija 400 bez wyjaśnienia" — i dlatego reguły są tu LUSTREM reguł serwera,
 * wypisanym obok z podaniem, czego dotyczą.
 *
 * ══ DLACZEGO POJEMNOŚĆ MA WŁASNY PARSER, A NIE `Number(text)` ══
 * Bo pole wypełnia człowiek z polską klawiaturą: „1100", „1 100", „1100,5" mają znaczyć
 * to samo. `Number('1100,5')` daje `NaN`, a `parseFloat('1 100')` — `1`. Obie pomyłki
 * kończą się zapisem pojemności, której nikt nie wpisał, czyli przesunięciem progu
 * flagi `FUEL_MISMATCH` bez wiedzy administratora. Ten sam powód, dla którego
 * `@uzaero/format` ma `parseLitres` dla telefonu.
 */

import type { MhFormat, ServiceStatus } from '@uzaero/domain';
import { parseLitres } from '@uzaero/format';

import type { AircraftListItemDto } from '../../api/dto';
import type { CreateAircraftBody, UpdateAircraftBody } from '../../api/fleet';

export interface AircraftDraft {
  reg: string;
  type: string;
  year: string;
  capacity: string;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
}

/** Lustro `reg` z trasy: 3–10 znaków, litery, cyfry i myślnik. */
export const REG_MIN = 3;
export const REG_MAX = 10;
/** Lustro `type` z trasy. */
export const TYPE_MIN = 2;
export const TYPE_MAX = 60;
/** Lustro `year` z trasy — zakres tabliczki znamionowej, nie fantazji. */
export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;

export interface FieldState {
  ok: boolean;
  /** Powód odmowy — WIDOCZNY tekst pod polem, nigdy tooltip; `null` = pole w porządku. */
  message: string | null;
}

const OK: FieldState = { ok: true, message: null };

/**
 * Rejestrację normalizujemy do WERSALIKÓW, a nie odrzucamy małych liter: „sp-klm"
 * i „SP-KLM" to w intencji administratora ta sama maszyna. Serwer robi dokładnie to
 * samo — panel pokazuje wynik od razu, żeby wielka litera nie była niespodzianką
 * po zapisie.
 */
export function normalizeReg(value: string): string {
  return value.trim().toUpperCase();
}

export function regState(value: string): FieldState {
  const reg = normalizeReg(value);
  if (reg.length === 0) {
    return {
      ok: false,
      message:
        'Rejestracja jest wymagana — widać ją w logu dnia, w nazwie karty arkusza i w każdej fladze.',
    };
  }
  if (reg.length < REG_MIN || reg.length > REG_MAX) {
    return { ok: false, message: `Rejestracja: od ${REG_MIN} do ${REG_MAX} znaków.` };
  }
  if (!/^[A-Z0-9-]+$/.test(reg)) {
    return { ok: false, message: 'Rejestracja: wyłącznie litery, cyfry i myślnik, bez spacji.' };
  }
  return OK;
}

export function typeState(value: string): FieldState {
  const text = value.trim();
  if (text.length === 0) {
    return { ok: false, message: 'Typ jest wymagany — bez niego wiersz floty nie ma podpisu.' };
  }
  if (text.length < TYPE_MIN || text.length > TYPE_MAX) {
    return { ok: false, message: `Typ: od ${TYPE_MIN} do ${TYPE_MAX} znaków.` };
  }
  return OK;
}

/**
 * Rok jest OPCJONALNY, bo kolumna `aircraft.year` jest `NULL`-owalna — tabliczka bez
 * daty produkcji to realny przypadek. Puste pole znaczy „nie wiadomo", a nie „rok 0".
 */
export function yearState(value: string): FieldState {
  const text = value.trim();
  if (text === '') return OK;
  if (!/^\d{4}$/.test(text)) {
    return { ok: false, message: 'Rok produkcji: cztery cyfry albo puste pole.' };
  }
  const year = Number(text);
  if (year < YEAR_MIN || year > YEAR_MAX) {
    return { ok: false, message: `Rok produkcji: między ${YEAR_MIN} a ${YEAR_MAX}.` };
  }
  return OK;
}

/** Wpis pojemności → litry; `null` = wpis nieczytelny (patrz nagłówek pliku). */
export function parseCapacity(value: string): number | null {
  return parseLitres(value);
}

export function capacityState(value: string): FieldState {
  const capacityL = parseCapacity(value);
  if (capacityL == null) {
    return { ok: false, message: 'Pojemność zbiorników: liczba w litrach, np. 1100.' };
  }
  if (capacityL <= 0) {
    return {
      ok: false,
      // Powód, nie „popraw pole": zero cofa tolerancję flagi do podłogi 10 L i unieważnia
      // inwariant „stan po tankowaniu ≤ pojemność". Serwer odmawia z tym samym kodem.
      message:
        'Pojemność musi być większa od zera — z niej wynika próg flagi FUEL_MISMATCH i limit wpisu tankowania.',
    };
  }
  return OK;
}

export interface FormState {
  reg: FieldState;
  type: FieldState;
  year: FieldState;
  capacity: FieldState;
  /** Czy wolno wysłać. */
  ok: boolean;
  /** Powód blokady przycisku — WIDOCZNY tekst, nigdy sam wyszarzony przycisk. */
  reason: string | null;
}

export function formState(draft: AircraftDraft): FormState {
  const reg = regState(draft.reg);
  const type = typeState(draft.type);
  const year = yearState(draft.year);
  const capacity = capacityState(draft.capacity);
  const ok = reg.ok && type.ok && year.ok && capacity.ok;

  return {
    reg,
    type,
    year,
    capacity,
    ok,
    reason: ok ? null : 'Popraw pola oznaczone niżej — serwer odrzuci ten zapis.',
  };
}

/** Pusty formularz „Dodaj samolot" — stan służby domyślnie „w służbie" (mockup A07a). */
export const EMPTY_DRAFT: AircraftDraft = {
  reg: '',
  type: '',
  year: '',
  capacity: '',
  mhFormat: 'decimal',
  dualRequired: false,
  serviceStatus: 'active',
};

/** Jednostka z listy → szkic formularza (wejście „Edytuj"). */
export function draftOf(aircraft: AircraftListItemDto): AircraftDraft {
  return {
    reg: aircraft.reg,
    type: aircraft.type,
    year: aircraft.year == null ? '' : String(aircraft.year),
    capacity: String(aircraft.capacityL),
    mhFormat: aircraft.mhFormat,
    dualRequired: aircraft.dualRequired,
    serviceStatus: aircraft.serviceStatus,
  };
}

/** Szkic → ciało `POST /fleet`. Wołane wyłącznie po `formState(...).ok`. */
export function createBody(draft: AircraftDraft): CreateAircraftBody {
  return {
    reg: normalizeReg(draft.reg),
    type: draft.type.trim(),
    year: draft.year.trim() === '' ? '' : Number(draft.year.trim()),
    capacityL: parseCapacity(draft.capacity) ?? 0,
    mhFormat: draft.mhFormat,
    dualRequired: draft.dualRequired,
    serviceStatus: draft.serviceStatus,
  };
}

/**
 * Szkic → ciało `PATCH /fleet/:id`, wyłącznie POLA ZMIENIONE.
 *
 * `PATCH` opisuje różnicę, a nie stan docelowy, więc wysyłanie niezmienionych pól nie
 * jest tylko marnotrawstwem: dziennik audytu zapisuje DIFF, a serwer odmawia zapisu
 * bez zmian (`no_changes`). Formularz, który wysyła wszystko, kazałby administratorowi
 * czytać w dzienniku „rejestracja z SP-KLM na SP-KLM".
 */
export function updateBody(
  before: AircraftListItemDto,
  draft: AircraftDraft,
): UpdateAircraftBody {
  const body: UpdateAircraftBody = {};

  const reg = normalizeReg(draft.reg);
  if (reg !== before.reg) body.reg = reg;

  const type = draft.type.trim();
  if (type !== before.type) body.type = type;

  const year = draft.year.trim();
  const beforeYear = before.year == null ? '' : String(before.year);
  if (year !== beforeYear) body.year = year === '' ? '' : Number(year);

  const capacityL = parseCapacity(draft.capacity);
  if (capacityL != null && capacityL !== before.capacityL) body.capacityL = capacityL;

  if (draft.mhFormat !== before.mhFormat) body.mhFormat = draft.mhFormat;
  if (draft.dualRequired !== before.dualRequired) body.dualRequired = draft.dualRequired;
  if (draft.serviceStatus !== before.serviceStatus) body.serviceStatus = draft.serviceStatus;

  return body;
}

/** Czy formularz w ogóle coś zmienia — bez tego przycisk „Zapisz" prosi o 400. */
export function hasChanges(before: AircraftListItemDto, draft: AircraftDraft): boolean {
  return Object.keys(updateBody(before, draft)).length > 0;
}

export interface ChoiceOption<T extends string> {
  id: T;
  name: string;
  desc: string;
}

/**
 * Opisy formatu licznika 1:1 z mockupu `A07a` — to jedyne miejsce w produkcie, w którym
 * człowiek czyta, CO ten wybór zmienia, zanim go dokona.
 */
export const MH_FORMAT_OPTIONS: readonly ChoiceOption<MhFormat>[] = [
  {
    id: 'decimal',
    name: 'Dziesiętny — 3907.8',
    desc: 'Licznik z dziesiętną częścią godziny. Pilot wpisuje jedną liczbę.',
  },
  {
    id: 'hhmm',
    name: 'Godziny i minuty — 3907:48',
    desc: 'Licznik z minutami. Pilot wpisuje dwa pola: godziny i minuty 00–59.',
  },
];

export const DUAL_OPTIONS: readonly ChoiceOption<'no' | 'yes'>[] = [
  {
    id: 'no',
    name: 'Nieobowiązkowy',
    desc: 'Pilot może zacząć dzień sam. Dual pozostaje polem opcjonalnym.',
  },
  {
    id: 'yes',
    name: 'Wymagany',
    desc: 'Preflight bez wskazanego Duala jest zablokowany — pilot nie przejdzie do potwierdzenia.',
  },
];

export const SERVICE_OPTIONS: readonly ChoiceOption<ServiceStatus>[] = [
  {
    id: 'active',
    name: 'W służbie',
    desc: 'Widoczny na liście wyboru samolotu w aplikacji pilota.',
  },
  {
    id: 'disabled',
    name: 'Wyłączony ze służby',
    desc: 'Znika z listy wyboru w aplikacji. Historia, statystyki i łańcuch MH zostają bez zmian.',
  },
];
