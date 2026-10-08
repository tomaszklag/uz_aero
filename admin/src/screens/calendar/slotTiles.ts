/**
 * Ninerdeck - panel: SUGESTIE GODZIN jako kafelki (`.slots`, makieta K7, issue #233).
 *
 * Te same sugestie i to samo zdanie, co na 22 w telefonie (`logic/slotChips.ts`): powód
 * liczy domena na serwerze (upakowanie dnia), a ekran dokłada SĄSIADA ze słownika klubu,
 * bo domena zna zajętości wyłącznie jako przedziały czasu.
 *
 * ══ NAZWISKO STOI ZA SEPARATOREM, A NIE W ŚRODKU ZDANIA ══
 * „tuż przed rezerwacją J. Nowaka" wymagałoby odmiany nazwiska, a tej nie da się
 * wyprowadzić regułą. Zdanie zostaje poprawne, a nazwisko dochodzi w mianowniku.
 *
 * Kafelek trafiający w termin z kontrolek jest zaznaczony; kliknięcie w inny przestawia
 * parę godzin. Panel przy „Zarezerwuj za pilota" sugestii NIE ma - to narzędzie pilota
 * szukającego miejsca dla SIEBIE (`docs/rezerwacje.md` §10).
 */

import { shortName } from '@ninerdeck/format';

import type { BookingDto, SlotSuggestionDto } from '../../api/dto';
import { godzina, type PersonLookup } from './bookingLabels';
import type { Span } from './dayTrack';

export interface SlotTile extends Span {
  /** „11:00 → 13:00" czasem klubu. */
  hours: string;
  /** Te same godziny osobno (`HH:MM`) - kliknięcie przestawia nimi parę pól. */
  from: string;
  to: string;
  /** „tuż przed rezerwacją · J. Nowak", „początek dnia". */
  why: string;
  on: boolean;
}

export interface SlotTilesInput {
  suggestions: readonly SlotSuggestionDto[];
  /** Zajętości TEJ maszyny w tej dobie - stąd bierze się sąsiad. */
  busy: readonly BookingDto[];
  window: { from: number; to: number };
  slot: Span | null;
  tz: string;
  person: PersonLookup;
}

export function buildSlotTiles(input: SlotTilesInput): SlotTile[] {
  return input.suggestions.flatMap((s) => {
    const startsAt = Date.parse(s.startsAt);
    const endsAt = Date.parse(s.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return [];
    const from = godzina(new Date(startsAt), input.tz);
    const to = godzina(new Date(endsAt), input.tz);
    return [
      {
        startsAt,
        endsAt,
        hours: `${from} → ${to}`,
        from,
        to,
        why: whyOf(s, startsAt, endsAt, input),
        on: input.slot?.startsAt === startsAt && input.slot.endsAt === endsAt,
      },
    ];
  });
}

function whyOf(s: SlotSuggestionDto, startsAt: number, endsAt: number, input: SlotTilesInput): string {
  switch (s.reason) {
    case 'fills-gap':
      return 'wypełnia wolne okno';
    case 'between-bookings':
      return 'między rezerwacjami';
    case 'next-to-booking': {
      // Domena gwarantuje, że przylega DOKŁADNIE JEDNA strona - zerowa szczelina
      // wskazuje sąsiada jednoznacznie.
      const before = s.gapBeforeMin === 0;
      const neighbour = input.busy.find((b) =>
        before ? Date.parse(b.endsAt) === startsAt : Date.parse(b.startsAt) === endsAt,
      );
      if (neighbour?.kind === 'block') {
        return before ? 'tuż po wyłączeniu z użytku' : 'tuż przed wyłączeniem z użytku';
      }
      // Zlecenie bez kompletu załogi nie jest niczyją rezerwacją (K2c) - a kto w nim
      // ewentualnie siedzi, mówi pasek nad kafelkami.
      if ((neighbour?.order?.seeking.length ?? 0) > 0) return before ? 'tuż po zleceniu' : 'tuż przed zleceniem';
      const head = before ? 'tuż po rezerwacji' : 'tuż przed rezerwacją';
      const who = neighbour?.pilotId == null ? null : input.person(neighbour.pilotId);
      return who == null ? head : `${head} · ${shortName(who.name)}`;
    }
    default:
      // Granica dnia nie jest przyleganiem - ale kafelek na samym świcie ma prawo
      // powiedzieć, gdzie stoi.
      return startsAt === input.window.from ? 'początek dnia' : 'wolny dzień';
  }
}

/**
 * Najbliższe wolne pasmo TEJ SAMEJ długości - akcja banera odmowy K7b („Weź 09:00 → 11:00").
 * Z sugestii policzonych po odmowie, bo to one znają już rezerwację, która zajęła termin.
 */
export function nearestTile(tiles: readonly SlotTile[], slot: Span | null): SlotTile | null {
  if (slot == null) return null;
  const length = slot.endsAt - slot.startsAt;
  const same = tiles.filter((t) => t.endsAt - t.startsAt === length && !(t.startsAt === slot.startsAt));
  if (same.length === 0) return null;
  return same.reduce((best, t) =>
    Math.abs(t.startsAt - slot.startsAt) < Math.abs(best.startsAt - slot.startsAt) ? t : best,
  );
}
