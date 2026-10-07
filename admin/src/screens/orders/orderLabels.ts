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

import { shortName } from '@ninerdeck/format';

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

/** „dziś" / „jutro" przy terminie - albo nic. */
export function termRelative(startsAt: number, now: number, tz: string): string | null {
  const days = clubDayIndex(startsAt, tz) - clubDayIndex(now, tz);
  if (days === 0) return 'dziś';
  if (days === 1) return 'jutro';
  return null;
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
  const day = fmt(tz, { day: 'numeric' }).format(new Date(at));
  const month = fmt(tz, { month: 'short' }).format(new Date(at)).replace('.', '').toUpperCase();
  return `${day} ${month} ${hour}`;
}

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
  if (label == null) return {};
  if (label.startsWith('wspólna lista')) return 'shared';
  const out: Partial<Record<SeatDto, string>> = {};
  for (const part of label.split(' · ')) {
    const colon = part.indexOf(': ');
    if (colon < 0) continue;
    const seat = AUDIENCE_SEAT[part.slice(0, colon)];
    if (seat == null) continue;
    out[seat] = part
      .slice(colon + 2)
      .split(', ')
      .map((who) => (memberNames.has(who) ? shortName(who) : who))
      .join(', ');
  }
  return out;
}

const AUDIENCE_SEAT: Readonly<Record<string, SeatDto>> = {
  dowódca: 'pic',
  'drugi pilot': 'dual',
};
