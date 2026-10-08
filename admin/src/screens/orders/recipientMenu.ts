/**
 * Ninerdeck - panel: MENU ⋯ PRZY ADRESACIE ZLECENIA (makieta `zlecenia-szczegoly`, ZL3b;
 * `docs/zlecenia.md` §5.2, §5.3, pkt 14 i 29; 4.0.0, epik Z-D #248).
 *
 * Trzy czynności, które zmieniają czyjś udział w zleceniu - te same, co w telefonie (32D,
 * `orderRecipientMenu.ts`), tymi samymi słowami:
 *  · adresat fotela IMIENNEGO bez przydziału: „Zamień osobę" i „Odbierz zlecenie";
 *  · adresat grupy albo wspólnej listy bez przydziału: samo „Odbierz zlecenie";
 *  · osoba PRZYDZIELONA (karta „Załoga"): samo „Cofnij przydział" - odebrać jej zlecenia
 *    wprost się nie da, żeby nie zniknęła z lotu bez śladu (pkt 14).
 * Pozycji wyszarzonych nie ma, a skutek każdej czynności pada w miejscu wiersza, zanim
 * cokolwiek się zapisze. Powód jest zawsze opcjonalny (pkt 16).
 *
 * ══ KANDYDACI DO ZAMIANY = REGUŁA TELEFONU (`swapCandidates`) ══
 * Aktywni członkowie klubu bez zlecającego, bez osoby wychodzącej, bez tych, którzy już
 * siedzą w fotelu, i bez żywych adresatów TEGO fotela (także z terminem do potwierdzenia -
 * oni już na jego liście są). Osoba z listy DRUGIEGO fotela zostaje kandydatem: po zamianie
 * stanie przy obu fotelach z terminem do potwierdzenia (pkt 37) - opcja i zdanie pod polami
 * mówią to przed zapisem (pkt 39). Kolejność alfabetyczna po nazwisku pełnym, jak
 * w pozostałych listach osób w panelu.
 *
 * Moduł czysty, z testem obok; zdania bez formy z płcią, nazwiska w mianowniku.
 */

import type { DirectoryMemberDto, OrderCardDto, SeatDto } from '../../api/dto';
import type { CrewSeatVm, LeaderRowVm } from './leaderCard';
import { SEAT_ACCUSATIVE, SEAT_GENITIVE } from './orderLabels';

export type RecipientAction =
  | { kind: 'swap'; pilotId: string; seat: SeatDto }
  | { kind: 'remove'; pilotId: string }
  | { kind: 'unassign'; pilotId: string; seat: SeatDto };

export interface MenuEntry {
  action: RecipientAction;
  label: string;
  /** Czynność, która komuś coś odbiera - czerwień pozycji i przycisku potwierdzenia. */
  danger: boolean;
}

/** Menu wiersza adresata; puste = wiersz bez „⋯". */
export function rowMenu(row: LeaderRowVm): MenuEntry[] {
  if (row.menu == null) return [];
  const entries: MenuEntry[] = [];
  if (row.menu.swapSeat != null) {
    entries.push({ action: { kind: 'swap', pilotId: row.pilotId, seat: row.menu.swapSeat }, label: 'Zamień osobę', danger: false });
  }
  entries.push({ action: { kind: 'remove', pilotId: row.pilotId }, label: 'Odbierz zlecenie', danger: true });
  return entries;
}

/** Menu osoby w karcie „Załoga"; puste = fotel bez „⋯" (szukany, „ja", zlecenie zamknięte). */
export function crewMenu(seat: CrewSeatVm): MenuEntry[] {
  if (!seat.unassignable || seat.pilotId == null) return [];
  return [{ action: { kind: 'unassign', pilotId: seat.pilotId, seat: seat.seat }, label: 'Cofnij przydział', danger: true }];
}

export interface ConfirmCopy {
  question: string;
  hint: string;
  placeholder: string;
  confirm: string;
}

/** Pytanie w miejscu wiersza przy odebraniu zlecenia i cofnięciu przydziału. */
export function confirmCopy(action: Exclude<RecipientAction, { kind: 'swap' }>, name: string): ConfirmCopy {
  if (action.kind === 'remove') {
    return {
      question: `Odebrać zlecenie: ${name}?`,
      hint: 'Dostanie wiadomość „Zlecenie nieaktualne". Rozmowa zostanie do odczytu.',
      placeholder: 'Np. fotel obsadzamy z innej grupy',
      confirm: 'Odbierz zlecenie',
    };
  }
  return {
    question: `Cofnąć przydział: ${name}?`,
    hint: `Fotel ${SEAT_GENITIVE[action.seat]} wróci do szukania, a ${name} dostanie wiadomość „Przydział cofnięty". Zgłoszenia pozostałych osób dalej się liczą.`,
    placeholder: 'Np. potrzebny drugi pilot z uprawnieniem na An-2',
    confirm: 'Cofnij przydział',
  };
}

export interface SwapOption {
  value: string;
  label: string;
  /** Osoba z listy drugiego fotela - po zamianie stanie przy obu z terminem do potwierdzenia. */
  bothSeats: boolean;
}

const other = (seat: SeatDto): SeatDto => (seat === 'pic' ? 'dual' : 'pic');

/** Lista „Zamień na" - opcja niesie nazwisko, kod i (gdy trzeba) to, gdzie osoba już jest. */
export function swapOptions(input: {
  card: OrderCardDto;
  seat: SeatDto;
  outgoing: string;
  members: readonly DirectoryMemberDto[];
}): SwapOption[] {
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
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    .map((m) => {
      const there = onOther.get(m.id);
      const where =
        there == null ? '' : there.direct ? ` · imiennie na ${SEAT_ACCUSATIVE[other(seat)]}` : ` · na liście ${SEAT_GENITIVE[other(seat)]}`;
      return { value: m.id, label: `${m.name} · ${m.code}${where}`, bothSeats: there != null };
    });
}

/** Zdanie pod polami zamiany: co dostanie każda ze stron. Bez wyboru - sama strona wychodząca. */
export function swapHint(outgoing: string, pick: { name: string; bothSeats: boolean } | null, seat: SeatDto): string {
  const leaving = `${outgoing} dostanie wiadomość „Zlecenie nieaktualne"`;
  if (pick == null) return `${leaving}.`;
  if (pick.bothSeats) return `${leaving}. ${pick.name} ma już to zlecenie - zostanie przy obu fotelach z terminem do potwierdzenia.`;
  return `${leaving}, a ${pick.name} - to zlecenie z propozycją fotela ${SEAT_GENITIVE[seat]}.`;
}
