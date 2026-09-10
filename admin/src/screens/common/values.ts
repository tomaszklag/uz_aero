/**
 * UZ Aero - panel 2.0: KRESKA BRAKU i formatery, które ją stawiają.
 *
 * ══ DWIE POWIERZCHNIE, DWIE KRESKI - I OBIE SĄ ZATWIERDZONE ══
 * Makiety telefonu (`design/*.html`) piszą brak DYWIZEM (`-`), makiety panelu
 * (`design/panel/*.html`) PÓŁPAUZĄ (`—`) i mówią to wprost: „`0 L` znaczy pusty
 * zbiornik, `—` znaczy »nikt nie zapisał«". Formatery w `@uzaero/format` są wspólne
 * dla obu stron, więc oddają kreskę TELEFONU - i tak ma zostać.
 *
 * Skutek do 2026-09-07: w jednym wierszu dziennika stały OBIE. Kolumna paliwa szła
 * z `litres(null)` („-"), a sąsiednia kolumna pilota z lokalnej stałej `NONE` („—") -
 * przy parze wyglądało to jak dwa różne rodzaje braku. Rozjazd nie miał jak się
 * ujawnić, bo każdy z czterech modułów gridu deklarował własne `NONE` i każdy z nich
 * miał rację osobno.
 *
 * ══ JEDNO MIEJSCE, W KTÓRYM BRAK DOSTAJE KSZTAŁT ══
 * Nazwy zostają TE SAME, co w `@uzaero/format`, bo to są te same wielkości - różni je
 * wyłącznie powierzchnia, a tę widać po ścieżce importu. Ekran panelu bierze `litres`
 * stąd i nie ma jak przypadkiem wziąć kreski telefonu.
 *
 * Zero NIGDY nie zastępuje braku i tego ten moduł nie zmienia: podmienia wyłącznie
 * znak, którym brak jest zapisany.
 */

import {
  dateUtcDayMonth,
  litres as litresShared,
  motoHours as motoHoursShared,
  oilLitres as oilLitresShared,
  timeUtc as timeUtcShared,
} from '@uzaero/format';
import type { MhFormat } from '@uzaero/domain';

/** Kreska braku PANELU - półpauza. JEDNO miejsce w całym `admin/`, w którym powstaje. */
export const NONE = '—';

/** Kreska braku wspólnych formaterów, czyli dywiz z makiet TELEFONU. */
const SHARED_NONE = '-';

/**
 * Napis wspólnego formatera przełożony na kreskę panelu.
 *
 * Porównanie z CAŁYM napisem, nie podmiana znaku w treści: `litres` oddaje przy braku
 * sam dywiz i nic więcej, a zamiana „gdziekolwiek" psułaby pierwszą wartość ujemną
 * albo zapis z myślnikiem, który kiedyś w tych formaterach stanie.
 */
const panelDash = (formatted: string): string => (formatted === SHARED_NONE ? NONE : formatted);

/** Paliwo w litrach; brak odczytu = kreska panelu. */
export const litres = (value: number | null): string => panelDash(litresShared(value));

/** Olej w litrach - jedno miejsce po przecinku (issue #60). */
export const oilLitres = (value: number | null): string => panelDash(oilLitresShared(value));

/** Licznik motogodzin wg formatu samolotu (§5.4). */
export const motoHours = (value: number | null, format: MhFormat | null): string =>
  panelDash(motoHoursShared(value, format));

/** Godzina zdarzenia „HH:MM" UTC. */
export const timeUtc = (t: number | null): string => panelDash(timeUtcShared(t));

/**
 * Data ze stempla ISO jako „26 SIE 2026" (UTC) - założenie klubu, obowiązywanie kodu
 * klubu (issue #101).
 *
 * ROK JEST TU KONIECZNY, a nie ozdobny: te daty żyją latami, więc samo „26 SIE"
 * czytałoby się jak „w tym roku" niezależnie od tego, ile ma naprawdę. Dzień jest
 * dopełniony zerem (`dateUtcDayMonth`), bo obie te daty stoją w KOLUMNACH tabeli,
 * a kolumna dat czyta się wzrokiem po równej krawędzi.
 *
 * Składamy z formatera wspólnego zamiast pisać drugą tablicę miesięcy: skrót musi
 * zostać prefiksem pełnej nazwy z `@uzaero/format`, inaczej panel i telefon zaczęłyby
 * skracać wrzesień na dwa sposoby.
 */
export const dateWithYear = (iso: string | null): string => {
  if (iso == null) return NONE;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return NONE;
  return `${dateUtcDayMonth(t)} ${new Date(t).getUTCFullYear()}`;
};
