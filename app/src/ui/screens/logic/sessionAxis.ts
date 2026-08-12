/**
 * UZ Aero — sesja → OŚ CZASU ekranu 10 (mockup `design/10-statystyki.html`).
 *
 * ══ CO ZASTĄPIŁA (issue #38 pkt 7 i 8) ══
 * Tabelę lotów: pięć kolumn, z których dwie mówiły to samo (para godzin obok czasu lotu),
 * jedna świeciła plakietką „AUTO" w każdym wierszu, a wszystkie razem milczały o tym,
 * o co pilot pytał — kiedy silnik ruszył i kiedy stanął. Oś czasu odpowiada wprost:
 * przejęcie → uruchomienie → starty, zrzuty i lądowania → wyłączenie → zdanie.
 *
 * ══ DLACZEGO ZE STRUMIENIA, A NIE Z SAMEJ PROJEKCJI ══
 * Bo wiersz osi ma prowadzić do KOREKTY, a korekta celuje w konkretne zdarzenie po uuid.
 * Projekcja niesie uuid startów i lądowań (`Flight`), ale nie zna adresu uruchomienia
 * silnika ani zrzutu — te bierzemy ze strumienia EFEKTYWNEGO (po korektach 04c), czyli
 * dokładnie tego, który projekcja policzyła.
 *
 * Kolejność ustala CZAS, nie typ zdarzenia: sesja z wpisem ręcznym potrafi mieć lądowanie
 * zapisane po zatrzymaniu silnika, a oś ma pokazać, jak było, nie jak być powinno.
 * Remisy rozstrzyga ranga (`RANK`) — przy zdarzeniach co do sekundy równych jedyny
 * sensowny porządek jest przyczynowy: nie ma startu przed uruchomieniem silnika.
 */

import { applyCorrections } from '../../../domain';
import type { Event, EventOf, MhFormat, SessionState } from '../../../domain';
import { hhmm, litres, motoHours, thousands, timeUtc } from '../../format';

/** Rodzaj punktu na osi — steruje kolorem kropki i tonem napisu. */
export type AxisKind =
  | 'claim'
  | 'engineStart'
  | 'takeoff'
  | 'drop'
  | 'landing'
  | 'engineStop'
  | 'release';

/** Jeden wiersz osi. */
export interface AxisRow {
  /** Klucz listy; dla wierszy korygowalnych = uuid zdarzenia (cel arkusza 04c). */
  id: string;
  kind: AxisKind;
  /** Stempel do sortowania. Po napisie „08:20" sortować się NIE DA: sesja spod północy
   *  ustawiłaby się od końca, a i tak trzeba by rozstrzygać remisy. */
  at: number;
  /** „08:20" — czas UTC, jak cała reszta aplikacji. */
  time: string;
  /** „Start", „Lądowanie", „Zrzut 2". */
  name: string;
  /** Druga linia: „lot 1", „4 skoczków · 12 800 ft", „odczyt 150 L · 1 234:30". */
  sub: string | null;
  /** Czas lotu przy lądowaniu („00:41"); `null` wszędzie indziej. */
  duration: string | null;
  /** Wpis ręczny — jedyny stan, który dostaje plakietkę (issue #38 pkt 10). */
  manual: boolean;
  /** Czy wiersz ma ołówek: przejęcie i zdanie korygujemy odczytami, nie czasem. */
  correctable: boolean;
}

/** Kafelek stopki osi. */
export interface AxisFootItem {
  key: string;
  value: string;
  /** Wyróżnienie zielenią — jeden kafelek na stopkę, żeby akcent coś znaczył. */
  accent: boolean;
}

/** Oś razem ze stopką — wszystko, co rysuje karta „Przebieg sesji". */
export interface SessionAxis {
  rows: AxisRow[];
  foot: AxisFootItem[];
}

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

/**
 * Porządek przyczynowy przy identycznych stemplach czasu. Nie jest to kosmetyka:
 * `engine_start` i pierwszy `takeoff` wpisane ręcznie na tę samą minutę ustawiłyby się
 * losowo, a oś czytana z góry na dół sugerowałaby start przed uruchomieniem silnika.
 */
const RANK: Record<AxisKind, number> = {
  claim: 0,
  engineStart: 1,
  takeoff: 2,
  drop: 3,
  landing: 4,
  engineStop: 5,
  release: 6,
};

/**
 * Buduje oś sesji.
 *
 * @param projection stan sesji (odczyty, loty, sumy).
 * @param events surowy strumień sesji — korekty nakładamy tutaj.
 * @param now do policzenia „trzymany", gdy sesja jeszcze nie została zdana.
 */
export function buildSessionAxis(
  projection: SessionState,
  events: Event[],
  now: number,
): SessionAxis {
  const effective = applyCorrections(events);
  const mhFormat: MhFormat = projection.mhFormat ?? 'decimal';

  const rows: AxisRow[] = [];

  if (projection.claimedAt != null) {
    rows.push({
      id: 'claim',
      kind: 'claim',
      at: projection.claimedAt,
      time: timeUtc(projection.claimedAt),
      name: 'Przejęcie',
      sub: readingLine(projection.fuel.startL, projection.mh.start, mhFormat),
      duration: null,
      manual: false,
      correctable: false,
    });
  }

  for (const event of effective) {
    if (event.type === 'engine_start' || event.type === 'engine_stop') {
      rows.push({
        id: event.uuid,
        kind: event.type === 'engine_start' ? 'engineStart' : 'engineStop',
        at: at(event),
        time: timeUtc(at(event)),
        name: event.type === 'engine_start' ? 'Uruchomienie' : 'Wyłączenie',
        sub: null,
        duration: null,
        manual: false,
        correctable: true,
      });
    }

    if (event.type === 'drop') {
      const drop = event as EventOf<'drop'>;
      rows.push({
        id: drop.uuid,
        kind: 'drop',
        at: at(drop),
        time: timeUtc(at(drop)),
        name: `Zrzut ${drop.payload.dropNumber}`,
        sub: dropLine(drop.payload.jumpers, drop.payload.altitudeFt),
        duration: null,
        manual: false,
        correctable: true,
      });
    }
  }

  for (const flight of projection.flights) {
    const manual = flight.method === 'manual';
    rows.push({
      id: flight.takeoffUuid,
      kind: 'takeoff',
      at: flight.takeoffAt,
      time: timeUtc(flight.takeoffAt),
      name: 'Start',
      sub: `lot ${flight.index}`,
      duration: null,
      manual,
      correctable: true,
    });

    // Lot w powietrzu nie ma wiersza lądowania — i to jest informacja, nie brak danych.
    // Ukrycie go schowałoby przed pilotem dokładnie ten lot, który wymaga korekty.
    if (flight.landingAt != null && flight.landingUuid != null) {
      rows.push({
        id: flight.landingUuid,
        kind: 'landing',
        at: flight.landingAt,
        time: timeUtc(flight.landingAt),
        name: 'Lądowanie',
        sub: `lot ${flight.index}`,
        duration: hhmm(flight.durationMs),
        manual,
        correctable: true,
      });
    }
  }

  if (projection.closedAt != null) {
    rows.push({
      id: 'release',
      kind: 'release',
      at: projection.closedAt,
      time: timeUtc(projection.closedAt),
      name: 'Zdanie',
      sub: readingLine(projection.fuel.endL, projection.mh.end, mhFormat),
      duration: null,
      manual: false,
      correctable: false,
    });
  }

  rows.sort((a, b) => compare(a, b));

  return { rows, foot: buildFoot(projection, now) };
}

/**
 * Stopka: cztery liczby, których nie ma nigdzie indziej na ekranie.
 *
 * Czas blokowy pada tu i TYLKO tu (issue #38 pkt 9) — przed przebudową stał w bohaterze
 * ekranu, w obu kartach załogi, w podpisie średniego zużycia i w wierszu Δ motogodzin.
 *
 * Sesja bez pracy silnika (09C) zamienia „Blok" na „Trzymany": zero w wielkiej cyfrze
 * nie jest odpowiedzią na żadne pytanie, a czas zajętości maszyny — jest.
 */
function buildFoot(projection: SessionState, now: number): AxisFootItem[] {
  const items: AxisFootItem[] = [];

  if (projection.blockTimeMs > 0) {
    items.push({ key: 'Blok', value: hhmm(projection.blockTimeMs), accent: false });
    items.push({ key: 'W powietrzu', value: hhmm(projection.flightTimeMs), accent: true });
  } else {
    const held = heldMs(projection, now);
    items.push({
      key: 'Trzymany',
      value: held == null ? '—' : hhmm(held),
      accent: false,
    });
    items.push({ key: 'Blok', value: hhmm(0), accent: false });
  }

  items.push({
    key: projection.takeoffCount === 1 ? 'Start' : 'Starty',
    value: String(projection.takeoffCount),
    accent: false,
  });

  if (projection.departureIcao != null) {
    // Przelot ma parę lotnisk, skoki jedno (issue #13) — kafelek mówi to, co wie.
    const route =
      projection.arrivalIcao != null && projection.arrivalIcao !== projection.departureIcao
        ? `${projection.departureIcao}→${projection.arrivalIcao}`
        : projection.departureIcao;
    items.push({ key: route.includes('→') ? 'Trasa' : 'Lotnisko', value: route, accent: false });
  }

  return items;
}

/** Ile maszyna była zajęta: przejęcie → zdanie, a przy sesji trwającej — do teraz. */
function heldMs(projection: SessionState, now: number): number | null {
  if (projection.claimedAt == null) return null;
  return Math.max(0, (projection.closedAt ?? now) - projection.claimedAt);
}

/**
 * Podpis wiersza przejęcia i zdania: „odczyt 150 L · 1 234:30".
 *
 * To NIE jest ozdobnik — rachunki paliwa i motogodzin niżej odwołują się do tych dwóch
 * chwil („odczyt przy przejęciu", „licznik przy zdaniu"), więc bez nich wiersze rachunku
 * wskazywałyby na moment, którego ekran nigdzie nie pokazuje. Brakujący odczyt po prostu
 * wypada z podpisu; pusty podpis znaczy „nic nie spisano" i tak też wygląda.
 */
function readingLine(fuelL: number | null, mh: number | null, format: MhFormat): string | null {
  const parts: string[] = [];
  if (fuelL != null) parts.push(`odczyt ${litres(fuelL)}`);
  if (mh != null) parts.push(motoHours(mh, format));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Podpis zrzutu — skład i wysokość są od issue #21 OPCJONALNE (`null` = niepodany,
 * nie zero), więc wiersz składa się z tego, co faktycznie zapisano.
 */
function dropLine(
  jumpers: EventOf<'drop'>['payload']['jumpers'],
  altitudeFt: EventOf<'drop'>['payload']['altitudeFt'],
): string | null {
  const parts: string[] = [];
  if (jumpers != null) {
    parts.push(`${jumpers.tandem + jumpers.aff + jumpers.solo} skoczków`);
  }
  // `thousands` z pakietu formatów, nie `toLocaleString`: ten drugi wstawia SPACJĘ
  // NIEROZDZIELAJĄCĄ i ta sama wysokość wyglądałaby inaczej niż na 05 i 14.
  if (altitudeFt != null) parts.push(`${thousands(altitudeFt)} ft`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Czas rośnie w dół; przy remisie decyduje porządek przyczynowy. */
function compare(a: AxisRow, b: AxisRow): number {
  if (a.at !== b.at) return a.at - b.at;
  return RANK[a.kind] - RANK[b.kind];
}
