/**
 * Ninerdeck - panel: EDYCJA i POWIELENIE ZLECENIA (makiety `zlecenia-nowe` ZL2c
 * i `zlecenia-szczegoly`; 4.0.0, epik Z-D #248; `docs/zlecenia.md` §5.1, §5.2, §14.4).
 *
 * Ten sam formularz zakłada zlecenie, poprawia je i powiela, bo pyta o to samo. Różni się
 * tym, co znaczy „zapisz" - i to jest treść tego modułu. Reguły są te same, co w telefonie
 * (`orderEdit.ts` i `orderDuplicate.ts` w aplikacji, Z-C).
 *
 * ══ POPRAWKA NIESIE SAMĄ RÓŻNICĘ ══
 * `PATCH` zostawia pola pominięte bez zmian, więc jadą tylko te, które prowadzący ruszył.
 * Zmiana TERMINU podnosi wersję zlecenia i każe adresatom odpowiadać od nowa (§5.1) -
 * dlatego termin jedzie tylko wtedy, gdy naprawdę się zmienił, a formularz mówi o skutku,
 * zanim prowadzący zapisze.
 *
 * ══ WYSŁANYCH SIĘ TU NIE ODBIERA ══
 * Szkic edycji trzyma WYŁĄCZNIE dopisanych - jadą jako `addRecipients` i zlecenie dostaną
 * tylko oni (§5.2). Wysłani stoją na listach zaznaczeni i zablokowani; odebranie zlecenia
 * to osobna czynność z wiadomością i powodem (pkt 29) - menu ⋯ przy adresacie na karcie.
 * Sposobu adresowania poprawka nie zmienia: „Wspólna lista" jest zablokowana, a inny
 * sposób to nowe zlecenie przez „Powiel".
 *
 * ══ POWIEL = TA SAMA TREŚĆ, PUSTE GODZINY ══
 * Maszyna, zadanie, trasa, plan, opis, fotele i adresaci przechodzą; godziny NIE - dwa
 * terminy tej samej maszyny nie mogą na siebie zachodzić. Doba zostaje, dopóki się nie
 * skończyła (druga zmiana dnia skokowego). „Ja" cudzego zlecenia to nie ja: fotel autora
 * oryginału staje się szukanym bez adresatów. Odebranych nie przepisujemy (pkt 29).
 *
 * Moduł czysty - test obok.
 */

import type { AddressListDto, OrderCardDto, OrderPatchDto, SeatDto } from '../../api/dto';
import type { Blocker } from '../calendar/blockForm';
import { clubParts } from '../calendar/clubClock';
import { draftSlot, parseFuel, parsePlannedAir, singleField } from '../calendar/ownBookingForm';
import {
  emptyList,
  emptyOrderForm,
  isEmptyList,
  otherSeat,
  peopleOf,
  seatsOf,
  SEATS,
  soughtSeats,
  unionLists,
  type AudienceContext,
  type FormAircraft,
  type OrderFormDraft,
  type SeatAddress,
  type SentAddressees,
} from './orderForm';
import { hoursSpan, termShortDay } from './orderLabels';

const hhmmOf = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** Zadanie, trasa, plan i opis zlecenia jako pola formularza. */
function taskOf(card: OrderCardDto): Pick<OrderFormDraft, 'operation' | 'fromIcao' | 'toIcao' | 'plannedAir' | 'plannedFuel' | 'note'> {
  const b = card.booking;
  return {
    operation: b.operation ?? '',
    fromIcao: b.fromIcao ?? '',
    toIcao: b.toIcao ?? '',
    plannedAir: b.plannedAirMin == null ? '' : hhmmOf(b.plannedAirMin),
    plannedFuel: b.plannedFuelL == null ? '' : String(b.plannedFuelL).replace('.', ','),
    note: b.note ?? '',
  };
}

/** Szkic odtworzony z karty prowadzącego - punkt odniesienia dla „co się zmieniło". */
export function draftOfOrder(card: OrderCardDto): OrderFormDraft {
  const tz = card.timezone;
  const start = clubParts(Date.parse(card.booking.startsAt), tz);
  const end = clubParts(Date.parse(card.booking.endsAt), tz);
  const additions = (): SeatAddress => ({ mode: 'group', person: null, list: emptyList() });
  return {
    ...emptyOrderForm(),
    aircraftId: card.booking.aircraftId,
    date: start.date,
    from: start.hhmm,
    to: end.hhmm,
    ...taskOf(card),
    seats: { ...card.order.seats },
    // W edycji listy foteli niosą WYŁĄCZNIE dopisanych - wysłani stoją na karcie.
    pic: additions(),
    dual: additions(),
    shared: card.order.addressing === 'shared',
  };
}

const live = (card: OrderCardDto) => (card.recipients ?? []).filter((r) => !r.removed);

/**
 * Adresaci zlecenia złożeni z powrotem w definicję - osoba bez grupy imiennie, grupa jako
 * grupa. Osoba z terminem do potwierdzenia stała na listach OBU foteli: imiennie na
 * `namedSeat`, przez grupę albo imiennie na drugim.
 */
export function listsOf(card: OrderCardDto): Record<SeatDto | 'shared', AddressListDto> {
  const out: Record<SeatDto | 'shared', AddressListDto> = { pic: emptyList(), dual: emptyList(), shared: emptyList() };
  const add = (key: SeatDto | 'shared', kind: 'pilotIds' | 'groupIds', id: string): void => {
    if (!out[key][kind].includes(id)) out[key][kind].push(id);
  };
  // Fotel grupy znamy z adresatów, którzy trafili przez nią na JEDEN fotel.
  const groupSeats = new Map<string, Set<SeatDto>>();
  for (const r of live(card)) {
    if (r.viaGroupId == null || r.seat == null) continue;
    groupSeats.set(r.viaGroupId, (groupSeats.get(r.viaGroupId) ?? new Set<SeatDto>()).add(r.seat));
  }
  for (const r of live(card)) {
    if (card.order.addressing === 'shared') {
      add('shared', r.viaGroupId == null ? 'pilotIds' : 'groupIds', r.viaGroupId ?? r.pilotId);
    } else if (r.seat != null) {
      add(r.seat, r.viaGroupId == null ? 'pilotIds' : 'groupIds', r.viaGroupId ?? r.pilotId);
    } else if (r.namedSeat != null) {
      add(r.namedSeat, 'pilotIds', r.pilotId);
      add(otherSeat(r.namedSeat), r.viaGroupId == null ? 'pilotIds' : 'groupIds', r.viaGroupId ?? r.pilotId);
    } else if (r.viaGroupId == null) {
      for (const seat of SEATS) add(seat, 'pilotIds', r.pilotId);
    } else {
      const known = groupSeats.get(r.viaGroupId);
      for (const seat of known == null || known.size === 0 ? SEATS : [...known]) add(seat, 'groupIds', r.viaGroupId);
    }
  }
  return out;
}

/**
 * Wysłani na listę fotela albo listę wspólną - osoby, które zlecenie mają (na dowolnym
 * fotelu, więc dopisać ich drugi raz się nie da), i grupy tej listy z liczbą osób.
 */
export function sentOf(card: OrderCardDto, target: SeatDto | 'shared'): SentAddressees {
  const people = new Set(live(card).map((r) => r.pilotId));
  const groups = new Map<string, number>();
  for (const id of listsOf(card)[target].groupIds) {
    groups.set(id, live(card).filter((r) => r.viaGroupId === id).length);
  }
  return { people, groups };
}

const orNull = (text: string): string | null => (text.trim() === '' ? null : text.trim());
const icao = (text: string): string | null => orNull(text)?.toUpperCase() ?? null;

/** Dopisani w tej edycji - wyłącznie przy fotelach, których zlecenie (po zmianie) szuka. */
function addedRecipients(draft: OrderFormDraft, aircraft: FormAircraft | null): NonNullable<OrderPatchDto['addRecipients']> {
  if (draft.shared) return isEmptyList(draft.sharedExtra) ? [] : [{ seat: null, list: draft.sharedExtra }];
  return soughtSeats(seatsOf(draft, aircraft))
    .filter((seat) => !isEmptyList(draft[seat].list))
    .map((seat) => ({ seat, list: draft[seat].list }));
}

/**
 * Różnica gotowa na drut. `null` = nic się nie zmieniło albo szkic nie przechodzi bramek -
 * „Zapisz zmiany" stoi wtedy zablokowany.
 */
export function orderPatchOf(draft: OrderFormDraft, base: OrderFormDraft, tz: string, aircraft: FormAircraft | null): OrderPatchDto | null {
  const slot = draftSlot(draft, tz);
  const baseSlot = draftSlot(base, tz);
  const air = parsePlannedAir(draft.plannedAir);
  const fuel = parseFuel(draft.plannedFuel);
  if (slot == null || air == null || fuel === undefined) return null;

  const patch: OrderPatchDto = {};
  if (slot.startsAt !== baseSlot?.startsAt) patch.startsAt = new Date(slot.startsAt).toISOString();
  if (slot.endsAt !== baseSlot?.endsAt) patch.endsAt = new Date(slot.endsAt).toISOString();
  if (draft.aircraftId !== base.aircraftId) patch.aircraftId = draft.aircraftId;
  if (draft.operation !== base.operation) patch.operation = draft.operation;
  const one = singleField(draft.operation);
  const fromIcao = icao(draft.fromIcao);
  const toIcao = one ? null : icao(draft.toIcao);
  if (fromIcao !== icao(base.fromIcao)) patch.fromIcao = fromIcao;
  if (toIcao !== (singleField(base.operation) ? null : icao(base.toIcao))) patch.toIcao = toIcao;
  if (air !== parsePlannedAir(base.plannedAir)) patch.plannedAirMin = air;
  if (fuel !== (parseFuel(base.plannedFuel) ?? null)) patch.plannedFuelL = fuel;
  if (orNull(draft.note) !== orNull(base.note)) patch.note = orNull(draft.note);

  const seats = seatsOf(draft, aircraft);
  const baseSeats = seatsOf(base, aircraft);
  if (seats.pic !== baseSeats.pic || seats.dual !== baseSeats.dual) patch.seats = seats;

  const adds = addedRecipients(draft, aircraft);
  if (adds.length > 0) patch.addRecipients = adds;
  return Object.keys(patch).length === 0 ? null : patch;
}

export const termChanged = (draft: OrderFormDraft, base: OrderFormDraft): boolean =>
  draft.date !== base.date || draft.from !== base.from || draft.to !== base.to;

/**
 * Wiersz „Termin" przy banerze zmiany (ZL2c): poprzednie godziny przekreślone → nowe.
 * Doba dochodzi wyłącznie wtedy, gdy zmienił się też dzień. `null` = termin bez zmiany.
 */
export function termShift(draft: OrderFormDraft, base: OrderFormDraft, tz: string): { was: string; now: string } | null {
  if (!termChanged(draft, base)) return null;
  const a = draftSlot(base, tz);
  const b = draftSlot(draft, tz);
  if (a == null || b == null) return null;
  const day = draft.date !== base.date;
  const label = (s: { startsAt: number; endsAt: number }): string =>
    day ? `${termShortDay(s.startsAt, tz)} ${hoursSpan(s.startsAt, s.endsAt, tz)}` : hoursSpan(s.startsAt, s.endsAt, tz);
  return { was: label(a), now: label(b) };
}

/**
 * Fotel, w którym ktoś już siedzi, przestawiony na „Ja" albo „Brak" zdejmuje tę osobę
 * z lotu (§5.2) - formularz mówi to pod kartami stanu, zanim prowadzący zapisze. Liczy się
 * wyłącznie fotel SZUKANY: w fotelu „Ja" siedzi zlecający, który sam przestawia układ.
 */
export function seatLossNote(card: OrderCardDto, draft: OrderFormDraft, seat: SeatDto, aircraft: FormAircraft | null): string | null {
  const sitting = seat === 'pic' ? card.booking.pilotId : card.booking.dualId;
  if (sitting == null || card.order.seats[seat] !== 'sought') return null;
  return seatsOf(draft, aircraft)[seat] === 'sought'
    ? null
    : 'Osoba przydzielona do tego fotela straci przydział - dostanie wiadomość „Przydział cofnięty".';
}

/** Żywi adresaci listy - przy wspólnej liście i terminie do potwierdzenia: obu foteli. */
function liveOn(card: OrderCardDto, target: SeatDto | 'shared'): number {
  return live(card).filter((r) => target === 'shared' || r.seat === target || r.seat == null).length;
}

/**
 * Bramka „Zapisz zmiany" na kroku 3. Te same powody, co przy wysłaniu, z jedną różnicą:
 * szukany fotel ma adresatów, jeśli ma ich wysłanych ALBO dopisanych.
 */
export function editStep3Blocker(draft: OrderFormDraft, card: OrderCardDto, aircraft: FormAircraft | null): Blocker {
  const seats = seatsOf(draft, aircraft);
  const sought = soughtSeats(seats);
  if (sought.length === 0) return { reason: 'Ustaw „Szukam" przy co najmniej jednym fotelu.' };
  if (seats.dual === 'none' && aircraft?.dualRequired === true) {
    return { reason: `${aircraft.reg === '' ? 'Ta maszyna' : aircraft.reg} wymaga załogi dwuosobowej.` };
  }
  if (draft.shared) return liveOn(card, 'shared') === 0 && isEmptyList(draft.sharedExtra) ? 'incomplete' : null;
  return sought.some((seat) => liveOn(card, seat) === 0 && isEmptyList(draft[seat].list)) ? 'incomplete' : null;
}

/**
 * Stopka edycji: do ilu NOWYCH osób trafi zlecenie i czy pozostali zobaczą zmianę
 * (§5.2: dopisanie wysyła zlecenie wyłącznie nowym, każda inna zmiana to „Zlecenie
 * edytowane"). `null` = zapis niczego nikomu nie wyśle (brak zmian).
 */
export function editNote(patch: OrderPatchDto | null, card: OrderCardDto, ctx: AudienceContext): string | null {
  if (patch == null) return null;
  const { addRecipients, ...rest } = patch;
  const others = Object.keys(rest).length > 0;
  const added = unionLists(...(addRecipients ?? []).map((a) => a.list));
  const sent = new Set(live(card).map((r) => r.pilotId));
  const people = isEmptyList(added) ? null : peopleOf(added, ctx);
  const fresh = people == null ? 0 : [...people.keys()].filter((id) => !sent.has(id)).length;
  const reach = fresh === 0 ? null : `Trafi do ${fresh} ${fresh === 1 ? 'nowej osoby' : 'nowych osób'}`;
  if (reach != null && others) return `${reach} · pozostali zobaczą, co zmieniono`;
  if (reach != null) return reach;
  return others ? 'Adresaci zobaczą, co zmieniono' : null;
}

/** Fotel po powieleniu: jedna osoba bez grup to wskazanie imienne, reszta - „Grupa". */
function seatOf(list: AddressListDto): SeatAddress {
  if (list.groupIds.length === 0 && list.pilotIds.length === 1) return { mode: 'person', person: list.pilotIds[0]!, list: emptyList() };
  if (isEmptyList(list)) return { mode: 'person', person: null, list: emptyList() };
  return { mode: 'group', person: null, list };
}

/** „Powiel zlecenie" - ta sama treść z pustymi godzinami (§14.4). */
export function duplicateDraft(card: OrderCardDto, viewerId: string | null, now: number): OrderFormDraft {
  const mine = card.order.createdBy === viewerId;
  const seats = {
    pic: card.order.seats.pic === 'self' && !mine ? ('sought' as const) : card.order.seats.pic,
    dual: card.order.seats.dual === 'self' && !mine ? ('sought' as const) : card.order.seats.dual,
  };
  const lists = listsOf(card);
  const dayAhead = Date.parse(card.day.endsAt) > now;
  const base: OrderFormDraft = {
    ...emptyOrderForm({ aircraftId: card.booking.aircraftId, date: dayAhead ? card.day.date : '' }),
    ...taskOf(card),
    seats,
  };
  if (card.order.addressing === 'shared') {
    // Lista wspólna to suma list foteli i dopisanych (pkt 47, 48) - całość czeka
    // w dopisanych, więc wyłączenie przełącznika postawi ją przy obu fotelach.
    return { ...base, shared: true, sharedExtra: unionLists(lists.pic, lists.dual, lists.shared) };
  }
  return { ...base, pic: seatOf(lists.pic), dual: seatOf(lists.dual) };
}
