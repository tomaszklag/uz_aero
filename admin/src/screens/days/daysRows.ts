/**
 * UZ Aero — panel: wiersz listy dni, DTO → treść komórek (moduł CZYSTY).
 *
 * ══ WIERSZ OPISUJE SESJĘ SAMOLOTU, NIE DZIEŃ SŁUŻBY ══
 * Po §3.6a jednostką listy jest odcinek PRZEJĘCIE → ZDANIE jednej maszyny. Klamra
 * służby należy do PILOTA, potrafi objąć kilka samolotów i nie jest właściwością
 * żadnego z tych wierszy — dlatego nie ma tu kolumny „duty" i nie może jej być.
 * Konsekwencja praktyczna: dwie zmiany na jednej maszynie tego samego dnia to dwa
 * wiersze z tą samą datą, więc odróżnia je godzina przejęcia (patrz `dayCell`).
 *
 * ══ PORZĄDEK LISTY NIE JEST WŁASNOŚCIĄ TEGO PLIKU ══
 * Sesje przychodzą posortowane przez serwer po chwili przejęcia (`sessions.claim_time`,
 * `NULLS LAST`, kierunek z parametru `sort`). Ta funkcja MAPUJE i nie sortuje — lista
 * jest przycięta `LIMIT`-em i sklejona z kolejnych stron kursora, więc przesortowanie
 * tego, co przyszło, przestawiłoby wiersze wewnątrz przypadkowego wycinka i rozjechało
 * się z kursorem, który opisuje pozycję w PORZĄDKU SERWERA.
 *
 * ══ TEN PLIK NICZEGO NIE LICZY ══
 * Każda liczba (`blockMs`, `flightMs`, `mhStart`, `fuelEndL`, `flightsCount`) jest
 * przepisana z projekcji i tu wyłącznie FORMATOWANA przez `@uzaero/format`. Jedyna
 * arytmetyka to odjęcie dwóch stempli, żeby powiedzieć „sync 24 min temu" — czyli
 * to samo, co robi `flagRows.ts` z wiekiem sprawy.
 */

import type { MhFormat } from '@uzaero/domain';
import {
  dateUtcShort,
  hhmm,
  litres,
  motoHours,
  plural,
  relativeAge,
  shortName,
  timeUtc,
} from '@uzaero/format';

import type { SessionListItemDto } from '../../api/dto';
import type { PillTone } from '../../ui/components/Pill';
import { OPERATION_META } from './operations';

export interface DayStatePill {
  tone: PillTone;
  text: string;
  /** Kropka tylko przy stanie, który TRWA (dzień otwarty, otwarta flaga). */
  dot: boolean;
  /** Druga linia komórki — czym ten stan jest w szczegółach. */
  sub: string | null;
}

export interface DayRow {
  sessionUuid: string;
  /** Adres karty dnia — wiersz jest linkiem, nie tylko obszarem klikalnym. */
  href: string;
  /** Dzień z OTWARTĄ flagą — mockup wyróżnia taki wiersz tłem (`tr.flagged`). */
  flagged: boolean;

  day: { text: string; sub: string };
  aircraft: { reg: string; type: string | null };
  /** `null` = sesja bez `preflight_confirm`, czyli bez zadeklarowanej operacji. */
  operation: { tone: PillTone; badge: string; client: string | null } | null;
  crew: { pic: string; sub: string };

  block: string;
  flight: string;
  flights: string;
  mh: { text: string; sub: string };
  fuel: string;

  state: DayStatePill;
}

/**
 * Skąd wiadomo, w jakim formacie są motogodziny — i co znaczy, gdy nie wiadomo.
 *
 * `motoHours(value, null)` wypisuje liczbę dziesiętnie, bo czymś musi. Podpis
 * odróżnia ten przypadek od samolotu z licznikiem dziesiętnym: pierwszy to wiedza,
 * drugi to fallback, a administrator porównujący wartość z licznikiem w kabinie
 * ma prawo wiedzieć, który właśnie ogląda.
 */
function mhFormatLabel(format: MhFormat | null): string {
  if (format === 'hhmm') return 'licznik hh:mm';
  if (format === 'decimal') return 'licznik dziesiętny';
  return 'format licznika nieznany';
}

/**
 * Kolumna „Dzień · UTC". Data pochodzi z CHWILI PRZEJĘCIA (`claimedAt`), bo to ona
 * przypisuje sesję do doby — i tak samo działa filtr zakresu po stronie bazy.
 *
 * ══ PODPIS NIESIE CAŁY ODCINEK SESJI, NIE JEDEN JEJ KONIEC ══
 * Do etapu D stało tu „zamknięty 11:02" — sam koniec. Wystarczało, dopóki sesja trwała
 * cały dzień lotny. Po §3.6a jedna maszyna bierze w dobie DWIE zmiany (poranną
 * i popołudniową), więc dwa wiersze mają tę samą rejestrację i tę samą datę w kolumnie
 * „Dzień": bez godziny przejęcia administrator nie ma jak ich odróżnić, a właśnie to
 * pytanie zadaje, patrząc na listę. Podpis mówi więc „06:12 → 11:02", a przy sesji
 * trwającej „06:12 → trwa" — bo koniec, którego nie ma, nie jest brakiem danych.
 *
 * Sesja bez `session_claim` NIE MA daty i panel to mówi wprost. Wywnioskowanie jej
 * z `closeTime` albo z czasu pierwszego zdarzenia byłoby zgadywaniem w narzędziu,
 * którego jedynym zadaniem jest nie zgadywać — i rozjechałoby się z filtrem, który
 * takich sesji po prostu nie widzi.
 */
function dayCell(day: SessionListItemDto): { text: string; sub: string } {
  if (day.claimedAt == null) {
    return { text: '—', sub: 'bez claimu · poza zakresem dat' };
  }
  const sub = `${timeUtc(day.claimedAt)} → ${day.closeTime == null ? 'trwa' : timeUtc(day.closeTime)}`;
  return { text: dateUtcShort(day.claimedAt), sub };
}

/**
 * Kolumna „Stan" — jedna plakietka na sesję, w kolejności PILNOŚCI.
 *
 * Otwarta flaga wygrywa z każdym innym stanem, także z „wyeksportowany": sesja
 * z rozbieżnością jest sprawą dla człowieka niezależnie od tego, czy karta poszła
 * do arkusza. Dopiero potem liczy się, czy sesja trwa, a na końcu — czy ma kartę.
 *
 * Czego tu NIE MA: plakietki „W locie". Wymaga wiedzy, czy silnik pracuje, a projekcja
 * jej nie niesie (baner na `A02-dni.html`). „Samolot zajęty" jest tym, co da się
 * powiedzieć uczciwie o sesji bez `day_close` — mockup pisze tu „Dzień otwarty",
 * ale po §3.6a otwarta jest SESJA jednej maszyny, a nie dzień: pilot potrafi w tej
 * samej służbie zdać jedną maszynę i wziąć drugą.
 */
function stateCell(day: SessionListItemDto, nowMs: number): DayStatePill {
  if (day.openFlags.length > 0) {
    const n = day.openFlags.length;
    return {
      tone: 'amber',
      text: `${n} ${plural(n, 'flaga', 'flagi', 'flag')}`,
      dot: true,
      sub: day.openFlags.join(' · '),
    };
  }

  if (day.status === 'active') {
    return {
      tone: 'blue',
      text: 'Samolot zajęty',
      dot: true,
      sub: `dane w drodze · ${syncedAgo(day.updatedAt, nowMs)}`,
    };
  }

  if (day.exportRevision != null) {
    return {
      tone: 'green',
      text: 'Wyeksportowany',
      dot: false,
      sub: `rewizja ${day.exportRevision}`,
    };
  }

  return { tone: 'dim', text: 'Samolot zdany', dot: false, sub: 'bez karty arkusza' };
}

/**
 * „sync 24 min temu" — WIEK, nie znacznik czasu.
 *
 * Reguła świeżości panelu (`SZABLON.html`, sekcja `.fresh`): administrator ocenia,
 * czy dane są aktualne, a nie o której dotarły. Stempel nieczytelny mówi to wprost
 * zamiast wypisywać „NaN".
 */
function syncedAgo(updatedAt: string, nowMs: number): string {
  const at = Date.parse(updatedAt);
  if (Number.isNaN(at)) return 'czas ostatniego syncu nieznany';
  return `sync ${relativeAge(nowMs - at)} temu`;
}

/** Załoga: PIC z nazwiska, pod nim kod i Dual — jak w kolumnie „PIC · dual". */
function crewCell(day: SessionListItemDto): { pic: string; sub: string } {
  const dual = day.dualName != null ? shortName(day.dualName) : (day.dualCode ?? day.dualId);
  return {
    pic: day.picName ?? day.picCode ?? day.picId,
    sub: `${day.picCode ?? day.picId} · dual: ${dual ?? '—'}`,
  };
}

/**
 * DTO → wiersze, W TEJ SAMEJ KOLEJNOŚCI (patrz nagłówek pliku).
 *
 * `nowMs` jest parametrem, a nie odczytem `Date.now()` w środku: chwila odniesienia
 * dla „sync N temu" jest decyzją wołającego i tylko dzięki temu ten moduł da się
 * przetestować bez zamrażania zegara.
 */
export function dayRows(items: readonly SessionListItemDto[], nowMs: number): DayRow[] {
  return items.map((day) => ({
    sessionUuid: day.sessionUuid,
    href: `/dni/${day.sessionUuid}`,
    flagged: day.openFlags.length > 0,

    day: dayCell(day),
    aircraft: { reg: day.reg ?? day.aircraftId, type: day.aircraftType },
    operation:
      day.operation == null
        ? null
        : {
            tone: OPERATION_META[day.operation].tone,
            badge: OPERATION_META[day.operation].badge,
            client: day.client,
          },
    crew: crewCell(day),

    // Czasy dnia w zapisie Z WIODĄCYM ZEREM (`hhmm`, nie `duration`) — tak pokazują je
    // mockupy panelu („02:14", „05:53") i tak wygląda karta arkusza, którą ten sam dzień
    // ma w dokumencie klubu. Kolumna „Blok" nie może się różnić od arkusza zapisem.
    block: hhmm(day.blockMs),
    flight: hhmm(day.flightMs),
    flights: String(day.flightsCount),

    mh: {
      text: `${motoHours(day.mhStart, day.mhFormat)} → ${motoHours(day.mhEnd, day.mhFormat)}`,
      sub: mhFormatLabel(day.mhFormat),
    },
    fuel: `${litres(day.fuelStartL)} → ${litres(day.fuelEndL)}`,

    state: stateCell(day, nowMs),
  }));
}
