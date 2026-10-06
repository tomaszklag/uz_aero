/**
 * Ninerdeck - WSPÓLNE NAPISY ZLECEŃ NA LOT (4.0.0, epik Z-C #247; `docs/zlecenia.md` §3).
 *
 * Termin czasem klubu, fotele, chwile i plan lotu - ekrany 20F, 28, 29, 30 i 32 składają
 * z nich swoje zdania, więc „wczoraj", „Szuka załogi" i „Drugi pilot" mają w module JEDNĄ
 * definicję. Godziny liczą się ODEJMOWANIEM od granic doby klubu, którą serwer przysyła
 * przy każdym terminie (`docs/rezerwacje.md` §6.1) - `Intl` w aplikacji nie istnieje.
 *
 * ══ ZDANIA BEZ FORMY Z PŁCIĄ (słownik §3) ══
 * Ludzie występują tu w mianowniku jako podmiot („zleca Marta Zięba") albo po separatorze
 * - nigdy w odmianie i nigdy z czasownikiem w czasie przeszłym.
 */

import { dateUtcDayMonthLong, duration, litres, relativeAge, weekdayShortUtc, weekdayUtc } from '@ninerdeck/format';

import type { RemoteSeat } from '../../../application';

import { clubHhmm, clubInstant, type ClubDayBounds } from './clubClock';

const DAY_MS = 86_400_000;

/** Kreska - wartość, której nie znamy (osoba spoza pamięci klubu). */
export const NONE = '—';

const SEAT: Readonly<Record<RemoteSeat, string>> = { pic: 'Dowódca', dual: 'Drugi pilot' };
/** Dopełniacz - „Szuka drugiego pilota", „Fotel drugiego pilota na tym locie…". */
const SEAT_OF: Readonly<Record<RemoteSeat, string>> = { pic: 'dowódcy', dual: 'drugiego pilota' };
/** Biernik - „NA DRUGIEGO PILOTA", „także na dowódcę". */
const SEAT_TO: Readonly<Record<RemoteSeat, string>> = { pic: 'dowódcę', dual: 'drugiego pilota' };

/** „Dowódca" / „Drugi pilot" - etykieta fotela. */
export function seatLabel(seat: RemoteSeat): string {
  return SEAT[seat];
}

/** „dowódca" / „drugi pilot" - fotel w środku zdania („Fotel: drugi pilot"). */
export function seatLower(seat: RemoteSeat): string {
  return SEAT[seat].toLowerCase();
}

/** „dowódcy" / „drugiego pilota". */
export function seatGenitive(seat: RemoteSeat): string {
  return SEAT_OF[seat];
}

/** „dowódcę" / „drugiego pilota". */
export function seatAccusative(seat: RemoteSeat): string {
  return SEAT_TO[seat];
}

/**
 * „Szuka dowódcy" / „Szuka drugiego pilota" / „Szuka załogi" - te same słowa, co pasek
 * zlecenia w kalendarzu i plakietka na liście. Pusta lista = komplet, więc `null`.
 */
export function seekingLabel(seeking: readonly RemoteSeat[]): string | null {
  if (seeking.length === 0) return null;
  if (seeking.length > 1) return 'Szuka załogi';
  return `Szuka ${SEAT_OF[seeking[0]!]}`;
}

/** Doba z drutu → liczby; `null`, gdy stemple nie dają się przeczytać. */
export function orderDay(day: { date: string; startsAt: string; endsAt: string }): ClubDayBounds | null {
  const startsAt = Date.parse(day.startsAt);
  const endsAt = Date.parse(day.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || !(endsAt > startsAt)) return null;
  return { date: day.date, startsAt, endsAt };
}

/** Chwila z drutu (ISO) → ms; `null` dla braku i stempla nie do przeczytania. */
export function instant(iso: string | null | undefined): number | null {
  if (iso == null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
}

/**
 * Doba klubu ZAWIERAJĄCA chwilę - przesunięta o pełne dni od doby, którą przysłał serwer.
 * Serwer przysyła jedną dobę na termin; chwila spoza niej (wiadomość sprzed dwóch dni,
 * stary termin) liczy godzinę na dobie przesuniętej. Zmiana czasu w środku przesunięcia
 * da godzinę obok - ten sam przyjęty koszt, co `clubInstant`.
 */
export function dayAround(day: ClubDayBounds, at: number): ClubDayBounds {
  const shift = Math.floor((at - day.startsAt) / DAY_MS) * DAY_MS;
  return shift === 0 ? day : { date: day.date, startsAt: day.startsAt + shift, endsAt: day.endsAt + shift };
}

/**
 * Ile dób klubu dzieli chwilę od doby odniesienia (0 = ta sama doba, -1 = poprzednia).
 * Czyta go też rozmowa (29): separator „Dziś" / „Wczoraj" to ta sama różnica dób.
 */
export function dayIndex(day: ClubDayBounds, at: number): number {
  return Math.floor((at - day.startsAt) / DAY_MS);
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** „Sobota · 3 października" - doba terminu (hero 28, 32; nagłówek arkusza). */
export function orderDate(day: ClubDayBounds): string {
  // Dzień tygodnia i data ze ŚRODKA doby: granica doby klubu wypada przed północą UTC,
  // więc rachunek z `startsAt` trafiłby w dzień poprzedni (ta sama reguła, co `dayHeading`).
  const midday = (day.startsAt + day.endsAt) / 2;
  return `${capitalize(weekdayUtc(midday).toLowerCase())} · ${dateUtcDayMonthLong(midday).toLowerCase()}`;
}

/** „09:00 → 13:00" - godziny terminu wielkim składem (hero, wiersz listy). */
export function orderHours(startsAt: number, endsAt: number, day: ClubDayBounds): string {
  return `${clubHhmm(startsAt, dayAround(day, startsAt))} → ${clubHhmm(endsAt, dayAround(day, endsAt))}`;
}

/** „09:00-11:00" - te same godziny w zdaniu („było 09:00-11:00", kolizja, arkusz). */
export function orderSpan(startsAt: number, endsAt: number, day: ClubDayBounds): string {
  const own = dayAround(day, startsAt);
  return `${clubHhmm(startsAt, own)}-${clubHhmm(endsAt, dayAround(day, endsAt))}`;
}

/** „4 h", „1 h 30 min" - długość terminu, nie planowany czas lotu. */
export function orderLength(startsAt: number, endsAt: number): string {
  return relativeAge(endsAt - startsAt);
}

/**
 * „ZA 11 H 12 MIN", „ZA 1 DZIEŃ 14 H", „TRWA"; `null` po końcu terminu. Termin, który
 * trwa, nie dostaje liczby - ta sama reguła, co karta rezerwacji (23).
 */
export function orderCountdown(startsAt: number, endsAt: number, now: number): string | null {
  if (now >= startsAt) return now < endsAt ? 'TRWA' : null;
  return `ZA ${relativeAge(startsAt - now)}`.toUpperCase();
}

/**
 * „27 WRZ", „1 PAŹ" - data terminu w zwartym wierszu (sekcja „Zakończone"). Bez zera
 * wiodącego, jak w makietach zleceń: „01 PAŹ" z `dateUtcDayMonth` jest zapisem śladu (14),
 * gdzie data stoi w kolumnie mono obok numeru lotu.
 */
export function orderDayShort(day: ClubDayBounds, at: number): string {
  const [date, month] = dateUtcDayMonthLong(clubInstant(at, day)).split(' ');
  return `${date} ${(month ?? '').slice(0, 3).toUpperCase()}`;
}

/**
 * „SP-AXA · sob 3 PAŹ 09:00-11:00" - wiersz odniesienia w arkuszach odpowiedzi,
 * rezygnacji i odwołania (28D, 23F, 32C): NA CO odpowiadasz, maszyna i termin w jednej
 * linii mono, jak w arkuszu odmowy zgody (26C). Termin czasem klubu.
 */
export function orderReference(reg: string, day: ClubDayBounds, startsAt: number, endsAt: number): string {
  const dow = weekdayShortUtc(clubInstant(startsAt, day)).toLowerCase();
  return `${reg} · ${dow} ${orderDayShort(day, startsAt)} ${orderSpan(startsAt, endsAt, day)}`;
}

/**
 * Jak nazwać dzisiejszą i wczorajszą chwilę - makiety mówią o tym inaczej w zależności
 * od gęstości wiersza: status adresata na 32 pisze sam zegar i „wcz.", karta zlecenia
 * „dziś" i „wczoraj", historia zmian „dziś" i „wcz.".
 */
export interface MomentStyle {
  /** `bare` = „07:10", `dziś` = „dziś 07:10". */
  today: 'bare' | 'dziś';
  yesterday: 'wczoraj' | 'wcz.';
}

/** Karta zlecenia: „wysłane dziś 18:40", baner „dziś 16:20". */
export const LONG: MomentStyle = { today: 'dziś', yesterday: 'wczoraj' };
/** Status adresata i postęp: „Może lecieć · 21:30", „Odczytane wcz. 20:05". */
export const SHORT: MomentStyle = { today: 'bare', yesterday: 'wcz.' };
/** Historia zmian: „dziś 07:10", „wcz. 21:05". */
export const HISTORY: MomentStyle = { today: 'dziś', yesterday: 'wcz.' };
/** Odpowiedź i „Edytowane": „Zgłoszone 21:52", „wczoraj 19:14 · poprzedni termin". */
export const ANSWER: MomentStyle = { today: 'bare', yesterday: 'wczoraj' };

/**
 * Chwila czasem klubu względem „teraz": „07:10" / „dziś 07:10", „wcz. 21:05" / „wczoraj
 * 21:05", „jutro 09:00", dalej „27 WRZ 08:00". Doby klubu liczą się od doby, którą serwer
 * przysłał przy zleceniu - „teraz" i chwila leżą zwykle w niej albo tuż obok.
 */
export function momentLabel(at: number, day: ClubDayBounds, now: number, style: MomentStyle): string {
  const hhmm = clubHhmm(at, dayAround(day, at));
  const diff = dayIndex(day, at) - dayIndex(day, now);
  if (diff === 0) return style.today === 'bare' ? hhmm : `dziś ${hhmm}`;
  if (diff === -1) return `${style.yesterday} ${hhmm}`;
  if (diff === 1) return `jutro ${hhmm}`;
  return `${orderDayShort(day, at)} ${hhmm}`;
}

/** „EPKK → EPRJ" albo jedno lotnisko (skoki - issue #13); `null` bez trasy. */
export function routeCodes(fromIcao: string | null, toIcao: string | null): string | null {
  if (fromIcao == null && toIcao == null) return null;
  if (fromIcao == null || toIcao == null || fromIcao === toIcao) return fromIcao ?? toIcao;
  return `${fromIcao} → ${toIcao}`;
}

/** „1:30 · paliwo 120 L" - plan lotu jednym wierszem karty zlecenia; `null` bez planu. */
export function planLine(plannedAirMin: number | null, plannedFuelL: number | null): string | null {
  const parts: string[] = [];
  if (plannedAirMin != null) parts.push(duration(plannedAirMin * 60_000));
  if (plannedFuelL != null) parts.push(`paliwo ${litres(plannedFuelL)}`);
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * Osoba w zdaniu: „Ty" dla patrzącego, nazwisko z pamięci klubu dla innych, kreska poza
 * nią - nigdy surowy identyfikator.
 */
export function personLabel(
  pilotId: string | null,
  me: string,
  nameOf: (pilotId: string) => string | null,
): string {
  if (pilotId == null) return NONE;
  if (pilotId === me) return 'Ty';
  return nameOf(pilotId) ?? NONE;
}
