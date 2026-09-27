/**
 * Ninerdeck - panel 3.2: SŁOWNIK ROZJAZDÓW - flaga po polsku (`docs/panel-3.2.md` §6,
 * §17 pkt 7; makieta `sprawdzenie-rozjazdy`, kanwa „Sześć rodzajów").
 *
 * Moduł CZYSTY. Kody serwera (`mh_gap`, `aircraft_overlap`…) NIE wychodzą na ekran - to
 * nazwy w kodzie, nie w rozmowie. Każdy rodzaj ma NAZWĘ (plakietka), PODPIS z liczbami
 * policzonymi przy przyjęciu zapisu (`details` flagi) i ZDANIE O CZYNNOŚCI (szuflada).
 * Reguła redakcyjna: flaga mówi, CO jest nie tak i CO z tym zrobić - nie opisuje wnętrza
 * przyjmowania zapisów ani tego, jak liczy się łańcuch odczytów (kategoria przypisów
 * wyrzuconych z aplikacji przy issue #43 i #72).
 *
 * `Record<FlagType, …>`, więc nowy rodzaj flagi w domenie wywala kompilację, zamiast
 * pojawić się na ekranie surowym kodem. `details` czytamy bez udawania, że znamy kształt:
 * liczba spoza spodziewanego klucza daje podpis bez niej, nie `undefined` w zdaniu.
 */

import { dateTimeUtcShort, shortName } from '@ninerdeck/format';
import type { FlagType, MhFormat } from '@ninerdeck/domain';

import type { FlagDto, FlagSessionDto, OpenFlagDto } from '../../api/dto';
import { litres, motoHours, NONE, timeUtc } from '../common/values';
import { eventLabel } from '../logbook/timelineRows';

const LABELS: Record<FlagType, string> = {
  aircraft_overlap: 'Dwie operacje naraz',
  pilot_overlap: 'Pilot w dwóch maszynach',
  mh_gap: 'Luka w liczniku',
  mh_regression: 'Cofnięty licznik',
  fuel_mismatch: 'Rozjazd paliwa',
  clock_drift: 'Rozjazd zegara',
};

/** Rodzaj w ADRESIE - polski slug, bo adres bywa wklejany w rozmowie; kod zostaje w kodzie. */
const SLUGS: Record<FlagType, string> = {
  aircraft_overlap: 'dwie-operacje',
  pilot_overlap: 'pilot-w-dwoch-maszynach',
  mh_gap: 'luka-w-liczniku',
  mh_regression: 'cofniety-licznik',
  fuel_mismatch: 'rozjazd-paliwa',
  clock_drift: 'rozjazd-zegara',
};

/** Kolejność chipów rodzaju - jak w makiecie: nakładki, licznik, paliwo, zegar. */
export const FLAG_TYPES_ORDER: readonly FlagType[] = [
  'aircraft_overlap',
  'pilot_overlap',
  'mh_gap',
  'mh_regression',
  'fuel_mismatch',
  'clock_drift',
];

export const flagLabel = (type: FlagType): string => LABELS[type];
export const flagSlug = (type: FlagType): string => SLUGS[type];

/** Rodzaj ze sluga w adresie; `null` = brak zawężenia albo slug nieznany. */
export function flagTypeOfSlug(slug: string | null): FlagType | null {
  if (slug == null) return null;
  return FLAG_TYPES_ORDER.find((type) => SLUGS[type] === slug) ?? null;
}

const num = (details: Record<string, unknown>, key: string): number | null => {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const text = (details: Record<string, unknown>, key: string): string | null => {
  const value = details[key];
  return typeof value === 'string' && value !== '' ? value : null;
};

/** „+0,8 h" / „−0,4 h" - godziny licznika ze znakiem, przecinek po polsku. */
const signedHours = (value: number): string =>
  `${value < 0 ? '−' : '+'}${String(Math.abs(value)).replace('.', ',')} h`;

const signedLitres = (value: number): string =>
  `${value < 0 ? '−' : '+'}${litres(Math.abs(value))}`;

/** „6 min 12 s" / „45 s" - rozjazd zegara mówi sekundami, bo próg jest w minutach. */
export function secondsLabel(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} s`;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

const mh = (value: number | null, format: MhFormat | null): string => motoHours(value, format);

/** Nazwisko pilota operacji - skrócone; bez nazwiska kod, bez kodu kreska. */
export const pilotOf = (session: FlagSessionDto | undefined): string =>
  session == null ? NONE : session.picName == null ? (session.picCode ?? NONE) : shortName(session.picName);

/** Sygnatura operacji, a bez niej znak maszyny - nigdy uuid. */
export const nameOf = (session: FlagSessionDto | undefined, fallback: string): string =>
  session?.signature ?? session?.reg ?? fallback;

/**
 * Nakładka w czasie dwóch operacji jednego pilota - z chwil operacji flagi. `null`, gdy
 * którejś operacji nie ma albo obie trwają (wtedy nakładka „trwa nadal").
 */
function overlapOf(sessions: readonly FlagSessionDto[]): { from: number; to: number } | null {
  const [a, b] = sessions;
  if (a?.claimedAt == null || b?.claimedAt == null) return null;
  const from = Math.max(a.claimedAt, b.claimedAt);
  const ends = [a.closeTime, b.closeTime].filter((t): t is number => t != null);
  if (ends.length === 0) return null;
  const to = Math.min(...ends);
  return to <= from ? null : { from, to };
}

const span = (session: FlagSessionDto): string =>
  `${timeUtc(session.claimedAt)}–${session.closeTime == null ? 'w toku' : timeUtc(session.closeTime)} (${session.reg ?? session.aircraftId})`;

/** PODPIS z liczbami - druga linia wiersza skrzynki i meta na liście spraw. */
export function flagSubtitle(flag: FlagDto): string {
  const d = flag.details;
  switch (flag.type) {
    case 'aircraft_overlap':
      return 'maszyna przejęta, zanim poprzednia operacja została zdana';
    case 'pilot_overlap': {
      const [a, b] = flag.sessions;
      const overlap = overlapOf(flag.sessions);
      if (a == null || b == null) return 'dwie operacje jednego pilota nakładają się w czasie';
      const pair = `operacje ${span(a)} i ${span(b)}`;
      if (overlap == null) return `${pair} nakładają się od ${timeUtc(Math.max(a.claimedAt ?? 0, b.claimedAt ?? 0))}`;
      return `${pair} nakładają się o ${minutesLabel(overlap.to - overlap.from)}`;
    }
    case 'mh_gap': {
      const gap = num(d, 'gapH');
      const head = `zdanie ${mh(num(d, 'prevEnd'), flag.mhFormat)}, przejęcie ${mh(num(d, 'nextStart'), flag.mhFormat)}`;
      return gap == null ? head : `${head} · ${signedHours(gap)}`;
    }
    case 'mh_regression': {
      const back = num(d, 'regressionH');
      const head = `przejęcie ${mh(num(d, 'nextStart'), flag.mhFormat)} niższe niż zdanie ${mh(num(d, 'prevEnd'), flag.mhFormat)}`;
      return back == null ? head : `${head} · ${signedHours(-back)}`;
    }
    case 'fuel_mismatch': {
      const diff = num(d, 'diffL');
      const tolerance = num(d, 'toleranceL');
      const head = `odczyt ${litres(num(d, 'readingL'))}, przekazanie ${litres(num(d, 'handoverL'))}`;
      if (diff == null) return head;
      return tolerance == null
        ? `${head} · ${signedLitres(diff)}`
        : `${head} · ${signedLitres(diff)} przy tolerancji ${litres(tolerance)}`;
    }
    case 'clock_drift': {
      const drift = num(d, 'maxDriftSec');
      const threshold = num(d, 'thresholdMs');
      const at = eventLabel(text(d, 'eventType') ?? '');
      const where = at == null ? '' : ` przy zapisie „${at.toLowerCase()}"`;
      const head = drift == null ? 'zegar telefonu rozjechany z GPS' : `zegar telefonu ${secondsLabel(drift)} od GPS${where}`;
      return threshold == null ? head : `${head} · próg ${secondsLabel(Math.round(threshold / 1000))}`;
    }
  }
}

/** „34 min" / „1 h 12 min" - długość nakładki. */
function minutesLabel(ms: number): string {
  const total = Math.round(ms / 60_000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Zdanie o CZYNNOŚCI - karta „Co z tym zrobić". Nic o tym, jak liczy się łańcuch odczytów. */
export function flagAdvice(flag: FlagDto): string {
  switch (flag.type) {
    case 'aircraft_overlap':
      return (
        'Zakończ operację wiszącą w dzienniku albo poczekaj na zdanie samolotu, potem zamknij sprawę. ' +
        'Zamknięcie sprawy wyśle kartę doby do arkusza.'
      );
    case 'pilot_overlap':
      return (
        'Sprawdź godziny przejęcia i zdania obu operacji i popraw tę, która ma je błędne. ' +
        'Zamknięcie sprawy nie zmienia żadnej liczby - mówi tylko, że ktoś to sprawdził.'
      );
    case 'mh_gap':
      return (
        'Ktoś latał bez aplikacji albo odczyt jest zawyżony. Lot bez aplikacji dopisuje pilot wpisem ręcznym, ' +
        'błędny odczyt poprawia się przy przejęciu albo przy zdaniu.'
      );
    case 'mh_regression':
      return (
        'Źle odczytany licznik - popraw odczyt przy przejęciu albo przy zdaniu. ' +
        'Zamknięcie sprawy nie zmienia żadnej liczby - mówi tylko, że ktoś to sprawdził.'
      );
    case 'fuel_mismatch':
      return (
        'Jeśli między operacjami tankowano poza aplikacją, dopisz tankowanie w operacji, która oddała samolot. ' +
        'Jeśli odczyt jest błędny, popraw go przy przejęciu. Zamknięcie sprawy nie zmienia żadnej liczby.'
      );
    case 'clock_drift':
      return (
        'Czasy operacji liczą się z GPS - zapisy bez pozycji sprawdź na osi zdarzeń. ' +
        'Poproś pilota o włączenie czasu automatycznego w telefonie.'
      );
  }
}

/** Wiersz karty „Co się nie zgadza": klucz, wartość, ton wartości. */
export interface FlagFact {
  label: string;
  value: string;
  tone: 'amber' | null;
}

const stamped = (label: string, at: number | null): string =>
  at == null ? label : `${label} · ${dateTimeUtcShort(at)}`;

export function flagFacts(flag: FlagDto): FlagFact[] {
  const d = flag.details;
  const [first, second] = flag.sessions;
  switch (flag.type) {
    case 'aircraft_overlap':
      return flag.sessions.map((session) => ({
        label: `${nameOf(session, flag.reg ?? flag.aircraftId)} · ${pilotOf(session)}`,
        value:
          session.status === 'active'
            ? `trwa od ${session.claimedAt == null ? NONE : dateTimeUtcShort(session.claimedAt)}`
            : `${session.claimedAt == null ? NONE : dateTimeUtcShort(session.claimedAt)} → ${session.closeTime == null ? NONE : timeUtc(session.closeTime)}`,
        tone: session.status === 'active' ? 'amber' : null,
      }));
    case 'pilot_overlap': {
      const overlap = overlapOf(flag.sessions);
      return [
        ...flag.sessions.map((session) => ({
          label: `${nameOf(session, session.aircraftId)} · ${session.reg ?? session.aircraftId}`,
          value: `${timeUtc(session.claimedAt)} → ${session.closeTime == null ? 'w toku' : timeUtc(session.closeTime)}`,
          tone: null,
        })),
        {
          label: 'Wspólny czas',
          value: overlap == null ? 'trwa nadal' : minutesLabel(overlap.to - overlap.from),
          tone: 'amber' as const,
        },
      ];
    }
    case 'mh_gap':
    case 'mh_regression': {
      const delta = flag.type === 'mh_gap' ? num(d, 'gapH') : num(d, 'regressionH');
      const handedAt = first?.closeTime ?? null;
      const takenAt = second?.claimedAt ?? null;
      return [
        { label: stamped('Zdanie', handedAt), value: mh(num(d, 'prevEnd'), flag.mhFormat), tone: null },
        { label: stamped('Przejęcie', takenAt), value: mh(num(d, 'nextStart'), flag.mhFormat), tone: null },
        {
          label: 'Różnica',
          value: delta == null ? NONE : signedHours(flag.type === 'mh_gap' ? delta : -delta),
          tone: 'amber',
        },
      ];
    }
    case 'fuel_mismatch': {
      const diff = num(d, 'diffL');
      const tolerance = num(d, 'toleranceL');
      const handedAt = first?.closeTime ?? null;
      const takenAt = second?.claimedAt ?? null;
      return [
        { label: stamped('Przekazanie · zdanie', handedAt), value: litres(num(d, 'handoverL')), tone: null },
        { label: stamped('Odczyt przy przejęciu', takenAt), value: litres(num(d, 'readingL')), tone: null },
        { label: 'Różnica', value: diff == null ? NONE : signedLitres(diff), tone: 'amber' },
        ...(tolerance == null ? [] : [{ label: 'Tolerancja', value: litres(tolerance), tone: null }]),
      ];
    }
    case 'clock_drift': {
      const drift = num(d, 'maxDriftSec');
      const threshold = num(d, 'thresholdMs');
      const compared = num(d, 'comparedEvents');
      const at = eventLabel(text(d, 'eventType') ?? '');
      return [
        { label: 'Największy rozjazd', value: drift == null ? NONE : secondsLabel(drift), tone: 'amber' },
        ...(at == null ? [] : [{ label: 'Przy zapisie', value: at, tone: null }]),
        ...(threshold == null ? [] : [{ label: 'Próg', value: secondsLabel(Math.round(threshold / 1000)), tone: null }]),
        ...(compared == null ? [] : [{ label: 'Porównane zapisy', value: String(compared), tone: null }]),
      ];
    }
  }
}

/**
 * Baner przy operacji na poziomie 3 dziennika (§6): nagłówek nazywa, co się nie zgadza,
 * treść mówi liczby i CO ZROBIĆ. Drogę do skrzynki dokłada ekran (link).
 */
export function flagIssue(flag: FlagDto): { headline: string; body: string } {
  return { headline: `${flagLabel(flag.type)}: ${flagSubtitle(flag)}.`, body: flagAdvice(flag) };
}

/**
 * PODPIS przy parze odczytów na poziomie 2 (makieta `dziennik-maszyna`: „przekazano 92 L"
 * pod paliwem). Który koniec łańcucha to ten wiersz, poznaje się po odczycie WIERSZA:
 * flaga nie mówi, czy operacja jest tą, która oddała, czy tą, która przejęła.
 */
export interface RowFlagNote {
  column: 'fuel' | 'moto';
  text: string;
}

export function rowFlagNote(
  flag: OpenFlagDto,
  row: { fuelStartL: number | null; mhStart: number | null; mhFormat: MhFormat | null },
): RowFlagNote | null {
  const d = flag.details;
  switch (flag.type) {
    case 'fuel_mismatch': {
      const reading = num(d, 'readingL');
      const handover = num(d, 'handoverL');
      if (reading == null || handover == null) return null;
      return row.fuelStartL === reading
        ? { column: 'fuel', text: `przekazano ${litres(handover)}` }
        : { column: 'fuel', text: `następna operacja odczytała ${litres(reading)}` };
    }
    case 'mh_gap':
    case 'mh_regression': {
      const prevEnd = num(d, 'prevEnd');
      const nextStart = num(d, 'nextStart');
      if (prevEnd == null || nextStart == null) return null;
      return row.mhStart === nextStart
        ? { column: 'moto', text: `zdanie ${mh(prevEnd, row.mhFormat)}` }
        : { column: 'moto', text: `następne przejęcie ${mh(nextStart, row.mhFormat)}` };
    }
    default:
      return null;
  }
}
