/**
 * Ninerdeck - „POWIEL" ZLECENIE (4.0.0, epik Z-C #247; makiety 32, 31; `docs/zlecenia.md`
 * §14.4): formularz z tą samą treścią i pustym terminem - na drugą zmianę dnia skokowego.
 *
 * ══ CO PRZECHODZI ══
 * Maszyna, zadanie, trasa, plan lotu, opis, fotele i adresaci. Godziny NIE: dwa terminy
 * tej samej maszyny nie mogą na siebie zachodzić, więc przepisane godziny byłyby od razu
 * kolizją z oryginałem. Doba zostaje, dopóki się nie skończyła - druga zmiana dnia
 * skokowego jest TEGO dnia, a zlecenie sprzed tygodnia prowadziłoby w przeszłość.
 *
 * ══ ADRESACI Z LISTY ROZWINIĘTEJ ══
 * Karta prowadzącego niesie adresatów już rozwiniętych w osoby (§6.2), każdego z grupą,
 * przez którą trafił, i fotelem. Definicję składamy z powrotem: osoba bez grupy była
 * wskazana imiennie, grupa jest grupą. Osoba z terminem do potwierdzenia stała na listach
 * OBU foteli - imiennie na `namedSeat`, przez grupę na drugim. Odebranych (pkt 29) nie
 * przepisujemy: zlecenie im odebrano, więc powielenie nie ma prawa go oddać.
 *
 * ══ „JA" CUDZEGO ZLECENIA TO NIE JA ══
 * Koordynator powielający zlecenie innej osoby nie siada w jej fotelu: „ja" autora
 * oryginału staje się fotelem szukanym bez adresatów, a bramka kroku 3 poprosi o nich.
 */

import type { RemoteAddressList, RemoteOrderCard, RemoteSeat } from '../../../application';

import {
  emptyList,
  emptySeat,
  otherSeat,
  SEAT_KEYS,
  unionLists,
  type OrderDraft,
  type SeatAddress,
} from './orderForm';
import { orderDay } from './orderFormat';
import { operationTypeOf } from './operations';

export interface DuplicateSeed {
  draft: Partial<OrderDraft>;
  /** Kotwica okna kalendarza - doba oryginału, jeśli przechodzi; inaczej dziś. */
  anchor: number | null;
}

export function duplicateSeed(input: { card: RemoteOrderCard; viewerId: string; now: number }): DuplicateSeed {
  const { card } = input;
  const b = card.booking;
  const order = card.order;
  const mine = order.createdBy === input.viewerId;
  const day = orderDay(card.day);
  const dayAhead = day != null && day.endsAt > input.now;

  const seats = {
    pic: order.seats.pic === 'self' && !mine ? 'sought' : order.seats.pic,
    dual: order.seats.dual === 'self' && !mine ? 'sought' : order.seats.dual,
  } as const;

  const lists = listsOf(card);
  const draft: Partial<OrderDraft> = {
    aircraftId: b.aircraftId,
    date: dayAhead ? card.day.date : null,
    operation: operationTypeOf(b.operation),
    departureIcao: b.fromIcao ?? '',
    arrivalIcao: b.toIcao ?? '',
    plannedAirMin: b.plannedAirMin,
    plannedFuelL: b.plannedFuelL,
    notes: b.note,
    seats: { pic: seats.pic, dual: seats.dual },
  };

  if (order.addressing === 'shared') {
    // Lista wspólna to suma list foteli i dopisanych (pkt 47, 48) - całość czeka
    // w dopisanych, więc wyłączenie przełącznika postawi ją przy obu fotelach.
    draft.shared = true;
    draft.sharedExtra = unionLists(lists.pic, lists.dual, lists.shared);
  } else {
    draft.pic = seatOf(lists.pic);
    draft.dual = seatOf(lists.dual);
  }

  return { draft, anchor: dayAhead && day != null ? (day.startsAt + day.endsAt) / 2 : null };
}

/** Jedna osoba bez grup to wskazanie imienne; reszta - „Grupa · lub kilka osób". */
function seatOf(list: RemoteAddressList): SeatAddress {
  if (list.groupIds.length === 0 && list.pilotIds.length === 1) {
    return { ...emptySeat(), mode: 'person', person: list.pilotIds[0]! };
  }
  if (list.groupIds.length === 0 && list.pilotIds.length === 0) return emptySeat();
  return { mode: 'group', person: null, list };
}

/** Adresaci zlecenia złożeni z powrotem w definicję - osoba bez grupy imiennie, grupa jako grupa. */
export function listsOf(card: RemoteOrderCard): Record<RemoteSeat | 'shared', RemoteAddressList> {
  const out: Record<RemoteSeat | 'shared', RemoteAddressList> = {
    pic: emptyList(),
    dual: emptyList(),
    shared: emptyList(),
  };
  const add = (key: RemoteSeat | 'shared', kind: 'pilotIds' | 'groupIds', id: string) => {
    if (!out[key][kind].includes(id)) out[key][kind].push(id);
  };

  const live = (card.recipients ?? []).filter((r) => !r.removed);
  // Fotel grupy znamy z adresatów, którzy trafili przez nią na JEDEN fotel.
  const groupSeats = new Map<string, Set<RemoteSeat>>();
  for (const r of live) {
    if (r.viaGroupId == null || r.seat == null) continue;
    const set = groupSeats.get(r.viaGroupId) ?? new Set<RemoteSeat>();
    set.add(r.seat);
    groupSeats.set(r.viaGroupId, set);
  }

  for (const r of live) {
    if (card.order.addressing === 'shared') {
      add('shared', r.viaGroupId == null ? 'pilotIds' : 'groupIds', r.viaGroupId ?? r.pilotId);
      continue;
    }
    if (r.seat != null) {
      if (r.viaGroupId == null) add(r.seat, 'pilotIds', r.pilotId);
      else add(r.seat, 'groupIds', r.viaGroupId);
      continue;
    }
    // Termin do potwierdzenia: osoba z list obu foteli.
    if (r.namedSeat != null) {
      add(r.namedSeat, 'pilotIds', r.pilotId);
      if (r.viaGroupId != null) add(otherSeat(r.namedSeat), 'groupIds', r.viaGroupId);
      else add(otherSeat(r.namedSeat), 'pilotIds', r.pilotId);
    } else if (r.viaGroupId == null) {
      // Imiennie na oba fotele naraz.
      for (const seat of SEAT_KEYS) add(seat, 'pilotIds', r.pilotId);
    } else {
      // Przez grupy na oba fotele - grupę tej osoby stawiamy tam, gdzie stała dla innych,
      // a nieznaną nigdzie indziej - na obu.
      const known = groupSeats.get(r.viaGroupId);
      for (const seat of known == null || known.size === 0 ? SEAT_KEYS : [...known]) {
        add(seat, 'groupIds', r.viaGroupId);
      }
    }
  }
  return out;
}
