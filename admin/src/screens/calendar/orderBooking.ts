/**
 * Ninerdeck - panel: SZUFLADA ZAJĘTOŚCI ZE ZLECENIEM (makieta `kalendarz-wpis`, K2c; 4.0.0,
 * epik Z-D #248; `docs/zlecenia.md` §5, §13.1, §14.3, §16 pkt 6 i 9).
 *
 * Zlecenie JEST rezerwacją z pustym fotelem, więc kliknięcie w jego pasek otwiera tę samą
 * szufladę zajętości - to ten sam wiersz `bookings`. Szuflada NIE powtarza karty zlecenia:
 * adresatów, odczyty i wybór załogi prowadzi moduł Zlecenia, a stąd prowadzą do niego jedne
 * drzwi („Otwórz zlecenie"). Kształt zależy od widza (§13.1):
 *  - PROWADZĄCY (autor i każdy z „Cudzymi rezerwacjami") - skrót: treść, fotel po fotelu
 *    jednym wierszem (bez nazwisk adresatów), kto zleca; odwołanie zlecenia z powodem
 *    OPCJONALNYM (decyzja 16 - reguła P4 dotyczy rezerwacji pilotów, nie zleceń);
 *  - OSOBA W FOTELU - szuflada własnej rezerwacji (K2b) z trzema różnicami, tymi samymi, co
 *    karta 23F w telefonie: „Ze zlecenia" prowadzi do rozmowy, zmiany terminu NIE MA (termin
 *    prowadzi zlecenie), zamiast odwołania stoi „Rezygnuję";
 *  - ADRESAT - kogo brakuje i drzwi do karty zlecenia; nic o innych adresatach (decyzja 18);
 *  - CZŁONEK SPOZA ADRESATÓW - kogo brakuje i nic więcej.
 *
 * Rolę rozstrzyga sama rezerwacja z okna kalendarza, bez czekania na kartę zlecenia: serwer
 * dokłada identyfikator zlecenia WYŁĄCZNIE prowadzącemu i adresatom (`bookingOrderWire`).
 *
 * Moduł czysty - test obok.
 */

import type { BookingDto, OrderCardDto, SeatDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import type { LeaderCardVm, SeatBlockVm } from '../orders/leaderCard';
import { SEAT_GENITIVE, SEAT_LABEL, seekingLabel } from '../orders/orderLabels';
import type { OrderPeriod } from '../orders/orderPaths';
import { NONE } from '../common/values';
import type { PersonLookup } from './bookingLabels';

export type OrderBookingRole = 'leader' | 'seated' | 'recipient' | 'outsider';

/** Wiersz karty „Zlecenie" / „Rezerwacja" - etykieta, wartość i przypis po niej. */
export interface OrderRowVm {
  label: string;
  value: string;
  sub: string | null;
}

const SEATS: readonly SeatDto[] = ['pic', 'dual'];

const seated = (booking: Pick<BookingDto, 'pilotId' | 'dualId'>, seat: SeatDto): string | null =>
  seat === 'pic' ? booking.pilotId : (booking.dualId ?? null);

/**
 * Kim jest patrzący wobec zlecenia za tą rezerwacją; `null` = to zwykła zajętość.
 *
 * Kolejność ma znaczenie: autor siedzący w swoim fotelu „ja" PROWADZI (jego „odwołaj" jest
 * odwołaniem zlecenia - decyzja 2026-09-30), a osoba przydzielona do fotela patrzy na swój
 * lot, nawet z „Cudzymi rezerwacjami". Zlecenie obsadzone w komplecie jest dla adresata
 * i członka spoza adresatów zwykłą zajętością tej załogi - nie ma już kogo szukać.
 */
export function orderBookingRole(
  booking: Pick<BookingDto, 'kind' | 'order' | 'pilotId' | 'dualId'>,
  viewerId: string | null,
  canManage: boolean,
): OrderBookingRole | null {
  const order = booking.order;
  if (booking.kind !== 'flight' || order == null) return null;
  if (viewerId != null && order.createdBy === viewerId) return 'leader';
  if (viewerId != null && (booking.pilotId === viewerId || booking.dualId === viewerId)) return 'seated';
  if (order.id != null && canManage) return 'leader';
  if (order.seeking.length === 0) return null;
  return order.id == null ? 'outsider' : 'recipient';
}

/** „dowódcy i drugiego pilota" - kogo zlecenie szuka, w dopełniaczu; `null` = nikogo. */
export function seekingWho(seeking: readonly SeatDto[]): string | null {
  if (seeking.length >= 2) return `${SEAT_GENITIVE.pic} i ${SEAT_GENITIVE.dual}`;
  return seeking[0] == null ? null : SEAT_GENITIVE[seeking[0]];
}

/**
 * Plakietka w podtytule szuflady prowadzącego - kogo brakuje albo komplet, jak w nagłówku
 * jego szuflady zlecenia. Liczy się z rezerwacji, więc nie czeka na kartę zlecenia; termin
 * zamknięty (zlecenie odwołane albo wygasłe) plakietki nie ma - mówi o nim treść szuflady.
 */
export function leaderPill(booking: Pick<BookingDto, 'order' | 'status'>): { text: string; tone: PillTone } | null {
  if (booking.status !== 'confirmed' && booking.status !== 'pending') return null;
  const seeking = booking.order?.seeking ?? [];
  return { text: seekingLabel(seeking) ?? 'Komplet załogi', tone: seeking.length === 0 ? 'green' : 'blue' };
}

/** Okres listy zleceń, w którym stoi ten termin - „Otwórz zlecenie" ląduje nad właściwą połową. */
export function orderPeriodOf(booking: Pick<BookingDto, 'endsAt'>, now: number): OrderPeriod {
  return Date.parse(booking.endsAt) <= now ? 'past' : 'upcoming';
}

/**
 * Fotele OBSADZONE (dowódca przed drugim pilotem) - adresatowi i członkowi spoza adresatów.
 * To samo nazwisko, które niesie pasek na osi, więc nic tu nie wycieka; pusty fotel wiersza
 * NIE MA - mówi o nim „Szuka".
 */
export function seatedRows(booking: BookingDto, person: PersonLookup): OrderRowVm[] {
  const sought = booking.order?.seeking ?? [];
  return SEATS.flatMap((seat) => {
    const id = seated(booking, seat);
    if (id == null || sought.includes(seat)) return [];
    const who = person(id);
    return [{ label: SEAT_LABEL[seat], value: who?.name ?? NONE, sub: who?.code ?? null }];
  });
}

/**
 * Karta „Zlecenie" prowadzącego: treść z karty zlecenia, potem fotel po fotelu JEDNYM
 * wierszem (szukany: jak zapytano i co z tego wyszło; obsadzony: kto), na końcu kto zleca.
 * Nazwisk adresatów i odczytów tu nie ma - są na karcie zlecenia, do której prowadzą drzwi
 * pod spodem.
 */
export function leaderRows(vm: LeaderCardVm, card: OrderCardDto, person: PersonLookup, viewerId: string | null): OrderRowVm[] {
  const creator = vm.details.filter((d) => d.label === 'Zleca');
  const content = vm.details.filter((d) => d.label !== 'Zleca');
  const seats = SEATS.flatMap((seat): OrderRowVm[] => {
    const state = card.order.seats[seat];
    if (state === 'none') return [];
    const id = seated(card.booking, seat);
    if (id != null) {
      const who = id === viewerId ? null : person(id);
      return [
        {
          label: SEAT_LABEL[seat],
          value: id === viewerId ? 'Ty' : (who?.name ?? NONE),
          sub: [who?.code ?? null, state === 'self' ? 'osoba zlecająca' : null].filter((p): p is string => p != null).join(' · ') || null,
        },
      ];
    }
    const block = vm.blocks.find((b) => b.key === seat || b.key === 'shared') ?? null;
    return [{ label: SEAT_LABEL[seat], value: 'szukany', sub: block == null ? null : seekingSub(block, vm.closed) }];
  });
  return [...content, ...seats, ...creator];
}

/**
 * „imiennie · bez odpowiedzi", „Piloci An-2 · 2 mogą lecieć", „wspólna lista · odmowa" -
 * jak zapytano i co z tego wyszło. Zlecenie zamknięte mówi samo „jak": odpowiedzi nie są
 * już na nic podpowiedzią.
 */
function seekingSub(block: SeatBlockVm, closed: boolean): string | null {
  const how = block.key === 'shared' ? (block.how == null ? 'wspólna lista' : `wspólna lista · ${block.how}`) : block.how;
  const { yes, no, open } = block.answers;
  const outcome = closed
    ? null
    : (block.count ??
      (yes > 0 ? null : open > 0 ? 'bez odpowiedzi' : no === 1 ? 'odmowa' : no > 1 ? 'wszyscy odmówili' : null));
  return [how, outcome].filter((p): p is string => p != null).join(' · ') || null;
}

/** Skutek rezygnacji PRZED kliknięciem - kto dostanie wiadomość i co z terminem (§5.3). */
export function resignNote(booking: BookingDto, person: PersonLookup): string {
  const creator = booking.order?.createdBy == null ? null : person(booking.order.createdBy);
  const who = creator == null ? 'osoba zlecająca' : creator.name;
  return `Fotel znów będzie do obsadzenia, a ${who} dostanie wiadomość. Termin zostaje zajęty.`;
}
