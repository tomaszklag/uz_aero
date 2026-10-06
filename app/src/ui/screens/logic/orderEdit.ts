/**
 * Ninerdeck - EDYCJA ZLECENIA („EDYTUJ" z karty prowadzącego; 4.0.0, epik Z-C #247;
 * ramki edycji makiet 31 i 31B, zaakceptowane 2026-10-06; `docs/zlecenia.md` §5.1, §5.2).
 *
 * Ten sam formularz zakłada zlecenie i je poprawia, bo pyta o to samo. Różni się tym, co
 * znaczy „zapisz" - i to jest treść tego modułu (wzorzec poprawki rezerwacji,
 * `bookingEdit.ts`).
 *
 * ══ POPRAWKA NIESIE SAMĄ RÓŻNICĘ ══
 * `PATCH` zostawia pola pominięte bez zmian, więc jadą tylko te, które prowadzący ruszył.
 * Zmiana TERMINU podnosi wersję zlecenia i każe adresatom odpowiadać od nowa (§5.1) -
 * dlatego termin jedzie tylko wtedy, gdy naprawdę się zmienił, a ekran mówi o skutku,
 * zanim prowadzący zapisze.
 *
 * ══ WYSŁANYCH SIĘ TU NIE ODBIERA ══
 * Lista adresatów w edycji to wysłani (do odczytu, z kłódką) plus DOPISANI w tej edycji.
 * Szkic trzyma wyłącznie dopisanych - na drut jadą jako `addRecipients`, a zlecenie
 * dostaną tylko oni (§5.2). Odebranie zlecenia to osobna czynność z wiadomością i powodem
 * (pkt 29) i mieszka w menu ⋯ przy adresacie na karcie (32D).
 *
 * ══ SPOSOBU ADRESOWANIA NIE ZMIENIA SIĘ ══
 * „Wspólna lista" jest w edycji zablokowana: `PATCH` sposobu nie przyjmuje, a zmiana
 * objęłaby odpowiedzi, które już padły. Inny sposób to nowe zlecenie przez „Powiel".
 */

import { weekdayShortUtc } from '@ninerdeck/format';

import type { ReferenceAircraft } from '../../../domain';
import type { RemoteAddressList, RemoteOrderCard, RemoteOrderPatch, RemoteSeat } from '../../../application';

import { clubHhmm, clubInstant, type ClubDayBounds } from './clubClock';
import { DUAL_REQUIRED_REASON } from './dualRequirement';
import { listsOf } from './orderDuplicate';
import {
  emptyList,
  isEmptyList,
  peopleOf,
  seatsOf,
  soughtSeats,
  unionLists,
  type AudienceContext,
  type OrderDraft,
  type Step3Gate,
  type TextPart,
} from './orderForm';
import { dayAround, instant, orderDay, orderDayShort } from './orderFormat';
import { operationTypeOf } from './operations';

/** Szkic odtworzony z karty prowadzącego - punkt odniesienia dla „co się zmieniło". */
export function draftOfOrder(card: RemoteOrderCard): OrderDraft | null {
  const day = orderDay(card.day);
  const startsAt = instant(card.booking.startsAt);
  const endsAt = instant(card.booking.endsAt);
  if (day == null || startsAt == null || endsAt == null) return null;
  const b = card.booking;
  return {
    date: day.date,
    aircraftId: b.aircraftId,
    startsAt,
    endsAt,
    // Rodzaj spoza tego wydania schodzi do `null` - formularz poprosi o wybór, zamiast
    // pokazać kartę, której nie umie nazwać (reguła `draftOfBooking`).
    operation: operationTypeOf(b.operation),
    departureIcao: b.fromIcao ?? '',
    arrivalIcao: b.toIcao ?? '',
    plannedAirMin: b.plannedAirMin,
    plannedFuelL: b.plannedFuelL,
    notes: b.note,
    seats: { ...card.order.seats },
    // W edycji listy foteli niosą WYŁĄCZNIE dopisanych - wysłani są na karcie.
    pic: { mode: 'group', person: null, list: emptyList() },
    dual: { mode: 'group', person: null, list: emptyList() },
    shared: card.order.addressing === 'shared',
    sharedExtra: emptyList(),
  };
}

/** Wysłani adresaci, tak jak ich wybrano: osoba imiennie, grupa jako grupa (do odczytu). */
export function sentLists(card: RemoteOrderCard): Record<RemoteSeat | 'shared', RemoteAddressList> {
  return listsOf(card);
}

/** Osoby, które zlecenie już mają - arkusz dopisania ich nie pokazuje i nie liczy. */
export function sentPeople(card: RemoteOrderCard): Set<string> {
  return new Set((card.recipients ?? []).filter((r) => !r.removed).map((r) => r.pilotId));
}

/** Ilu osobom zlecenie poszło przez grupę - podpis „5 osób" przy wysłanej grupie. */
export function sentViaGroup(card: RemoteOrderCard, groupId: string): number {
  return (card.recipients ?? []).filter((r) => !r.removed && r.viaGroupId === groupId).length;
}

export function termChanged(draft: OrderDraft, base: OrderDraft): boolean {
  return draft.startsAt !== base.startsAt || draft.endsAt !== base.endsAt;
}

/**
 * Ostrzeżenie przy zmianie terminu (31 i 31B, ramki edycji): „Zmieniasz termin (było
 * 09:00 → 13:00) - adresaci odpowiedzą od nowa, obsadzone fotele zostają." Doba
 * poprzedniego terminu dochodzi wyłącznie wtedy, gdy zmienił się też dzień.
 */
export function termWarning(draft: OrderDraft, base: OrderDraft, baseDay: ClubDayBounds): string | null {
  if (!termChanged(draft, base) || base.startsAt == null || base.endsAt == null) return null;
  const hours = `${clubHhmm(base.startsAt, dayAround(baseDay, base.startsAt))} → ${clubHhmm(base.endsAt, dayAround(baseDay, base.endsAt))}`;
  const was =
    draft.date === base.date
      ? hours
      : `${weekdayShortUtc(clubInstant(base.startsAt, baseDay)).toLowerCase()} ${orderDayShort(baseDay, base.startsAt)} ${hours}`;
  return `Zmieniasz termin (było ${was}) - adresaci odpowiedzą od nowa, obsadzone fotele zostają.`;
}

/**
 * Przestawienie fotela, w którym ktoś już siedzi, na „Ja" albo „Brak" zdejmuje tę osobę
 * z lotu (§5.2) - formularz mówi to bursztynem pod kartami stanu, zanim prowadzący zapisze.
 * Liczy się wyłącznie fotel SZUKANY: w fotelu „Ja" siedzi zlecający, który sam przestawia
 * układ, więc wiadomości „Przydział cofnięty" do samego siebie nie ma.
 */
export function seatLossNote(
  card: RemoteOrderCard,
  draft: OrderDraft,
  seat: RemoteSeat,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): string | null {
  const sitting = seat === 'pic' ? card.booking.pilotId : card.booking.dualId;
  if (sitting == null || card.order.seats[seat] !== 'sought') return null;
  return seatsOf(draft, aircraft)[seat] === 'sought'
    ? null
    : 'Osoba przydzielona do tego fotela straci przydział - dostanie wiadomość „Przydział cofnięty".';
}

/**
 * Różnica gotowa na drut. `null` = nic się nie zmieniło - prowadzący wszedł w edycję
 * i się rozmyślił, więc karta po prostu wraca bez ani jednego zapisu.
 */
export function orderChanges(
  draft: OrderDraft,
  base: OrderDraft,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): RemoteOrderPatch | null {
  const patch: RemoteOrderPatch = {};
  if (draft.startsAt != null && draft.startsAt !== base.startsAt) patch.startsAt = new Date(draft.startsAt).toISOString();
  if (draft.endsAt != null && draft.endsAt !== base.endsAt) patch.endsAt = new Date(draft.endsAt).toISOString();
  if (draft.aircraftId != null && draft.aircraftId !== base.aircraftId) patch.aircraftId = draft.aircraftId;
  if (draft.operation != null && draft.operation !== base.operation) patch.operation = draft.operation;
  if (draft.departureIcao !== base.departureIcao) patch.fromIcao = draft.departureIcao === '' ? null : draft.departureIcao;
  if (draft.arrivalIcao !== base.arrivalIcao) patch.toIcao = draft.arrivalIcao === '' ? null : draft.arrivalIcao;
  if (draft.plannedAirMin !== base.plannedAirMin) patch.plannedAirMin = draft.plannedAirMin;
  if (draft.plannedFuelL !== base.plannedFuelL) patch.plannedFuelL = draft.plannedFuelL;
  if (draft.notes !== base.notes) patch.note = draft.notes;

  const seats = seatsOf(draft, aircraft);
  const baseSeats = seatsOf(base, aircraft);
  if (seats.pic !== baseSeats.pic || seats.dual !== baseSeats.dual) patch.seats = seats;

  const adds = addedRecipients(draft, aircraft);
  if (adds.length > 0) patch.addRecipients = adds;

  return Object.keys(patch).length === 0 ? null : patch;
}

/** Dopisani w tej edycji - wyłącznie przy fotelach, których zlecenie (po zmianie) szuka. */
function addedRecipients(
  draft: OrderDraft,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): NonNullable<RemoteOrderPatch['addRecipients']> {
  if (draft.shared) return isEmptyList(draft.sharedExtra) ? [] : [{ seat: null, list: draft.sharedExtra }];
  return soughtSeats(seatsOf(draft, aircraft))
    .filter((seat) => !isEmptyList(draft[seat].list))
    .map((seat) => ({ seat, list: draft[seat].list }));
}

/** Żywi adresaci fotela - przy wspólnej liście i terminie do potwierdzenia: obu foteli. */
function liveOn(card: RemoteOrderCard, seat: RemoteSeat | 'shared'): number {
  return (card.recipients ?? []).filter(
    (r) => !r.removed && (seat === 'shared' || r.seat === seat || r.seat == null),
  ).length;
}

/**
 * Bramka „ZAPISZ ZMIANY". Te same powody, co przy wysłaniu (31B), z jedną różnicą:
 * szukany fotel ma adresatów, jeśli ma ich wysłanych ALBO dopisanych.
 */
export function editStep3Gate(
  draft: OrderDraft,
  card: RemoteOrderCard,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): Step3Gate {
  const seats = seatsOf(draft, aircraft);
  const sought = soughtSeats(seats);
  if (sought.length === 0) return { reason: 'Ustaw „Szukam" przy co najmniej jednym fotelu.' };
  if (seats.dual === 'none' && aircraft?.dualRequired === true) return { reason: DUAL_REQUIRED_REASON };
  if (draft.shared) {
    return liveOn(card, 'shared') === 0 && isEmptyList(draft.sharedExtra) ? { reason: null } : null;
  }
  return sought.some((seat) => liveOn(card, seat) === 0 && isEmptyList(draft[seat].list)) ? { reason: null } : null;
}

/**
 * Zdanie nad „ZAPISZ ZMIANY": do ilu NOWYCH osób trafi zlecenie i czy pozostali dostaną
 * wiadomość o zmianie (§5.2: dopisanie wysyła zlecenie wyłącznie nowym, każda inna zmiana
 * to „Zlecenie edytowane"). `null` = zapis niczego nikomu nie wyśle.
 */
export function editSummary(
  draft: OrderDraft,
  base: OrderDraft,
  card: RemoteOrderCard,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
  ctx: AudienceContext,
): TextPart[] | null {
  const patch = orderChanges(draft, base, aircraft);
  if (patch == null) return null;
  const { addRecipients, ...rest } = patch;
  const others = Object.keys(rest).length > 0;

  const added = unionLists(...(addRecipients ?? []).map((a) => a.list));
  const people = isEmptyList(added) ? new Map() : peopleOf(added, ctx);
  const sent = sentPeople(card);
  const fresh = people == null ? null : [...people.keys()].filter((id) => !sent.has(id)).length;

  const parts: TextPart[] = [];
  if (!isEmptyList(added)) {
    if (fresh == null) parts.push({ text: 'Zlecenie trafi do nowych adresatów.' });
    else if (fresh > 0) {
      parts.push(
        { text: 'Zlecenie trafi do ' },
        { text: `${fresh} ${fresh === 1 ? 'nowej osoby' : 'nowych osób'}`, strong: true },
        { text: '.' },
      );
    }
  }
  if (others) parts.push({ text: `${parts.length > 0 ? ' Pozostali adresaci' : 'Adresaci'} dostaną wiadomość o zmianie.` });
  return parts.length === 0 ? null : parts;
}
