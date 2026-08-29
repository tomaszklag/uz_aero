/**
 * UZ Aero - panel: „FLOTA TERAZ" - DTO → wiersze pulpitu (moduł CZYSTY).
 *
 * ══ WIERSZ NIESIE DWIE WARSTWY NARAZ ══
 * Co samolot robi (faza) i SKĄD to wiemy (świeżość). Druga jest równie ważna jak
 * pierwsza - cytat z `SZABLON.html`: „»w locie« przy syncu sprzed 47 minut to nie jest
 * wiedza o locie, tylko ostatnia znana pozycja". Dlatego klasa wiersza (`flying` /
 * `stale` / `free`) mówi o JAKOŚCI DANYCH, a nie o fazie lotu: `stale` nosi samolot,
 * który leci, ale którego telefon milczy.
 *
 * ══ „W LOCIE" JEST TU PRAWDZIWE ══
 * Na `A02` i `A07` tej plakietki NIE MA i to było słuszne: projekcja `sessions` nie
 * niesie stanu silnika, a listy tam są nieograniczone. Pulpit dostaje `engine`
 * policzone przez serwer `projectSession` na strumieniu otwartej sesji - panel nie
 * zgaduje i nie liczy, tylko formatuje. `engine == null` znaczy DOKŁADNIE „ta jednostka
 * nie ma otwartej sesji", nigdy „nie wiemy".
 *
 * ══ ZERA NIE PODSTAWIAMY ══
 * Brak odczytu to „-" i podpis „brak danych z telefonu". `0 L` byłoby twierdzeniem
 * o pustym zbiorniku, a brak odczytu nim nie jest (`CLAUDE.md`, Offline-first).
 * Liczniki fizyczne wygrywają: MH i FOB w tej tabeli są PODPOWIEDZIĄ, nie prawdą.
 */

import { dateUtcShort, duration, litres, motoHours, relativeAge, timeUtc } from '@uzaero/format';

import type { DashboardAircraftDto, EngineStateDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import type { Freshness } from '../fleet/fleetRows';
import { dayCardLink, aircraftLink } from './dashboardLinks';

/**
 * Od kiedy telefon z OTWARTYM dniem uchodzi za milczący.
 *
 * Próg PREZENTACJI, nie reguła domeny - nie wystawia flagi i nie zmienia żadnej liczby;
 * decyduje wyłącznie o kolorze wiersza. Osobny od `STALE_AFTER_MS` (24 h) z ekranu
 * floty i to jest cała jego treść: tam pytanie brzmi „czy ten odczyt jeszcze coś
 * znaczy" i doba jest w porządku, tutaj brzmi „czy wiem, co ten samolot robi TERAZ",
 * a przy otwartym locie pół godziny ciszy to już nie jest wiedza o locie.
 *
 * Mockup `A01` maluje na zielono sync sprzed 2 i 6 minut, a na bursztynowo sprzed
 * 47 - czyli stawia granicę gdzieś w tym przedziale, nie podając jej. 30 minut to
 * odczyt tej intencji i **decyzja do potwierdzenia przez człowieka**.
 */
export const OPEN_DAY_STALE_AFTER_MS = 30 * 60 * 1000;

export interface FleetBadge {
  text: string;
  tone: PillTone;
  /** Kropka pulsująca - stan TRWAJĄCY. Puls bez trwania byłby ozdobą. */
  live?: boolean;
}

/**
 * Nastrój wiersza. Nazwy są nazwami MODYFIKATORÓW z `SZABLON.html`, bo to po nich
 * grepuje recenzent porównujący DOM z mockupem.
 */
export type FleetMood = 'flying' | 'ground' | 'stale' | 'free';

/**
 * Klasa wiersza jako CAŁY literał, a nie sklejenie.
 *
 * Reguła z `admin/test/architecture.test.ts`: nazwa klasy nie powstaje z kawałków.
 * Mapa daje cztery pełne napisy, które da się wygrepować jednocześnie w panelu
 * i w mockupie - a `.tsx` dostaje gotowy `className` i nie podejmuje decyzji.
 */
const ROW_CLASS: Record<FleetMood, string> = {
  flying: 'fleet-row flying',
  ground: 'fleet-row',
  stale: 'fleet-row stale',
  free: 'fleet-row free',
};

/**
 * Klasa wartości świeżości (`.fresh-val` z `SZABLON.html`) - trzy stany, trzy pełne
 * literały. To jest ta sama reguła, co `freshClass` na ekranie floty, tylko dla innego
 * bloku: tam podpis komórki tabeli (`.cell-sub`), tu prawa kolumna wiersza floty.
 */
const FRESH_CLASS: Record<Freshness, string> = {
  fresh: 'fresh-val',
  stale: 'fresh-val amber',
  none: 'fresh-val dim',
};

export function rowClass(mood: FleetMood): string {
  return ROW_CLASS[mood];
}

export function freshValClass(freshness: Freshness): string {
  return FRESH_CLASS[freshness];
}

export interface FleetNowRow {
  id: string;
  reg: string;
  type: string;
  mood: FleetMood;
  /** Gotowa klasa wiersza - `.tsx` niczego nie skleja. */
  rowClass: string;
  /** Kto trzyma samolot albo dlaczego nikt. */
  who: string;
  /** „claim 07:58 · zajęty 6:24 · EPKK · dual: M. Bąk" - jedna linia opisu. */
  since: string;
  /** Ostatni znany odczyt licznika, sformatowany WG KONFIGURACJI jednostki. */
  mh: string;
  fuel: string;
  badge: FleetBadge;
  freshness: Freshness;
  /** Gotowa klasa wartości świeżości. */
  freshClass: string;
  /** „sync 2 min temu" / „przekazanie 30 Jul 2026" / „brak zdarzeń w rejestrze". */
  freshText: string;
  /** Druga linia świeżości: „lot 4 · T/O 14:11", „silnik OFF 14:04", „z day_close". */
  freshNote: string;
  /** Dokąd prowadzi wiersz - karta dnia albo szuflada jednostki. */
  to: string;
}

/**
 * `nowMs` przychodzi z `DashboardDto.at`, czyli z ZEGARA SERWERA - nie z `Date.now()`.
 * Stemple, z którymi je porównujemy, nadaje baza; zegar przeglądarki byłby w tym
 * równaniu trzecim i jedynym niesprawdzonym.
 */
export function fleetNowRows(
  items: readonly DashboardAircraftDto[],
  nowMs: number,
): FleetNowRow[] {
  return items.map((item) => {
    const { aircraft, engine } = item;
    const syncMs = parseStamp(aircraft.lastEventAt);
    const mood = moodOf(item, syncMs, nowMs);
    const freshness = freshnessOf(item, syncMs, nowMs);

    return {
      id: aircraft.id,
      reg: aircraft.reg,
      type: aircraft.type,
      mood,
      rowClass: rowClass(mood),
      who: whoOf(item),
      since: sinceOf(item, nowMs),
      mh: aircraft.reading == null ? DASH : motoHours(aircraft.reading.mh, aircraft.mhFormat),
      fuel: aircraft.reading == null ? DASH : litres(aircraft.reading.fuelL),
      badge: badgeOf(item, mood),
      freshness,
      freshClass: freshValClass(freshness),
      freshText: freshTextOf(item, syncMs, nowMs),
      freshNote: freshNoteOf(item, engine),
      to: engine == null ? aircraftLink(aircraft.id) : dayCardLink(engine.sessionUuid),
    };
  });
}

/** Brak danych. Nigdy `0`, nigdy pusty napis - to jest cała reguła tej stałej. */
const DASH = '-';

function moodOf(item: DashboardAircraftDto, syncMs: number | null, nowMs: number): FleetMood {
  if (item.engine == null) return 'free';
  // Milczący telefon wygrywa nad fazą lotu: „w locie" przy syncu sprzed godziny nie
  // jest wiedzą o locie, tylko ostatnią znaną pozycją.
  if (syncMs == null || nowMs - syncMs > OPEN_DAY_STALE_AFTER_MS) return 'stale';
  return item.engine.inFlight || item.engine.engineRunning ? 'flying' : 'ground';
}

function freshnessOf(
  item: DashboardAircraftDto,
  syncMs: number | null,
  nowMs: number,
): Freshness {
  if (syncMs == null) return 'none';
  // Jednostka WOLNA nie ma prawa świecić na bursztyn od samego wieku: przy zamkniętym
  // dniu liczniki po prostu stoją, a stara wartość jest tak samo prawdziwa jak wczoraj
  // (mockup A01a mówi to wprost). Bursztyn należy się dopiero staremu odczytowi
  // z sesji, która WCIĄŻ JEST OTWARTA.
  if (item.engine == null) return 'none';
  return nowMs - syncMs > OPEN_DAY_STALE_AFTER_MS ? 'stale' : 'fresh';
}

function whoOf(item: DashboardAircraftDto): string {
  const { aircraft } = item;
  if (aircraft.claim != null) {
    return aircraft.claim.picName ?? aircraft.claim.picCode ?? aircraft.claim.picId;
  }
  return aircraft.serviceStatus === 'disabled' ? 'Wyłączony ze służby' : 'Wolny - bez claimu';
}

/** Druga linia opisu: skąd i od kiedy. Kropki rozdzielają fakty, nie zdania. */
function sinceOf(item: DashboardAircraftDto, nowMs: number): string {
  const { aircraft, engine } = item;

  if (engine == null) {
    if (aircraft.reading == null) return 'nigdy nie przejmowany';
    const who = aircraft.reading.byPilotName ?? aircraft.reading.byPilotId;
    return `ostatni odczyt: ${who} · ${dateUtcShort(aircraft.reading.at)} ${timeUtc(aircraft.reading.at)}`;
  }

  const parts: string[] = [];
  if (engine.claimedAt == null) {
    // Sesja bez `session_claim` to rejestr NIEKOMPLETNY (§4.4 mówi, że każda sesja
    // zaczyna się claimem) - nie ma wtedy ani daty, ani czego liczyć.
    parts.push('claim bez daty w rejestrze');
  } else {
    parts.push(`claim ${timeUtc(engine.claimedAt)}`);
    // „zajęty", nie „duty": ta liczba mierzy, jak długo MASZYNA jest w czyichś rękach.
    // Służba pilota jest jego klamrą i potrafi objąć kilka maszyn (§3.6a), więc na
    // wierszu floty byłaby pomyłką kategorii.
    parts.push(`zajęty ${duration(Math.max(0, nowMs - engine.claimedAt))}`);
  }
  if (engine.departureIcao != null) parts.push(engine.departureIcao);
  if (engine.dualId != null) parts.push(`dual: ${engine.dualName ?? engine.dualId}`);
  return parts.join(' · ');
}

function badgeOf(item: DashboardAircraftDto, mood: FleetMood): FleetBadge {
  if (item.aircraft.serviceStatus === 'disabled' && item.engine == null) {
    return { text: 'Poza służbą', tone: 'dim' };
  }
  switch (mood) {
    case 'flying':
      // Puls TYLKO tutaj: to jedyny stan, który trwa na oczach patrzącego.
      return item.engine?.inFlight === true
        ? { text: 'W locie', tone: 'green', live: true }
        : { text: 'Silnik pracuje', tone: 'green', live: true };
    case 'stale':
      return { text: 'Dane w drodze', tone: 'amber' };
    case 'ground':
      return { text: 'Na ziemi', tone: 'blue' };
    case 'free':
      return { text: 'Wolny', tone: 'dim' };
  }
}

function freshTextOf(
  item: DashboardAircraftDto,
  syncMs: number | null,
  nowMs: number,
): string {
  if (syncMs == null) return 'brak zdarzeń w rejestrze';
  if (item.engine != null) return `sync ${relativeAge(Math.max(0, nowMs - syncMs))} temu`;
  if (item.aircraft.reading == null) return `sync ${relativeAge(Math.max(0, nowMs - syncMs))} temu`;
  // Jednostka wolna: interesuje nas moment PRZEKAZANIA, a nie wiek ostatniej paczki -
  // to on jest źródłem liczb w tym wierszu.
  return `przekazanie ${dateUtcShort(item.aircraft.reading.at)}`;
}

function freshNoteOf(item: DashboardAircraftDto, engine: EngineStateDto | null): string {
  if (engine == null) {
    if (item.aircraft.serviceStatus === 'disabled') return 'historia zostaje';
    if (item.aircraft.reading == null) return 'brak danych z telefonu';
    return item.aircraft.reading.source === 'handover' ? 'z day_close' : 'z otwartej sesji';
  }
  if (engine.eventCount === 0) return 'claim bez ani jednego zdarzenia';
  if (engine.inFlight && engine.openTakeoffAt != null) {
    return `lot ${engine.flightsCount} · T/O ${timeUtc(engine.openTakeoffAt)}`;
  }
  if (engine.engineRunning) return `silnik pracuje · lotów ${engine.flightsCount}`;
  if (engine.engineStoppedAt != null) return `silnik OFF ${timeUtc(engine.engineStoppedAt)}`;
  return engine.lastEventAt == null
    ? 'dzień otwarty, bez zdarzeń'
    : `ostatnie zdarzenie ${timeUtc(engine.lastEventAt)}`;
}

/** ISO 8601 z serwera → epoch ms; wartość nieczytelna traktujemy jak brak. */
function parseStamp(value: string | null): number | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export interface EmptyCopy {
  title: string;
  note: string;
}

/** Klub bez ani jednej jednostki - pilot nie ma czego wybrać na preflight. */
export const FLEET_EMPTY: EmptyCopy = {
  title: 'BRAK JEDNOSTEK W REJESTRZE',
  note: 'Pulpit nie ma czego pokazać, bo w rejestrze floty nie ma ani jednego samolotu. Pierwszą jednostkę dodaje się na ekranie floty albo seedem.',
};
