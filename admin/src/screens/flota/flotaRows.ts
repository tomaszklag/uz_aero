/**
 * UZ Aero — panel: DTO floty → wiersze tabeli `A07` (moduł CZYSTY).
 *
 * Ekran jest `.tsx` bez decyzji o treści: plakietki, podpisy i to, który odczyt jest
 * nieświeży, rozstrzyga się tutaj i ma test w Node.
 *
 * ══ TRZY STANY ŚWIEŻOŚCI, NIGDY DWA ══
 * Reguła z `CLAUDE.md` (Offline-first, pkt 2) obowiązuje w panelu tak samo jak
 * w telefonie: `live` (bez adnotacji) / `cache` (z wiekiem, amber) / `brak`
 * („brak danych"). Kolumny „Claim teraz", „Ostatnie MH" i „Ostatni FOB" przychodzą
 * Z TELEFONÓW wraz ze zdarzeniami, więc każda z nich musi umieć powiedzieć „nie wiem".
 * **Zera za brak nie podstawiamy nigdy** — `0 L` w kolumnie paliwa jest twierdzeniem
 * o pustym zbiorniku, a brak odczytu nim nie jest.
 *
 * ══ DLACZEGO „ZAJĘTY", A NIE „W LOCIE" ══
 * Mockup A07 podpisuje aktywny claim plakietką „W locie". Projekcja `sessions` nie
 * niesie stanu silnika — to ta sama granica, o którą rozbił się chip „W locie" na
 * liście dni (`A02`, baner „Plakietki »W locie« nie ma"). Claim znaczy „ktoś zajął
 * jednostkę na dziś"; czy w tej chwili kołuje, czy stoi na płycie, serwer nie wie,
 * a panel nie zgaduje. Rozjazd sprostowany jawnie w mockupie (sekcja „Sprostowanie
 * z 2026-08-01").
 */

import { dateUtcShort, litres, motoHours, relativeAge, timeUtc } from '@uzaero/format';

import type { AircraftListItemDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import { dayLink, type DayLink } from './flotaFilters';

/**
 * Od kiedy odczyt z telefonu dostaje kolor amber.
 *
 * Próg PREZENTACJI, nie reguła domeny — mockup A07 mówi wprost: „Wpis starszy niż 24 h
 * dostaje kolor amber; to nie awaria, tylko informacja, że samolot od tego czasu mógł
 * stać albo lecieć bez zasięgu". Dlatego liczba mieszka tutaj, a nie w `tolerances.ts`:
 * nie wpływa na żadną flagę ani na żadną liczbę dnia. Progi, które coś rozstrzygają,
 * przychodzą z serwera (`fuelToleranceL`).
 */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface FleetBadge {
  text: string;
  tone: PillTone;
  dot?: boolean;
}

/** Trzy stany świeżości §4.8 — `live` / `cache` / `brak` pod nazwami z `SZABLON.html`. */
export type Freshness = 'fresh' | 'stale' | 'none';

/**
 * Klasa podpisu komórki: `cell-sub` + modyfikator świeżości.
 *
 * Nazwa klasy jest DECYZJĄ O TREŚCI, więc mieszka w module czystym z testem, a nie
 * w interpolacji w `.tsx`. Powód nie jest estetyczny: do 2026-08-01 ekran `A07`
 * sklejał `` `cell-sub fresh-${freshness}` ``, czyli wypisywał `fresh-stale` —
 * klasę, której nie definiuje ani `SZABLON.html`, ani żaden arkusz panelu. Trzy stany
 * były policzone, przetestowane i NIEWIDOCZNE. Modyfikatory nazywają się tak samo jak
 * stany, bo tak nazywa je szablon (`.cell-sub.fresh/.stale/.none`) — a reguła „mockup
 * wygrywa" dotyczy też nazw klas, bo to po nich grepuje recenzent.
 */
export function freshClass(freshness: Freshness): string {
  return `cell-sub ${freshness}`;
}

/** Wartość z podpisem świeżości — wspólny kształt trzech kolumn stanu. */
export interface FreshCell {
  /** Główna wartość albo „—", gdy jej nie ma. */
  text: string;
  /** Podpis pod wartością; `null` = nic do dodania. */
  sub: string | null;
  /** Ton podpisu: `fresh` (zielony), `stale` (amber), `none` (przygaszony). */
  freshness: Freshness;
}

export interface FleetRow {
  id: string;
  reg: string;
  type: string;
  /** Rok albo „—": kolumna `aircraft.year` jest `NULL`-owalna. */
  year: string;
  capacity: string;
  /** Próg `FUEL_MISMATCH` policzony PRZEZ SERWER — panel go wyłącznie formatuje. */
  tolerance: string;
  mhFormat: FleetBadge;
  /** `null` = Dual nieobowiązkowy; kolumna pokazuje wtedy kreskę. */
  dual: FleetBadge | null;
  service: FleetBadge & { sub: string | null };
  claim: FreshCell & { badge: FleetBadge; sessionUuid: string | null };
  mh: FreshCell;
  fuel: FreshCell;
  /** Przejście do dni tej jednostki — ma je KAŻDY wiersz (patrz `dayLink`). */
  day: DayLink;
  /** `true` = jednostka wyłączona ze służby; cały wiersz jest przygaszony (mockup A07). */
  dim: boolean;
  /** Surowe DTO — szuflada otwiera wiersz, który już jest na liście. */
  dto: AircraftListItemDto;
}

const MH_BADGE: Record<'decimal' | 'hhmm', FleetBadge> = {
  decimal: { text: 'decimal', tone: 'dim' },
  hhmm: { text: 'hh:mm', tone: 'blue' },
};

export function fleetRows(items: readonly AircraftListItemDto[], now: number): FleetRow[] {
  return items.map((dto) => {
    const claim = claimCell(dto, now);
    return {
      id: dto.id,
      reg: dto.reg,
      type: dto.type,
      year: dto.year == null ? '—' : String(dto.year),
      capacity: litres(dto.capacityL),
      tolerance: toleranceText(dto.fuelToleranceL),
      mhFormat: MH_BADGE[dto.mhFormat],
      dual: dto.dualRequired ? { text: 'wymagany', tone: 'amber' } : null,
      service: serviceCell(dto),
      claim,
      mh: mhCell(dto, now),
      fuel: fuelCell(dto, now),
      day: dayLink(dto.id, claim.sessionUuid),
      dim: dto.serviceStatus === 'disabled',
      dto,
    };
  });
}

/**
 * Próg jako „±62.9 L".
 *
 * Jedno miejsce po przecinku, bo tyle znaczy 5% z pojemności podanej w pełnych litrach,
 * a `litres()` zaokrągliłoby `62.85` do `63` — czyli pokazałoby liczbę, której serwer
 * nie wysłał, w miejscu, gdzie chodzi właśnie o dokładny próg. Zaokrąglenie mieszka
 * w module czystym z testem, nigdy w `.tsx` (test architektury tego pilnuje).
 */
export function toleranceText(toleranceL: number): string {
  return `±${toleranceL.toFixed(1)} L`;
}

function serviceCell(dto: AircraftListItemDto): FleetBadge & { sub: string | null } {
  if (dto.serviceStatus === 'disabled') {
    return {
      text: 'Wyłączony',
      tone: 'red',
      dot: true,
      // Mockup ma tu „od 19 JUN 2026 · remont". Daty wyłączenia ani powodu nie ma
      // w bazie — `aircraft.updated_at` mówi „kiedy ruszono wiersz", nie „od kiedy
      // stoi", a powód mieszka w dzienniku audytu. Zamiast wpisać cudzą wielkość pod
      // tą etykietą, mówimy tyle, ile wiadomo.
      //
      // Stan „wyłączony, a dzień otwarty" jest OSIĄGALNY (patrz `disabledOpenDays`)
      // i do 2026-08-01 nie zgłaszał go nic: kolumna mówiła „nie pojawia się na
      // liście wyboru" obok plakietki „Zajęty". Dwie prawdy w jednym wierszu bez
      // słowa o tym, że się wykluczają.
      sub:
        dto.openSessions > 0
          ? 'wyłączony, a dzień wciąż otwarty'
          : 'nie pojawia się na liście wyboru',
    };
  }
  return { text: 'W służbie', tone: 'green', dot: true, sub: null };
}

/**
 * Jednostki WYŁĄCZONE, które mimo to mają otwarty dzień — `null`, gdy nie ma takich.
 *
 * ══ DLACZEGO TO W OGÓLE MOŻE ZAJŚĆ ══
 * Wyłączenie ze służby nie jest bramką na `POST /events` i być nią nie może: rejestr
 * jest append-only i przyjmuje FAKTY z terenu, a odrzucenie paczki złamałoby regułę
 * nadrzędną („brak sieci NIGDY nie blokuje pracy pilota", `CLAUDE.md`) i zgubiłoby
 * dane o locie, który i tak się odbył. Blokada działa na telefonach, KTÓRE POBRAŁY
 * świeżą konfigurację — telefon z cache'em referencyjnym sprzed wyłączenia otworzy
 * dzień mimo blokady w panelu.
 *
 * Ten baner jest JEDYNĄ informacją, po której administrator się o tym dowie.
 */
export interface DisabledOpenDays {
  regs: string[];
  /** Zdanie do banera — z odmienioną liczbą jednostek. */
  text: string;
}

export function disabledOpenDays(items: readonly AircraftListItemDto[]): DisabledOpenDays | null {
  const regs = items
    .filter((item) => item.serviceStatus === 'disabled' && item.openSessions > 0)
    .map((item) => item.reg);
  if (regs.length === 0) return null;

  const what =
    regs.length === 1
      ? 'jest wyłączony ze służby, a mimo to ma otwarty dzień lotny'
      : 'są wyłączone ze służby, a mimo to mają otwarty dzień lotny';
  return {
    regs,
    text: `${regs.join(' · ')} ${what}. Blokada wyboru działa na telefonach, które pobrały świeżą konfigurację; telefon z cache'em referencyjnym sprzed wyłączenia potrafi otworzyć dzień mimo niej. Zdarzenia z terenu przyjmujemy zawsze — dzień domknie się normalnie i trafi na listę dni lotnych.`,
  };
}

/**
 * Claim: zajęty / wolny / nie do wyboru.
 *
 * Jednostka wyłączona ze służby dostaje własny stan, bo jej „wolny" znaczyłoby coś
 * nieprawdziwego — nikt jej nie weźmie, bo nie ma jej na liście wyboru.
 */
function claimCell(
  dto: AircraftListItemDto,
  now: number,
): FreshCell & { badge: FleetBadge; sessionUuid: string | null } {
  if (dto.claim != null) {
    const who = dto.claim.picName ?? dto.claim.picCode ?? dto.claim.picId;
    const since = dto.claim.since == null ? 'bez preflightu' : `od ${timeUtc(dto.claim.since)} UTC`;
    return {
      badge: { text: 'Zajęty', tone: 'green', dot: true },
      text: who,
      sub: since,
      freshness: syncFreshness(dto.lastEventAt, now),
      sessionUuid: dto.claim.sessionUuid,
    };
  }

  if (dto.serviceStatus === 'disabled') {
    return {
      badge: { text: 'nie do wyboru', tone: 'dim' },
      text: '—',
      sub: 'wyłączony ze służby',
      freshness: 'none',
      sessionUuid: null,
    };
  }

  return {
    badge: { text: 'wolny', tone: 'dim' },
    text: '—',
    sub: dto.reading == null ? 'nigdy nie przejmowany' : `zwolniony ${stamp(dto.reading.at)}`,
    freshness: dto.reading == null ? 'none' : syncFreshness(dto.lastEventAt, now),
    sessionUuid: null,
  };
}

/** Ostatni odczyt licznika — formatowany WEDŁUG konfiguracji tej jednostki. */
function mhCell(dto: AircraftListItemDto, now: number): FreshCell {
  if (dto.reading == null) return NO_DATA;
  return {
    text: motoHours(dto.reading.mh, dto.mhFormat),
    sub: syncNote(dto.lastEventAt, now),
    freshness: syncFreshness(dto.lastEventAt, now),
  };
}

/** Ostatni znany stan paliwa razem z tym, SKĄD go znamy. */
function fuelCell(dto: AircraftListItemDto, now: number): FreshCell {
  if (dto.reading == null) return NO_DATA;
  const source =
    dto.reading.source === 'open_session'
      ? 'sesja otwarta'
      : `przekazanie · ${relativeAge(Math.max(0, now - dto.reading.at))}`;
  return {
    text: litres(dto.reading.fuelL),
    sub: source,
    freshness: syncFreshness(dto.lastEventAt, now),
  };
}

/** Trzeci stan świeżości: „brak danych". Nigdy zero, nigdy pusty napis. */
const NO_DATA: FreshCell = { text: '—', sub: 'brak danych z telefonu', freshness: 'none' };

/**
 * Wiek OSTATNIEGO SYNCU, nie wiek odczytu — i to jest różnica, którą ekran ma
 * komunikować. Odczyt sprzed doby przy syncu sprzed trzech minut znaczy „samolot stoi";
 * ten sam odczyt przy telefonie milczącym od wczoraj znaczy „nie wiemy, co się dzieje".
 */
function syncNote(lastEventAt: string | null, now: number): string | null {
  const ms = parseStamp(lastEventAt);
  if (ms == null) return 'brak zdarzeń w rejestrze';
  return `sync ${relativeAge(Math.max(0, now - ms))} temu`;
}

function syncFreshness(lastEventAt: string | null, now: number): Freshness {
  const ms = parseStamp(lastEventAt);
  if (ms == null) return 'none';
  return now - ms > STALE_AFTER_MS ? 'stale' : 'fresh';
}

/** ISO 8601 z serwera → epoch ms; wartość nieczytelna traktujemy jak brak. */
function parseStamp(value: string | null): number | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** „30 Jul 2026 18:41" — data i godzina UTC w jednym podpisie kolumny. */
function stamp(ms: number): string {
  return `${dateUtcShort(ms)} ${timeUtc(ms)} UTC`;
}

export interface EmptyCopy {
  title: string;
  note: string;
}

/**
 * Pusta lista mówi CO INNEGO przy zawężeniu niż bez niego. Bez tego rozróżnienia
 * administrator patrzący na pusty ekran nie wie, czy klub nie ma samolotów, czy jego
 * filtr ich nie pokazuje.
 */
export function flotaEmpty(narrowed: boolean): EmptyCopy {
  if (narrowed) {
    return {
      title: 'ŻADNA JEDNOSTKA NIE PASUJE',
      note: 'Zdejmij zawężenie albo popraw wyszukiwanie. Samolotów nie kasujemy — wyłączenie ze służby zabiera jednostkę z listy wyboru w aplikacji, a wiersz zostaje.',
    };
  }
  return {
    title: 'BRAK JEDNOSTEK',
    note: 'W rejestrze nie ma ani jednego samolotu, więc pilot nie ma czego wybrać na preflight. Pierwszą jednostkę dodaje się tutaj albo seedem.',
  };
}
