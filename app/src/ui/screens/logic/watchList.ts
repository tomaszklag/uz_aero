/**
 * Ninerdeck - WIERSZE SEKCJI „Obserwowane samoloty" w Ustawieniach (makieta 13C,
 * obserwowanie 3.2.0, §6.6).
 *
 * Cała flota klubu bieżącego: znak, typ, STAN TERAZ w podpisie (ten sam rachunek
 * `aircraftNow`, co hero karty 27 - serwer liczy, telefon pisze) i przełącznik.
 * Podpis mówi o maszynie jednym zdaniem w tonie stanu: zieleń = pracuje, bursztyn =
 * wyłączona, bez tonu = wolna albo czeka na termin.
 */

import { timeUtc } from '@ninerdeck/format';

import type { RemoteAircraftNow, RemoteWatchList } from '../../../application';

import { blockReasonLabel, clubMomentLabel } from './aircraftCard';
import type { ClubDayBounds } from './clubClock';

export interface WatchRowVm {
  aircraftId: string;
  reg: string;
  type: string;
  /** „W locie · A. Kowalski · od 08:12 UTC", „Wolna · następny termin dziś 14:00". */
  sub: string;
  tone: 'green' | 'amber' | null;
  on: boolean;
}

export interface WatchListOptions {
  now: number;
  /** Ten pilot - w podpisie „Ty". */
  pilotId: string;
  /** Skrócone imię i nazwisko z cache członków; `null` = poza cache'em. */
  shortNameOf: (pilotId: string) => string | null;
  /**
   * Doba klubu dla chwili terminu - do „dziś 14:00" / „jutro 09:00". Lista floty nie
   * niesie dób (to nie kalendarz), więc wołający podaje rachunek z bieżącej doby; `null`
   * = brak, wtedy termin pisze się bez godziny.
   */
  dayAt: (at: number) => ClubDayBounds | null;
}

const parse = (iso: string | null): number | null => {
  if (iso == null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
};

/** Zdanie o stanie „teraz" - dla wiersza listy (bez nazwiska w osobnej linii). */
export function nowLine(now: RemoteAircraftNow, opts: WatchListOptions): { sub: string; tone: 'green' | 'amber' | null } {
  const who = (id: string | null): string | null =>
    id == null ? null : id === opts.pilotId ? 'Ty' : (opts.shortNameOf(id) ?? null);
  switch (now.kind) {
    case 'retired':
      return { sub: 'Wycofana z użytku', tone: 'amber' };
    case 'flying':
    case 'claimed':
    case 'after_flight': {
      const since = parse(now.since);
      const head = now.kind === 'flying' ? 'W locie' : now.kind === 'claimed' ? 'Przejęta' : 'Po locie';
      return {
        sub: [head, who(now.pilotId), since == null ? null : `od ${timeUtc(since)} UTC`]
          .filter((x): x is string => x != null)
          .join(' · '),
        tone: 'green',
      };
    }
    case 'blocked': {
      const until = parse(now.until);
      const label = clubMomentLabel(until ?? 0, until == null ? null : opts.dayAt(until), opts.now);
      return {
        sub: `Wyłączona z użytku · ${blockReasonLabel(now.reason)}${until == null ? '' : ` do ${label.replace(/ \d\d:\d\d$/, '')}`}`,
        tone: 'amber',
      };
    }
    case 'booked':
      return { sub: ['Zarezerwowana', who(now.pilotId)].filter((x): x is string => x != null).join(' · '), tone: null };
    case 'free': {
      if (now.next == null) return { sub: 'Wolna', tone: null };
      const at = parse(now.next.startsAt);
      const label = at == null ? null : clubMomentLabel(at, opts.dayAt(at), opts.now);
      return {
        sub: label == null ? 'Wolna' : `Wolna · ${now.next.kind === 'block' ? 'wyłączenie' : 'następny termin'} ${label}`,
        tone: null,
      };
    }
  }
}

export function watchRows(list: RemoteWatchList, opts: WatchListOptions): WatchRowVm[] {
  return list.items.map((item) => {
    const line = item.serviceStatus === 'active' ? nowLine(item.now, opts) : nowLine({ kind: 'retired' }, opts);
    return { aircraftId: item.aircraftId, reg: item.reg, type: item.type, sub: line.sub, tone: line.tone, on: item.watching };
  });
}
