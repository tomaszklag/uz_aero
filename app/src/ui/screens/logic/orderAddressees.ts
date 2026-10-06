/**
 * Ninerdeck - LISTA OSÓB W ARKUSZU ADRESATÓW (4.0.0, epik Z-C #247; makiety 31C, 32D;
 * `docs/zlecenia.md` §6, pkt 37 i 39).
 *
 * Arkusz 31C ma dwa kształty: z grupami i wyborem wielu osób (formularz zlecenia) albo
 * „z samą listą osób, bez grup i z wyborem pojedynczym" (31B) - ten drugi otwiera też
 * „ZAMIEŃ OSOBĘ" na karcie prowadzącego (32D). Tu mieszka lista osób dla obu.
 *
 * ══ CZEGO NA LIŚCIE NIE MA ══
 *  - osoby zlecającej - nie jest adresatem nawet przez grupę (§6.2);
 *  - członków wyłączonych - nie dostają zleceń (§6.1);
 *  - kogoś, kto już siedzi w fotelu tego lotu, i kogoś, kto już jest na liście tego
 *    fotela - wybór obiecywałby zmianę, której nie ma.
 *
 * ══ PODPIS MÓWI SKUTEK PRZED ZAZNACZENIEM (pkt 39) ══
 * Osoba z listy DRUGIEGO fotela zostaje na liście i da się ją wybrać - trafi wtedy na
 * listy obu foteli i dostanie termin do potwierdzenia (pkt 37). Podpis nie ma formy
 * z płcią: „imiennie na dowódcę", nie „wskazany na dowódcę".
 */

import { foldPolish } from '../../../domain';
import type { RemoteOrderCard, RemoteSeat } from '../../../application';

import { seatAccusative, seatGenitive } from './orderFormat';
import { bySurname } from './polishOrder';

export interface AddresseeOption {
  pilotId: string;
  name: string;
  code: string | null;
  /** „imiennie na dowódcę · po zaznaczeniu termin do potwierdzenia". */
  sub: string | null;
}

export interface Member {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

const CONFIRM = 'po zaznaczeniu termin do potwierdzenia';
const other = (seat: RemoteSeat): RemoteSeat => (seat === 'pic' ? 'dual' : 'pic');

/** Kandydaci na fotel imienny w miejsce osoby odbieranej (32D → 31C). */
export function swapCandidates(input: {
  card: RemoteOrderCard;
  seat: RemoteSeat;
  outgoing: string;
  members: readonly Member[];
}): AddresseeOption[] {
  const { card, seat } = input;
  const seated = new Set([card.booking.pilotId, card.booking.dualId].filter((id): id is string => id != null));
  const live = (card.recipients ?? []).filter((r) => !r.removed);
  // `seat: null` znaczy listy OBU foteli - taka osoba już jest na liście tego.
  const onThisSeat = new Set(live.filter((r) => r.seat === seat || r.seat == null).map((r) => r.pilotId));
  const onOther = new Map(live.filter((r) => r.seat === other(seat)).map((r) => [r.pilotId, r]));

  return input.members
    .filter(
      (m) =>
        m.active &&
        m.id !== card.order.createdBy &&
        m.id !== input.outgoing &&
        !seated.has(m.id) &&
        !onThisSeat.has(m.id),
    )
    .sort((a, b) => bySurname(a.name, b.name))
    .map((m) => {
      const there = onOther.get(m.id);
      const sub =
        there == null
          ? null
          : there.direct
            ? `imiennie na ${seatAccusative(other(seat))} · ${CONFIRM}`
            : `na liście ${seatGenitive(other(seat))} · ${CONFIRM}`;
      return { pilotId: m.id, name: m.name, code: m.code, sub };
    });
}

/**
 * Wyszukiwarka arkusza: imię, nazwisko albo kod - od początku dowolnego wyrazu, bez
 * wielkości liter i bez ogonków („lukasz" znajduje „Łukasza"). Pusty wpis oddaje listę.
 */
export function filterAddressees(options: readonly AddresseeOption[], query: string): AddresseeOption[] {
  const needle = foldPolish(query.trim());
  if (needle === '') return [...options];
  return options.filter((o) => {
    const words = foldPolish(o.name).split(/\s+/);
    return words.some((w) => w.startsWith(needle)) || foldPolish(o.code ?? '').startsWith(needle) || foldPolish(o.name).startsWith(needle);
  });
}
