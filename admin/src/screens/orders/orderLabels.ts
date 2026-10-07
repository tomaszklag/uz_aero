/**
 * Ninerdeck - panel: NAPISY ZLECENIA (moduł Zlecenia, 4.0.0; epik Z-D #248).
 *
 * Wspólne dla listy, szuflady i rozmowy: termin czasem KLUBU, nazwy foteli, „kogo
 * brakuje", trasa. Moduł czysty - decyzje o treści, nie o układzie - więc ma test obok.
 *
 * ══ TE SAME SŁOWA, CO W TELEFONIE ══
 * „Szuka załogi / dowódcy / drugiego pilota", „Termin do potwierdzenia", „Dowódca",
 * „Drugi pilot" - dokładnie te napisy stoją w aplikacji (`orderFormat.ts`) i na pasku
 * kalendarza. Adresat czyta zlecenie raz w telefonie, raz przy biurku, i ma przeczytać
 * to samo.
 *
 * ══ GODZINA TO CZAS KLUBU, A RELATYWNE SŁOWO - TYLKO „DZIŚ" I „JUTRO" ══
 * Zlecenie bez załogi wygasa na początku terminu (§5.5), więc przy terminie stoi „jutro":
 * to jest informacja o tym, ile zostało czasu. Dalszych odległości lista nie liczy -
 * dzień tygodnia i data mówią to same.
 */

import { duration, shortName, weekdayShortUtc } from '@ninerdeck/format';

import type { SeatDto } from '../../api/dto';
import { clubDayIndex, godzina } from '../calendar/bookingLabels';

/** Fotel po polsku - nazwa wiersza „Fotele" i „Twój fotel". */
export const SEAT_LABEL: Readonly<Record<SeatDto, string>> = {
  pic: 'Dowódca',
  dual: 'Drugi pilot',
};

/** Fotel odpowiedzi „termin do potwierdzenia" - wspólna lista albo obie listy (pkt 37). */
export const NO_SEAT = 'Termin do potwierdzenia';

/**
 * „Szuka załogi" / „Szuka dowódcy" / „Szuka drugiego pilota" - kogo BRAKUJE, tym samym
 * słowem, co pasek zlecenia na osi kalendarza. `null` = nikogo (zlecenie kompletne).
 */
export function seekingLabel(open: readonly SeatDto[]): string | null {
  if (open.length >= 2) return 'Szuka załogi';
  if (open[0] === 'pic') return 'Szuka dowódcy';
  if (open[0] === 'dual') return 'Szuka drugiego pilota';
  return null;
}

/** Trasa: jedno lotnisko przy skokach (issue #13), para przy reszcie; `null` = brak. */
export function routeLabel(fromIcao: string | null, toIcao: string | null): string | null {
  if (fromIcao == null && toIcao == null) return null;
  if (fromIcao == null || toIcao == null || fromIcao === toIcao) return fromIcao ?? toIcao;
  return `${fromIcao} → ${toIcao}`;
}

const fmt = (tz: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('pl-PL', { ...options, timeZone: tz || undefined });

/**
 * „sobota 3 PAŹ" - dzień tygodnia pełnym słowem i skrót miesiąca wersalikami, jak
 * w makiecie `zlecenia-lista`. Doba KLUBU, nie przeglądarki.
 */
export function termDayLabel(at: number, tz: string): string {
  const date = new Date(at);
  const weekday = fmt(tz, { weekday: 'long' }).format(date);
  const day = fmt(tz, { day: 'numeric' }).format(date);
  const month = fmt(tz, { month: 'short' }).format(date).replace('.', '').toUpperCase();
  return `${weekday} ${day} ${month}`;
}

/**
 * Godziny terminu: „09:00 → 13:00". Termin przez północ klubu niesie przy końcu jego
 * dzień, bo sama godzina końca wyglądałaby jak godzina tego samego dnia.
 */
export function termHoursLabel(startsAt: number, endsAt: number, tz: string): string {
  const sameDay = clubDayIndex(startsAt, tz) === clubDayIndex(endsAt, tz);
  const end = sameDay ? godzina(new Date(endsAt), tz) : `${termDayLabel(endsAt, tz)} ${godzina(new Date(endsAt), tz)}`;
  return `${godzina(new Date(startsAt), tz)} → ${end}`;
}

/**
 * „dziś" / „jutro" / „za 2 dni" przy terminie (makieta ZL3a) - albo nic, gdy termin minął.
 * Liczy się dobą klubu, nie godzinami: termin jutro o 07:00 jest „jutro" także o 23:00.
 */
export function termRelative(startsAt: number, now: number, tz: string): string | null {
  const days = clubDayIndex(startsAt, tz) - clubDayIndex(now, tz);
  if (days === 0) return 'dziś';
  if (days === 1) return 'jutro';
  return days > 1 ? `za ${days} dni` : null;
}

/**
 * Chwila zdarzenia przy odpowiedzi: „07:40" dziś, „wczoraj 19:14", dalej „2 PAŹ 07:40".
 * Czas klubu - lista mówi tym samym zegarem, co termin, przy którym stoi.
 */
export function momentLabel(at: number, now: number, tz: string): string {
  const hour = godzina(new Date(at), tz);
  const days = clubDayIndex(now, tz) - clubDayIndex(at, tz);
  if (days === 0) return hour;
  if (days === 1) return `wczoraj ${hour}`;
  return `${dayMonthLabel(at, tz)} ${hour}`;
}

/** „3 PAŹ" - dzień doby klubu i skrót miesiąca wersalikami. */
export function dayMonthLabel(at: number, tz: string): string {
  const day = fmt(tz, { day: 'numeric' }).format(new Date(at));
  const month = fmt(tz, { month: 'short' }).format(new Date(at)).replace('.', '').toUpperCase();
  return `${day} ${month}`;
}

/**
 * „sob 3 PAŹ" - pasek zlecenia nad rozmową. Skrót dnia tygodnia z tej samej tablicy, co
 * w telefonie (`weekdayShortUtc`), liczony od doby KLUBU: przeglądarkowe „sob." i telefonowe
 * „sob" mówiłyby o tym samym pasku dwoma kształtami.
 */
export function termShortDay(at: number, tz: string): string {
  const weekday = weekdayShortUtc(clubDayIndex(at, tz) * DAY_MS + DAY_MS / 2).toLowerCase();
  return `${weekday} ${dayMonthLabel(at, tz)}`;
}

const DAY_MS = 86_400_000;

/** Cytat powodu w polskich cudzysłowach - powód jest zdaniem człowieka, nie etykietą. */
export const quoted = (text: string): string => `„${text}"`;

/**
 * Etykieta adresowania z serwera, rozpisana na fotele (§6.2): „dowódca: Instruktorzy ·
 * drugi pilot: Jan Wrona" → { pic: 'Instruktorzy', dual: 'J. Wrona' }; wspólna lista →
 * `'shared'`.
 *
 * Kształt składa serwer (`domain/orderAddressing.ts`, `audienceLabel`) i to on jest
 * źródłem - panel go nie układa, tylko kroi na wiersze komórki. Nazwisko członka klubu
 * skraca się tak, jak na pasku kalendarza („J. Wrona"); nazwa grupy zostaje cała -
 * rozpoznaje się ją po tym, że nie jest nazwiskiem nikogo w słowniku klubu.
 */
export function audienceBySeat(
  label: string | undefined,
  memberNames: ReadonlySet<string>,
): Partial<Record<SeatDto, string>> | 'shared' {
  const parts = audienceParts(label);
  if (parts.shared != null) return 'shared';
  const short = (value: string): string =>
    value
      .split(', ')
      .map((who) => (memberNames.has(who) ? shortName(who) : who))
      .join(', ');
  const out: Partial<Record<SeatDto, string>> = {};
  if (parts.pic != null) out.pic = short(parts.pic);
  if (parts.dual != null) out.dual = short(parts.dual);
  return out;
}

/**
 * Ta sama etykieta pocięta na części BEZ skracania - podtytuł karty fotela w szufladzie
 * („Drugi pilot · Piloci An-2") i nagłówek wspólnej listy. Nazwy grup zna wyłącznie ona.
 */
export function audienceParts(label: string | undefined): { pic: string | null; dual: string | null; shared: string | null } {
  const out = { pic: null as string | null, dual: null as string | null, shared: null as string | null };
  for (const part of (label ?? '').split(' · ')) {
    const colon = part.indexOf(': ');
    if (colon < 0) continue;
    const head = part.slice(0, colon);
    const value = part.slice(colon + 2).trim();
    if (value === '') continue;
    if (head === 'dowódca') out.pic = value;
    else if (head === 'drugi pilot') out.dual = value;
    else if (head === 'wspólna lista') out.shared = value;
  }
  return out;
}

/** Fotel w środku zdania - „plan lotu", „drugi pilot: Anna Kowal". */
export const SEAT_LOWER: Readonly<Record<SeatDto, string>> = {
  pic: 'dowódca',
  dual: 'drugi pilot',
};

/** Fotel w bierniku - „Na dowódcę", „także na drugiego pilota". */
export const SEAT_ACCUSATIVE: Readonly<Record<SeatDto, string>> = {
  pic: 'dowódcę',
  dual: 'drugiego pilota',
};

/** Fotel w dopełniaczu - „fotel drugiego pilota", „na liście dowódcy". */
export const SEAT_GENITIVE: Readonly<Record<SeatDto, string>> = {
  pic: 'dowódcy',
  dual: 'drugiego pilota',
};

/**
 * Dzień terminu w tytule szuflady: „sobota 3 października" - dopełniacz miesiąca bierze
 * się z CZĘŚCI daty sformatowanej z dniem (samo pole miesiąca dałoby mianownik).
 */
export function termTitleDay(at: number, tz: string): string {
  const date = new Date(at);
  const weekday = fmt(tz, { weekday: 'long' }).format(date);
  const parts = fmt(tz, { day: 'numeric', month: 'long' }).formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${weekday} ${day} ${month}`;
}

/** Para godzin w zdaniu: „10:00-12:00" - kolizja, stary i nowy termin w historii. */
export function hoursSpan(startsAt: number, endsAt: number, tz: string): string {
  return `${godzina(new Date(startsAt), tz)}-${godzina(new Date(endsAt), tz)}`;
}

/** Chwila wpisu historii: „dziś · 07:10", „wczoraj · 21:05", dalej „29 WRZ · 07:10". */
export function historyMoment(at: number, now: number, tz: string): string {
  const hour = godzina(new Date(at), tz);
  const days = clubDayIndex(now, tz) - clubDayIndex(at, tz);
  if (days === 0) return `dziś · ${hour}`;
  if (days === 1) return `wczoraj · ${hour}`;
  return `${dayMonthLabel(at, tz)} · ${hour}`;
}

/** Chwila w zdaniu o zmianie: „dziś 07:10", „wczoraj 19:14", dalej „2 PAŹ 07:40". */
export function dayMoment(at: number, now: number, tz: string): string {
  const days = clubDayIndex(now, tz) - clubDayIndex(at, tz);
  return days === 0 ? `dziś ${godzina(new Date(at), tz)}` : momentLabel(at, now, tz);
}

/** „wysłane wczoraj 18:40" - chwila wysłania przy osobie zlecającej. */
export function sentLabel(at: number, now: number, tz: string): string {
  return `wysłane ${dayMoment(at, now, tz)}`;
}

/** Plan lotu: „3:00 · paliwo 600 L"; pusty napis = wiersza nie ma. */
export function planLabel(plannedAirMin: number | null, plannedFuelL: number | null): string {
  const parts: string[] = [];
  if (plannedAirMin != null) parts.push(duration(plannedAirMin * 60_000));
  if (plannedFuelL != null) parts.push(`paliwo ${plannedFuelL} L`);
  return parts.join(' · ');
}
