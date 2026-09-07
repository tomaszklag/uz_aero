/**
 * UZ Aero - panel 2.0: formularz samolotu - szkic, ocena i ZMIANA do wysłania.
 *
 * Moduł CZYSTY (bez Reacta, bez sieci) - decyzje o treści, nie o układzie.
 *
 * == CO TU WOLNO SPRAWDZAC ==
 * Kształt wpisu (to, co serwer odrzuciłby jako `400 bad_request`), WYMAGALNOŚĆ pól
 * (uwagi do issue #66: olej, normy i - przy tworzeniu - „Aktualny stan" nie są
 * opcjonalne; to reguła FORMULARZA, serwer dalej przyjmuje `null` starych wierszy)
 * ORAZ reguły, które widać wprost w polach: wartości dodatnie, minimum oleju nie
 * większe od zbiornika, stan w granicach pojemności. Wszystkie mówią TYM SAMYM
 * zdaniem, co odmowa serwera (`aircraftRefusal.ts`), więc nie są drugą regułą -
 * są tą samą regułą powiedzianą wcześniej.
 *
 * Czego tu NIE MA: „czy wolno wyłączyć jednostkę ze służby". To zależy od otwartych
 * sesji, czyli od stanu świata, a nie od zawartości pól - pyta o to ekran, bo ma liczbę
 * z listy, i tak samo pyta serwer, bo tylko on wie, jak jest naprawdę.
 */

import { motoHours, parseLitres, parseMotoHours } from '@uzaero/format';
import type { MhFormat } from '@uzaero/domain';

import type { AircraftListItemDto } from '../../api/dto';
import type { CreateAircraftBody, UpdateAircraftBody } from '../../api/fleet';
import {
  AIRCRAFT_IN_SERVICE,
  CAPACITY_NOT_POSITIVE,
  FUEL_NORM_NOT_POSITIVE,
  INITIAL_FUEL_OVER_CAPACITY,
  INITIAL_OIL_OVER_CAPACITY,
  OIL_MIN_ABOVE_CAPACITY,
  OIL_NOT_POSITIVE,
} from './aircraftRefusal';

/** Stan pól formularza. Liczby jako NAPISY - tak, jak wychodzą z `<input>`. */
export interface AircraftDraft {
  reg: string;
  type: string;
  year: string;
  capacityL: string;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: 'active' | 'disabled';
  oilMinL: string;
  oilCapacityL: string;
  oilNormLPerH: string;
  /** Norma nominalna spalania z dokumentacji (issue #66). */
  fuelNormLPerH: string;
  /**
   * „Aktualny stan" jednostki (issue #66 + uwagi) - zerowe ogniwo łańcucha odczytów.
   * Identyfikatory zostają `initial*` (tak nazywają się kolumny i pola API); na ekranie
   * pole nazywa się „Aktualny stan", a czy jest edytowalne, mówi `InitialFieldsMode`.
   */
  initialMh: string;
  initialFuelL: string;
  initialOilL: string;
}

export const EMPTY_AIRCRAFT: AircraftDraft = {
  reg: '',
  type: '',
  year: '',
  capacityL: '',
  // Domyślny licznik dziesiętny - tak wygląda większość przyrządów w klubie,
  // a wybór i tak jest jawny (dwie karty, żadna nie jest „resztą").
  mhFormat: 'decimal',
  dualRequired: false,
  serviceStatus: 'active',
  oilMinL: '',
  oilCapacityL: '',
  oilNormLPerH: '',
  fuelNormLPerH: '',
  initialMh: '',
  initialFuelL: '',
  initialOilL: '',
};

/** Liczba -> pole tekstowe. `null` to pole PUSTE, nie napis „null" i nie zero. */
const textOf = (value: number | null): string => (value == null ? '' : String(value));

/** Motogodziny -> pole tekstowe W FORMACIE LICZNIKA tej maszyny (dziesiętny / hh:mm). */
const mhTextOf = (value: number | null, format: MhFormat): string =>
  value == null ? '' : motoHours(value, format);

export function draftOf(aircraft: AircraftListItemDto): AircraftDraft {
  return {
    reg: aircraft.reg,
    type: aircraft.type,
    year: textOf(aircraft.year),
    capacityL: textOf(aircraft.capacityL),
    mhFormat: aircraft.mhFormat,
    dualRequired: aircraft.dualRequired,
    serviceStatus: aircraft.serviceStatus === 'disabled' ? 'disabled' : 'active',
    oilMinL: textOf(aircraft.oilMinL),
    oilCapacityL: textOf(aircraft.oilCapacityL),
    oilNormLPerH: textOf(aircraft.oilNormLPerH),
    fuelNormLPerH: textOf(aircraft.fuelNormLPerH),
    // Licznik pokazujemy W FORMACIE TEJ MASZYNY: administrator przepisuje liczbę
    // z tarczy, a tarcza zegarowa pokazuje „1236:30", nie „1236.5". W danych
    // motogodziny są zawsze dziesiętne - to jest wyłącznie sposób zapisu.
    initialMh: mhTextOf(aircraft.initialMh, aircraft.mhFormat),
    initialFuelL: textOf(aircraft.initialFuelL),
    initialOilL: textOf(aircraft.initialOilL),
  };
}

/**
 * KIEDY przestawić szkic na dane z serwera - klucz synchronizacji formularza.
 *
 * `null` znaczy „jeszcze nie ma czym": przy wejściu z linku (albo po odświeżeniu karty)
 * szuflada montuje się ZANIM przyjdzie lista, więc jednostki jeszcze nie ma. Formularz
 * przestawiony wtedy raz, przy montowaniu, zostawał pusty na zawsze.
 *
 * Klucz zmienia się wyłącznie przy zmianie TOŻSAMOŚCI edytowanej jednostki - nie przy
 * każdym odświeżeniu listy, więc przeładowanie danych po zapisie nie kasuje wpisu.
 */
export function draftKey(creating: boolean, aircraft: AircraftListItemDto | null): string | null {
  if (creating) return 'nowy';
  return aircraft?.id ?? null;
}

/**
 * Rejestrację normalizujemy do WERSALIKOW dokładnie tak, jak robi to serwer:
 * „sp-klm" i „SP-KLM" to ta sama maszyna, a indeks unikalności jest wrażliwy na
 * wielkość liter - bez normalizacji dałoby się założyć drugi wiersz tego samego
 * samolotu.
 */
export const normalizeReg = (reg: string): string => reg.trim().toUpperCase();

export type AircraftField =
  | 'reg'
  | 'type'
  | 'year'
  | 'capacityL'
  | 'oilMinL'
  | 'oilCapacityL'
  | 'oilNormLPerH'
  | 'fuelNormLPerH'
  | 'initialMh'
  | 'initialFuelL'
  | 'initialOilL';

/**
 * Co formularz robi z polami „Aktualny stan" (`initial*`) - uwagi do issue #66:
 *
 *  - `required` - NOWY samolot: pola do wpisania i WYMAGANE (zamówienie z issue #66:
 *    „jak dodaję samolot to powinno być pole w którym wpiszę startowy stan…");
 *  - `editable` - edycja jednostki, której stanu nie prowadzi jeszcze dziennik
 *    (`reading` z panelu albo żaden): liczba jest nadal wyłącznie wpisem administratora,
 *    więc ma on prawo ją poprawić. Puste pole jest tu legalne - wymóg przy edycji
 *    blokowałby niezwiązaną poprawkę (np. wyłączenie ze służby) na starym wierszu;
 *  - `locked` - edycja jednostki, która już lata: pola są DO ODCZYTU (wartości
 *    z dziennika, `currentState.ts`), więc szkicu `initial*` nie ocenia się i nie
 *    wysyła wcale. Bez tego korekta pojemności potrafiłaby zapalić błąd na polu,
 *    którego na ekranie nie ma.
 *
 * Kto wybiera tryb: ekran, bo tylko on wie, czy tworzy i co mówi `reading.source`
 * (`currentStateLocked`).
 */
export type InitialFieldsMode = 'required' | 'editable' | 'locked';

/**
 * == PUSTE POLE WYMAGANE NIE DOSTAJE ZDANIA ==
 * Reguła przeniesiona wprost z aplikacji pilota (`CLAUDE.md`, issue #55): brak wpisu
 * widać z formularza NAD przyciskiem, więc przycisk jest po prostu nieczynny.
 * Zdanie zostaje dla wpisu NIECZYTELNEGO - czerwona ramka mówi, KTORE pole,
 * ale nie mówi, co jest z nim nie tak.
 */
export interface AircraftVerdict {
  /** Pola z wpisem NIE DO ODCZYTANIA - czerwona ramka. Puste pola tu NIE wchodzą. */
  invalid: AircraftField[];
  /** `false` = brakuje czegoś wymaganego. Bez zdania - brak widać w polach. */
  complete: boolean;
  /** Zdanie dla przycisku; `null` także wtedy, gdy formularz jest po prostu pusty. */
  blocker: string | null;
}

const REG_PATTERN = /^[A-Z0-9-]+$/;

/**
 * Litry z pola tekstowego. `parseLitres` z `@uzaero/format` - ten sam parser, którego
 * używa aplikacja pilota, więc przecinek i kropka znaczą to samo po obu stronach.
 */
const litresOf = (text: string): number | null => parseLitres(text.trim());

/**
 * Licznik z pola tekstowego. `parseMotoHours` przyjmuje OBA zapisy naraz („1236.5"
 * i „1236:30") niezależnie od `mhFormat` - administrator przepisujący liczbę z tarczy
 * nie ma się zastanawiać, jak jednostka jest skonfigurowana. Wynikiem są zawsze
 * godziny dziesiętne, bo tylko takie jadą do bazy.
 */
const mhOf = (text: string): number | null => parseMotoHours(text.trim());

/** Rok jako CZTERY CYFRY - własny parser, bo `parseLitres` przyjąłby „19,99". */
function yearOf(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function verdictOf(draft: AircraftDraft, initialFields: InitialFieldsMode): AircraftVerdict {
  const invalid: AircraftField[] = [];
  let blocker: string | null = null;
  let complete = true;

  /** Wpis nieczytelny: czerwona ramka I zdanie. */
  const fail = (field: AircraftField, message: string): void => {
    invalid.push(field);
    blocker ??= message;
  };
  /** Pole wymagane, jeszcze puste: sam brak zapisu, bez ramki i bez zdania. */
  const missing = (): void => {
    complete = false;
  };

  const reg = normalizeReg(draft.reg);
  const type = draft.type.trim();

  if (reg === '') missing();
  else if (reg.length < 3 || reg.length > 10) fail('reg', 'Rejestracja ma od 3 do 10 znaków.');
  else if (!REG_PATTERN.test(reg)) fail('reg', 'Rejestracja: litery, cyfry i myślnik.');

  if (type === '') missing();
  else if (type.length < 2) fail('type', 'Typ samolotu: co najmniej 2 znaki.');

  if (draft.year.trim() !== '') {
    const year = yearOf(draft.year);
    if (year == null || year < 1900 || year > 2100) {
      fail('year', 'Rok produkcji: cztery cyfry albo puste pole.');
    }
  }

  const capacity = litresOf(draft.capacityL);
  if (draft.capacityL.trim() === '') missing();
  else if (capacity == null) fail('capacityL', 'Pojemność w litrach, np. 1100.');
  else if (capacity <= 0) fail('capacityL', CAPACITY_NOT_POSITIVE);

  /*
   * Konfiguracja oleju i normy z dokumentacji są WYMAGANE (uwagi do issue #66, pkt 1
   * i 5: „olej musi być wymagany zawsze", „pola nie powinny być opcjonalne"). Puste
   * pole blokuje zapis samym brakiem - widać je w formularzu nad przyciskiem
   * (reguła issue #55) - a wpisane musi być liczbą DODATNIĄ: zero L/h nie jest stanem
   * świata, tylko literówką.
   */
  const positives: [AircraftField, string, string][] = [
    ['oilMinL', draft.oilMinL, OIL_NOT_POSITIVE],
    ['oilCapacityL', draft.oilCapacityL, OIL_NOT_POSITIVE],
    ['oilNormLPerH', draft.oilNormLPerH, OIL_NOT_POSITIVE],
    ['fuelNormLPerH', draft.fuelNormLPerH, FUEL_NORM_NOT_POSITIVE],
  ];
  for (const [field, text, refusal] of positives) {
    if (text.trim() === '') {
      missing();
      continue;
    }
    const value = litresOf(text);
    if (value == null) fail(field, 'Wpisz liczbę.');
    else if (value <= 0) fail(field, refusal);
  }

  // Reguła konfiguracji PRZED sufitami stanu: gdy obie odzywają się naraz (obniżony
  // zbiornik), pierwszeństwo ma zdanie o samej konfiguracji.
  const oilMin = litresOf(draft.oilMinL);
  const oilCapacity = litresOf(draft.oilCapacityL);
  if (oilMin != null && oilCapacity != null && oilMin > oilCapacity) {
    fail('oilMinL', OIL_MIN_ABOVE_CAPACITY);
  }

  /*
   * „Aktualny stan": ZERO jest tu WARTOŚCIĄ, nie brakiem (nowy silnik ma 0 na
   * liczniku, maszyna przyjęta z pustymi zbiornikami - 0 litrów), więc nie sprawdzamy
   * dodatniości. Ta różnica wobec norm wyżej jest treścią tych pól, a nie przeoczeniem.
   * Wymagane są WYŁĄCZNIE przy tworzeniu; w trybie `locked` nie ocenia się ich wcale,
   * bo nie ma ich na ekranie (patrz `InitialFieldsMode`).
   *
   * Ujemnych też tu nie sprawdzamy i to NIE jest luka: oba parsery przyjmują wyłącznie
   * cyfry, więc „-5" nie jest dla nich liczbą i wypada zdaniem o nieczytelnym wpisie.
   * Reguła `initial_negative` żyje na serwerze, bo tam JSON potrafi przynieść minus.
   */
  if (initialFields !== 'locked') {
    const initial: [AircraftField, string, (t: string) => number | null][] = [
      ['initialMh', draft.initialMh, mhOf],
      ['initialFuelL', draft.initialFuelL, litresOf],
      ['initialOilL', draft.initialOilL, litresOf],
    ];
    for (const [field, text, parse] of initial) {
      if (text.trim() === '') {
        if (initialFields === 'required') missing();
        continue;
      }
      if (parse(text) == null) fail(field, 'Wpisz liczbę.');
    }

    // Oba sufity mówią TYM SAMYM zdaniem, co odmowa serwera - to jest ta sama reguła
    // powiedziana wcześniej, a nie druga (patrz nagłówek pliku).
    const initialFuel = litresOf(draft.initialFuelL);
    if (initialFuel != null && capacity != null && capacity > 0 && initialFuel > capacity) {
      fail('initialFuelL', INITIAL_FUEL_OVER_CAPACITY);
    }

    const initialOil = litresOf(draft.initialOilL);
    if (initialOil != null && oilCapacity != null && initialOil > oilCapacity) {
      fail('initialOilL', INITIAL_OIL_OVER_CAPACITY);
    }
  }

  return { invalid, complete, blocker };
}

/**
 * Pojemność z pola jako liczba - dla podpowiedzi o progu.
 *
 * Osobna funkcja, a nie pole werdyktu: ekran pyta o nią przy KAŻDYM naciśnięciu
 * klawisza (żeby zapytać serwer o próg), a werdykt liczy się przy zapisie.
 */
export const capacityValue = (draft: AircraftDraft): number | null => litresOf(draft.capacityL);

export function createBodyOf(draft: AircraftDraft): CreateAircraftBody {
  return {
    reg: normalizeReg(draft.reg),
    type: draft.type.trim(),
    // Pusty rok jedzie jako `''`, nie `null` - taki jest schemat po drugiej stronie
    // (unia liczby i pustego napisu); `null` odbiłby się o `400 bad_request`.
    year: yearOf(draft.year) ?? '',
    capacityL: litresOf(draft.capacityL) ?? 0,
    mhFormat: draft.mhFormat,
    dualRequired: draft.dualRequired,
    serviceStatus: draft.serviceStatus,
    oilMinL: litresOf(draft.oilMinL),
    oilCapacityL: litresOf(draft.oilCapacityL),
    oilNormLPerH: litresOf(draft.oilNormLPerH),
    fuelNormLPerH: litresOf(draft.fuelNormLPerH),
    initialMh: mhOf(draft.initialMh),
    initialFuelL: litresOf(draft.initialFuelL),
    initialOilL: litresOf(draft.initialOilL),
  };
}

/**
 * Szkic -> ciało `PATCH`, czyli WYŁACZNIE to, co się zmieniło.
 *
 * Porównujemy WARTOSCI, nie napisy: „1100" i „1100,0" to ta sama pojemność, a wysłanie
 * jej jako zmiany dałoby wpis w dzienniku audytu o zmianie, której nie było.
 *
 * W trybie `locked` pola `initial*` NIE wchodzą do ciała wcale - są na ekranie do
 * odczytu (wartości z dziennika), więc szkic nie ma prawa ich ruszyć. To nie jest
 * ostrożność na wyrost: `draftOf` formatuje licznik do napisu, a formatowanie
 * z zaokrągleniem (`1236.55` → „1236.6") czytane z powrotem różni się od bazy
 * i wysłałoby „poprawkę", której nikt nie zrobił, na pole, którego nie widać.
 */
export function updateBodyOf(
  before: AircraftListItemDto,
  draft: AircraftDraft,
  initialFields: InitialFieldsMode,
): UpdateAircraftBody {
  const body: UpdateAircraftBody = {};
  const next = createBodyOf(draft);

  // Rejestrację porównujemy PO OBU stronach po normalizacji - ta sama pułapka, co
  // przy kodzie pilota: wiersz założony z pominięciem trasy (seed, `INSERT` ręką)
  // ma małe litery, a wpis znormalizowany różniłby się od niego zawsze.
  if (next.reg !== normalizeReg(before.reg)) body.reg = next.reg;
  if (next.type !== before.type) body.type = next.type;
  if ((next.year === '' ? null : next.year) !== before.year) body.year = next.year;
  if (next.capacityL !== before.capacityL) body.capacityL = next.capacityL;
  if (next.mhFormat !== before.mhFormat) body.mhFormat = next.mhFormat;
  if (next.dualRequired !== before.dualRequired) body.dualRequired = next.dualRequired;
  if (next.serviceStatus !== before.serviceStatus) body.serviceStatus = next.serviceStatus;
  if (next.oilMinL !== before.oilMinL) body.oilMinL = next.oilMinL;
  if (next.oilCapacityL !== before.oilCapacityL) body.oilCapacityL = next.oilCapacityL;
  if (next.oilNormLPerH !== before.oilNormLPerH) body.oilNormLPerH = next.oilNormLPerH;
  if (next.fuelNormLPerH !== before.fuelNormLPerH) body.fuelNormLPerH = next.fuelNormLPerH;
  if (initialFields !== 'locked') {
    if (next.initialMh !== before.initialMh) body.initialMh = next.initialMh;
    if (next.initialFuelL !== before.initialFuelL) body.initialFuelL = next.initialFuelL;
    if (next.initialOilL !== before.initialOilL) body.initialOilL = next.initialOilL;
  }

  return body;
}

export const hasChanges = (
  before: AircraftListItemDto,
  draft: AircraftDraft,
  initialFields: InitialFieldsMode,
): boolean => Object.keys(updateBodyOf(before, draft, initialFields)).length > 0;

/**
 * Czy ten zapis PROBUJE wyłączyć jednostkę, na której ktoś jeszcze lata.
 *
 * Pytanie zadaje ekran, bo ma liczbę otwartych sesji z listy - i zadaje je PRZED
 * wysłaniem, żeby powiedzieć powód przy przycisku zamiast czekać na `409`.
 * Serwer pilnuje tego niezależnie: jego odpowiedź jest prawdą, ta funkcja - uprzejmością.
 */
export function disablesAircraftInUse(
  before: AircraftListItemDto,
  draft: AircraftDraft,
): boolean {
  return (
    draft.serviceStatus === 'disabled' &&
    before.serviceStatus !== 'disabled' &&
    before.openSessions > 0
  );
}

/**
 * Dlaczego NIE DA SIĘ usunąć jednostki - albo `null`, gdy próba ma sens.
 *
 * Sprawdzamy WYŁĄCZNIE stan służby, bo tylko on jest widoczny z listy. Drugiego
 * warunku (brak historii) panel nie zna i nie zgaduje - wraca odmową serwera.
 *
 * Pytamy o stan ZAPISANY, nie o szkic: dopóki „Wyłączony" nie jest zapisane, telefony
 * o nim nie wiedzą - a to na nich opiera się cała dwustopniowość tej operacji.
 */
export function deleteBlocker(aircraft: AircraftListItemDto): string | null {
  return aircraft.serviceStatus === 'disabled' ? null : AIRCRAFT_IN_SERVICE;
}
