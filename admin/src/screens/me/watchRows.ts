/**
 * Ninerdeck - panel: WIERSZE KARTY „Obserwowane samoloty" na `#/konto` (3.2.0,
 * issue #205, decyzja 12; makieta `konto`; `docs/obserwowanie-samolotu.md` §6.6).
 *
 * Cała flota klubu sesji jako przełączniki `.opt`: nazwa = znak i typ, opis = STAN
 * TERAZ jednym zdaniem. Stan liczy SERWER (`aircraftNow` - ten sam rachunek, co hero
 * karty 27 i sekcja „Obserwowane samoloty" w ustawieniach telefonu), panel go wyłącznie
 * nazywa - jak `bookingLabels.ts` nazywa zajętość. Brzmienie zdań jest TO SAMO, co
 * w sekcji 13C aplikacji: jedna maszyna ma czytać się tak samo w ustawieniach i w panelu,
 * a dwa słowniki rozjechałyby się przy pierwszej poprawce jednego z nich.
 *
 * ══ DWA ZEGARY, JAK WSZĘDZIE (§6.2) ══
 * Chwile OPERACJI („od 08:12 UTC") stemplem rejestru; TERMINY („następny termin dziś
 * 14:00", „do 2 paź 18:00") dobą KLUBU - w panelu przez `Intl` ze strefą z odpowiedzi,
 * jak w kalendarzu i kolejce decyzji.
 *
 * Moduł CZYSTY: bez Reacta, bez sieci - i dlatego ma test obok.
 */

import { shortName } from '@ninerdeck/format';

import type { AircraftNowDto, WatchListDto } from '../../api/dto';
import { blockReasonLabel, clubDayIndex, godzina, type PersonLookup } from '../calendar/bookingLabels';
import { timeUtc } from '../common/values';

export interface WatchRow {
  aircraftId: string;
  /** „SP-AXA · Cessna 172" */
  name: string;
  /** „W locie · J. Nowak · od 08:12 UTC", „Wolna · następny termin dziś 14:00" */
  desc: string;
  on: boolean;
}

export interface WatchRowOptions {
  person: PersonLookup;
  /** Zalogowany - w zdaniu „Ty", jak w ustawieniach telefonu. */
  me: string;
  now: number;
}

const parse = (iso: string | null): number | null => {
  if (iso == null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
};

const join = (parts: readonly (string | null)[]): string =>
  parts.filter((part): part is string => part != null).join(' · ');

const fmtDay = (tz: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: tz || undefined });

/** „dziś 14:00", „jutro 09:00", „26 wrz 09:00" - chwila terminu dobą klubu. */
export function termMoment(at: number, tz: string, now: number): string {
  const diff = clubDayIndex(at, tz) - clubDayIndex(now, tz);
  const d = new Date(at);
  if (diff === 0) return `dziś ${godzina(d, tz)}`;
  if (diff === 1) return `jutro ${godzina(d, tz)}`;
  return `${fmtDay(tz).format(d)} ${godzina(d, tz)}`;
}

/** „do 18:00" w tej dobie klubu, „do 2 paź 18:00" w innej - koniec wyłączenia z użytku. */
export function untilMoment(at: number, tz: string, now: number): string {
  const d = new Date(at);
  if (clubDayIndex(at, tz) === clubDayIndex(now, tz)) return `do ${godzina(d, tz)}`;
  return `do ${fmtDay(tz).format(d)} ${godzina(d, tz)}`;
}

function who(pilotId: string | null, opts: WatchRowOptions): string | null {
  if (pilotId == null) return null;
  if (pilotId === opts.me) return 'Ty';
  const person = opts.person(pilotId);
  // Poza listą członków (świeżo przyjęty, lista jeszcze nie doszła) zdanie MILCZY
  // o osobie - surowy identyfikator nie mówi nic nikomu.
  return person == null ? null : shortName(person.name);
}

/** Zdanie o stanie „teraz" - opis wiersza. */
export function nowLine(now: AircraftNowDto, tz: string, opts: WatchRowOptions): string {
  switch (now.kind) {
    case 'retired':
      return 'Wycofana z użytku';
    case 'flying':
    case 'claimed':
    case 'after_flight': {
      const since = parse(now.since);
      const head = now.kind === 'flying' ? 'W locie' : now.kind === 'claimed' ? 'Przejęta' : 'Po locie';
      return join([head, who(now.pilotId, opts), since == null ? null : `od ${timeUtc(since)} UTC`]);
    }
    case 'blocked': {
      const until = parse(now.until);
      // „wyłączona" przy powodzie „inny" powtarzałoby nagłówek zdania - zostaje sam koniec.
      const reason =
        now.reason == null || now.reason === 'other' ? null : blockReasonLabel(now.reason).toLowerCase();
      return join(['Wyłączona z użytku', reason, until == null ? null : untilMoment(until, tz, opts.now)]);
    }
    case 'booked':
      return join(['Zarezerwowana', who(now.pilotId, opts)]);
    case 'free': {
      const at = now.next == null ? null : parse(now.next.startsAt);
      if (now.next == null || at == null) return 'Wolna';
      return `Wolna · ${now.next.kind === 'block' ? 'wyłączenie' : 'następny termin'} ${termMoment(at, tz, opts.now)}`;
    }
  }
}

export function watchRows(list: WatchListDto, opts: WatchRowOptions): WatchRow[] {
  return list.items.map((item) => ({
    aircraftId: item.aircraftId,
    name: `${item.reg} · ${item.type}`,
    // Maszyna wycofana z floty ma stan „wycofana" niezależnie od tego, co serwer
    // policzył z rejestru - ta sama reguła, co w sekcji 13C telefonu.
    desc: nowLine(item.serviceStatus === 'active' ? item.now : { kind: 'retired' }, list.timezone, opts),
    on: item.watching,
  }));
}
