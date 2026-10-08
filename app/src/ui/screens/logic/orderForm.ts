/**
 * Ninerdeck - FORMULARZ ZLECENIA: szkic i krok 3 „załoga i adresaci" (4.0.0, epik Z-C #247;
 * makiety 31, 31A, 31B, 31C; `docs/zlecenia.md` §4, §6.2, §14.4, pkt 37-39, 47, 48).
 *
 * Kroki 1 i 2 to kroki 22/22A rezerwacji (zlecenie jest rezerwacją, która szuka załogi,
 * §2.1) i pilnują ich te same bramki z `bookingSteps.ts`. Ten moduł niesie to, czego
 * rezerwacja nie zna: dwa fotele z trzema stanami i adresatów szukanych foteli.
 *
 * ══ FOTEL = STAN → SPOSÓB → ADRESACI ══
 * „Ja / Szukam / Brak" (§4.1); pod szukanym - „Osoba · imiennie" albo „Grupa · lub kilka
 * osób" (§4.2 pkt 1-2); nad fotelami przełącznik „Wspólna lista" (pkt 3). Szkic PAMIĘTA
 * wybór każdego sposobu osobno - przełączenie „Osoba" ↔ „Grupa" ani fotel przestawiony
 * na „Ja" i z powrotem nie gubią tego, co już wskazano. Na drut idzie wyłącznie to, co
 * widać (`orderAudienceOf`): lista fotela, którego zlecenie nie szuka, byłaby odmową
 * `seat_not_sought`.
 *
 * ══ WSPÓLNA LISTA NIE GUBI WYBORU (pkt 47, 48) ══
 * Włączona pokazuje SUMĘ list szukanych foteli - nic się przy tym nie przenosi, więc
 * wyłączenie przywraca podział sprzed włączenia samo z siebie. Kogo dopisano w trakcie,
 * ten czeka w `sharedExtra` i po wyłączeniu staje przy OBU szukanych fotelach - czyli
 * dostanie termin do potwierdzenia. Kogo usunięto z listy wspólnej, ten znika też z list
 * foteli: inaczej wyłączenie przełącznika przywracałoby osobę, którą właśnie skreślono.
 *
 * ══ ROZWINIĘCIE GRUP LICZYMY TAK, JAK SERWER ══
 * Zdanie nad przyciskiem („Zlecenie trafi do 6 osób…") i podpis przy osobie wskazanej
 * imiennie (pkt 39) mówią to, co serwer zrobi przy wysłaniu (`server/src/domain/
 * orderAddressing.ts`): bez zlecającego, bez członków nieaktywnych, osoba liczona raz,
 * a obecna na listach OBU foteli dostaje termin do potwierdzenia. O wyniku i tak
 * rozstrzyga serwer - tu jest zapowiedź, nie decyzja.
 */

import { plural } from '@ninerdeck/format';

import type { OperationType, ReferenceAircraft } from '../../../domain';
import type {
  RemoteAddressList,
  RemoteOrderAudience,
  RemoteOrderSeats,
  RemoteSeat,
} from '../../../application';

import type { TermWords, PlanWords } from './bookingSteps';
import { DUAL_REQUIRED_REASON } from './dualRequirement';
import { seatAccusative, seatGenitive } from './orderFormat';

/** „Osoba · imiennie" albo „Grupa · lub kilka osób" (§4.2). */
export type AddressMode = 'person' | 'group';

export interface SeatAddress {
  mode: AddressMode;
  /** Osoba wskazana imiennie - pamiętana także w trybie „Grupa". */
  person: string | null;
  /** Grupy i osoby trybu „Grupa". */
  list: RemoteAddressList;
}

export interface OrderDraft {
  /** Klucz doby klubu (`RRRR-MM-DD`); `null` = jeszcze nie wybrano. */
  date: string | null;
  aircraftId: string | null;
  startsAt: number | null;
  endsAt: number | null;
  /** Bez wartości podstawionej - wybór ma być świadomy (reguła z 22A). */
  operation: OperationType | null;
  departureIcao: string;
  arrivalIcao: string;
  plannedAirMin: number | null;
  plannedFuelL: number | null;
  /**
   * OPIS dla adresatów (31A) - pole nazywa się jak notatka rezerwacji, bo kroki 1 i 2 dzielą
   * kod; różni je wyłącznie czytelnik, a ten jest sprawą ekranu.
   */
  notes: string | null;
  /** `null` = jeszcze nie ruszone - ekran pokazuje stan domyślny (`seatsOf`). */
  seats: RemoteOrderSeats | null;
  pic: SeatAddress;
  dual: SeatAddress;
  /** Przełącznik „Wspólna lista" (§4.2 pkt 3). */
  shared: boolean;
  /** Dopisani przy włączonej wspólnej liście (pkt 48). */
  sharedExtra: RemoteAddressList;
}

export const SEAT_KEYS: readonly RemoteSeat[] = ['pic', 'dual'];

export const otherSeat = (seat: RemoteSeat): RemoteSeat => (seat === 'pic' ? 'dual' : 'pic');

export function emptyList(): RemoteAddressList {
  return { pilotIds: [], groupIds: [] };
}

export function emptySeat(): SeatAddress {
  return { mode: 'person', person: null, list: emptyList() };
}

export function emptyOrderDraft(): OrderDraft {
  return {
    date: null,
    aircraftId: null,
    startsAt: null,
    endsAt: null,
    operation: null,
    departureIcao: '',
    arrivalIcao: '',
    plannedAirMin: null,
    plannedFuelL: null,
    notes: null,
    seats: null,
    pic: emptySeat(),
    dual: emptySeat(),
    shared: false,
    sharedExtra: emptyList(),
  };
}

/** Zdania bramki terminu w zleceniu - „termin" jest rodzaju męskiego, rezerwacja żeńskiego. */
export const ORDER_TERM_WORDS: TermWords = {
  noDay: 'Wybierz dzień lotu.',
  noHours: 'Ustaw godziny lotu.',
  reversed: 'Koniec terminu wypada przed jego początkiem.',
};

/** Podpis pod planem lotu w 31A: „Termin 4 h · plan lotu 2:00 zostawia 2 h na obsługę". */
export const ORDER_PLAN_WORDS: PlanWords = { lead: 'Termin', overflow: 'nie mieści się w terminie' };

/**
 * Stany foteli - wybrane albo domyślne. Domyślnie zlecenie SZUKA dowódcy, a drugi fotel
 * szuka wtedy, gdy maszyna wymaga załogi dwuosobowej - inaczej „Brak". Stan domyślny jest
 * liczony, nie zapisany: zmiana maszyny w kroku 1 przestawia go sama, dopóki pilot nie
 * tknął foteli. Po pierwszym tknięciu szkic trzyma wybór, a wymóg maszyny pilnuje bramka.
 */
export function seatsOf(
  draft: Pick<OrderDraft, 'seats'>,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): RemoteOrderSeats {
  return draft.seats ?? { pic: 'sought', dual: aircraft?.dualRequired === true ? 'sought' : 'none' };
}

/** Fotele, których zlecenie szuka - w stałej kolejności: dowódca, drugi pilot. */
export function soughtSeats(seats: RemoteOrderSeats): RemoteSeat[] {
  return SEAT_KEYS.filter((seat) => seats[seat] === 'sought');
}

/** Lista, którą fotel naprawdę wysyła - w trybie „Osoba" jedna osoba albo nikt. */
export function effectiveList(seat: SeatAddress): RemoteAddressList {
  if (seat.mode === 'group') return seat.list;
  return { pilotIds: seat.person == null ? [] : [seat.person], groupIds: [] };
}

/** Suma list bez powtórzeń; kolejność pierwszego wystąpienia. */
export function unionLists(...lists: readonly RemoteAddressList[]): RemoteAddressList {
  const pilotIds: string[] = [];
  const groupIds: string[] = [];
  for (const list of lists) {
    for (const id of list.pilotIds) if (!pilotIds.includes(id)) pilotIds.push(id);
    for (const id of list.groupIds) if (!groupIds.includes(id)) groupIds.push(id);
  }
  return { pilotIds, groupIds };
}

export function isEmptyList(list: RemoteAddressList): boolean {
  return list.pilotIds.length === 0 && list.groupIds.length === 0;
}

/** Lista wspólna: suma list szukanych foteli i dopisanych w trakcie (pkt 47, 48). */
export function sharedListOf(draft: OrderDraft, seats: RemoteOrderSeats): RemoteAddressList {
  return unionLists(...soughtSeats(seats).map((seat) => effectiveList(draft[seat])), draft.sharedExtra);
}

/** Stan fotela. „Ja" stoi najwyżej w jednym fotelu (§4.1) - drugi wraca wtedy do szukania. */
export function withSeatState(
  draft: OrderDraft,
  seat: RemoteSeat,
  state: RemoteOrderSeats['dual'],
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): OrderDraft {
  const current = seatsOf(draft, aircraft);
  if (seat === 'pic' && state === 'none') return draft;
  const next: RemoteOrderSeats =
    seat === 'pic'
      ? { pic: state as RemoteOrderSeats['pic'], dual: current.dual }
      : { pic: current.pic, dual: state };
  if (state === 'self') {
    const other = otherSeat(seat);
    if (next[other] === 'self') {
      if (other === 'pic') next.pic = 'sought';
      else next.dual = 'sought';
    }
  }
  return { ...draft, seats: next };
}

/**
 * Sposób adresowania fotela. Wybór przechodzi do drugiego sposobu, kiedy ten jest pusty:
 * osoba wskazana imiennie staje się pierwszą osobą listy, a lista z jedną osobą - osobą
 * wskazaną imiennie. Przełączenie, które zaczynałoby od pustego, kazałoby wybierać drugi
 * raz to, co już wybrano.
 */
export function withMode(draft: OrderDraft, seat: RemoteSeat, mode: AddressMode): OrderDraft {
  const current = draft[seat];
  if (current.mode === mode) return draft;
  if (mode === 'group') {
    const list = isEmptyList(current.list) && current.person != null ? { pilotIds: [current.person], groupIds: [] } : current.list;
    return { ...draft, [seat]: { ...current, mode, list } };
  }
  const person = current.person ?? (fitsPerson(current.list) ? (current.list.pilotIds[0] ?? null) : null);
  return { ...draft, [seat]: { ...current, mode, person } };
}

/** Osoba wskazana imiennie (arkusz 31C z samą listą osób). */
export function withPerson(draft: OrderDraft, seat: RemoteSeat, pilotId: string | null): OrderDraft {
  return { ...draft, [seat]: { ...draft[seat], mode: 'person', person: pilotId } };
}

/** Lista trybu „Grupa" (arkusz 31C z grupami). */
export function withList(draft: OrderDraft, seat: RemoteSeat, list: RemoteAddressList): OrderDraft {
  return { ...draft, [seat]: { ...draft[seat], mode: 'group', list: unionLists(list) } };
}

/** Pozycja listy adresatów - osoba albo grupa. */
export interface AddressEntry {
  kind: 'person' | 'group';
  id: string;
}

function without(list: RemoteAddressList, entry: AddressEntry): RemoteAddressList {
  return entry.kind === 'person'
    ? { ...list, pilotIds: list.pilotIds.filter((id) => id !== entry.id) }
    : { ...list, groupIds: list.groupIds.filter((id) => id !== entry.id) };
}

function seatWithout(seat: SeatAddress, entry: AddressEntry): SeatAddress {
  if (seat.mode === 'person') {
    return entry.kind === 'person' && seat.person === entry.id ? { ...seat, person: null } : seat;
  }
  return { ...seat, list: without(seat.list, entry) };
}

/**
 * „×" przy pozycji. Z listy wspólnej pozycja znika WSZĘDZIE - z list szukanych foteli
 * i z dopisanych - bo inaczej wyłączenie przełącznika przywróciłoby osobę, którą właśnie
 * skreślono.
 */
export function withoutEntry(
  draft: OrderDraft,
  target: RemoteSeat | 'shared',
  entry: AddressEntry,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): OrderDraft {
  if (target !== 'shared') return { ...draft, [target]: seatWithout(draft[target], entry) };
  let out: OrderDraft = { ...draft, sharedExtra: without(draft.sharedExtra, entry) };
  for (const seat of soughtSeats(seatsOf(draft, aircraft))) {
    out = { ...out, [seat]: seatWithout(out[seat], entry) };
  }
  return out;
}

/** Lista wspólna po arkuszu 31C - skreśleni znikają wszędzie, nowi czekają w dopisanych. */
export function withSharedList(
  draft: OrderDraft,
  next: RemoteAddressList,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): OrderDraft {
  const before = sharedListOf(draft, seatsOf(draft, aircraft));
  let out = draft;
  for (const id of before.pilotIds) {
    if (!next.pilotIds.includes(id)) out = withoutEntry(out, 'shared', { kind: 'person', id }, aircraft);
  }
  for (const id of before.groupIds) {
    if (!next.groupIds.includes(id)) out = withoutEntry(out, 'shared', { kind: 'group', id }, aircraft);
  }
  const added: RemoteAddressList = {
    pilotIds: next.pilotIds.filter((id) => !before.pilotIds.includes(id)),
    groupIds: next.groupIds.filter((id) => !before.groupIds.includes(id)),
  };
  return { ...out, sharedExtra: unionLists(out.sharedExtra, added) };
}

const fitsPerson = (list: RemoteAddressList): boolean => list.groupIds.length === 0 && list.pilotIds.length <= 1;

/**
 * Przełącznik „Wspólna lista". Włączenie niczego nie przenosi - lista wspólna jest sumą
 * list foteli (pkt 47). Wyłączenie stawia dopisanych w trakcie przy OBU szukanych fotelach
 * (pkt 48); fotel w trybie „Osoba", który z nimi przestaje mieścić jedną osobę, przechodzi
 * na „Grupa · lub kilka osób" - tryb „Osoba" nie umie pokazać dwóch nazwisk.
 */
export function withShared(
  draft: OrderDraft,
  on: boolean,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): OrderDraft {
  if (on) return { ...draft, shared: true, sharedExtra: emptyList() };
  let out: OrderDraft = { ...draft, shared: false, sharedExtra: emptyList() };
  if (isEmptyList(draft.sharedExtra)) return out;
  for (const seat of soughtSeats(seatsOf(draft, aircraft))) {
    const current = draft[seat];
    const merged = unionLists(effectiveList(current), draft.sharedExtra);
    out = {
      ...out,
      [seat]:
        current.mode === 'person' && fitsPerson(merged)
          ? { ...current, person: merged.pilotIds[0] ?? null }
          : { ...current, mode: 'group', list: current.mode === 'group' ? unionLists(current.list, draft.sharedExtra) : merged },
    };
  }
  return out;
}

/** Adresowanie na drut (`POST /orders`) - wyłącznie to, co widać na ekranie. */
export function orderAudienceOf(
  draft: OrderDraft,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
): RemoteOrderAudience {
  const seats = seatsOf(draft, aircraft);
  if (draft.shared) return { kind: 'shared', list: sharedListOf(draft, seats) };
  return {
    kind: 'per_seat',
    pic: seats.pic === 'sought' ? effectiveList(draft.pic) : null,
    dual: seats.dual === 'sought' ? effectiveList(draft.dual) : null,
  };
}

// ── rozwinięcie grup ─────────────────────────────────────────────────────────

export interface AudienceContext {
  /** Zlecający - nie jest adresatem nawet przez grupę (§6.2). */
  me: string;
  /** Członkowie grup klubu; `null` = grup nie wczytano. Brak klucza = grupy nie ma. */
  groups: ReadonlyMap<string, readonly string[]> | null;
  /** Czy osoba ma aktywne członkostwo - nieaktywny nie dostaje zleceń (§6.1). */
  isActive: (pilotId: string) => boolean;
}

interface Source {
  named: boolean;
  viaGroupId: string | null;
}

/**
 * Osoby jednej listy - jak `collect` serwera: bez zlecającego, bez nieaktywnych;
 * wskazanie imienne wygrywa z grupą. `null` = nie wiadomo (grupy niewczytane).
 */
export function peopleOf(list: RemoteAddressList, ctx: AudienceContext): Map<string, Source> | null {
  const out = new Map<string, Source>();
  for (const id of list.pilotIds) {
    if (id === ctx.me || !ctx.isActive(id)) continue;
    out.set(id, { named: true, viaGroupId: out.get(id)?.viaGroupId ?? null });
  }
  if (list.groupIds.length > 0 && ctx.groups == null) return null;
  for (const groupId of list.groupIds) {
    for (const id of ctx.groups?.get(groupId) ?? []) {
      if (id === ctx.me || !ctx.isActive(id)) continue;
      const known = out.get(id);
      if (known == null) out.set(id, { named: false, viaGroupId: groupId });
      else if (known.viaGroupId == null) out.set(id, { ...known, viaGroupId: groupId });
    }
  }
  return out;
}

/** „1 osoba", „3 osoby", „5 osób". */
export function peopleCount(n: number): string {
  return `${n} ${plural(n, 'osoba', 'osoby', 'osób')}`;
}

/** Fragment zdania; `strong` = pogrubienie (makieta: „Zlecenie trafi do <b>6 osób</b>"). */
export interface TextPart {
  text: string;
  strong?: boolean;
}

/** Jak fotel się obsadzi - zapowiedź skutku `expandRecipients`. */
type SeatFill = 'direct' | 'pick' | 'confirm';

function seatFills(
  draft: OrderDraft,
  seats: RemoteOrderSeats,
  ctx: AudienceContext,
): Map<RemoteSeat, { fill: SeatFill; people: Map<string, Source> }> | null {
  const people = new Map<RemoteSeat, Map<string, Source>>();
  for (const seat of soughtSeats(seats)) {
    const map = peopleOf(effectiveList(draft[seat]), ctx);
    if (map == null) return null;
    people.set(seat, map);
  }
  const out = new Map<RemoteSeat, { fill: SeatFill; people: Map<string, Source> }>();
  for (const [seat, map] of people) {
    const other = people.get(otherSeat(seat));
    const only = map.size === 1 ? [...map][0]! : null;
    const fill: SeatFill =
      only != null && only[1].named
        ? other?.has(only[0]) === true
          ? 'confirm'
          : 'direct'
        : 'pick';
    out.set(seat, { fill, people: map });
  }
  return out;
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Zdanie nad „WYŚLIJ ZLECENIE" - do ilu osób trafi zlecenie i kto obsadzi fotele (31B).
 *
 * Nazwiska do zdania NIE wchodzą: „odpowiedź Jakuba Wrony" wymagałaby odmiany, a tej nie
 * da się wyprowadzić regułą. Zdanie mówi o ROLI („osoby wskazanej imiennie") - nazwisko
 * stoi wiersz wyżej, w fotelu. `null` = nie ma czego zapowiadać (pusta lista blokuje
 * przycisk i bez zdania).
 */
export function audienceSummary(
  draft: OrderDraft,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
  ctx: AudienceContext,
): TextPart[] | null {
  const seats = seatsOf(draft, aircraft);
  const sought = soughtSeats(seats);
  if (sought.length === 0) return null;

  if (draft.shared) {
    const list = sharedListOf(draft, seats);
    if (isEmptyList(list)) return null;
    const people = peopleOf(list, ctx);
    const how =
      sought.length === 2
        ? 'Adresaci potwierdzą termin, a fotele przydzielisz spośród zgłoszonych.'
        : `Adresaci potwierdzą termin, a ${seatAccusative(sought[0]!)} wybierzesz spośród zgłoszonych.`;
    return withCount(people?.size ?? null, how);
  }

  if (sought.some((seat) => isEmptyList(effectiveList(draft[seat])))) return null;
  const fills = seatFills(draft, seats, ctx);
  if (fills == null) return [{ text: howFallback(draft, sought) }];

  const everyone = new Set<string>();
  for (const { people } of fills.values()) for (const id of people.keys()) everyone.add(id);
  return withCount(everyone.size, howOf(sought, fills));
}

function withCount(count: number | null, how: string): TextPart[] {
  if (count == null) return [{ text: how }];
  return [
    { text: 'Zlecenie trafi do ' },
    { text: `${count} ${count === 1 ? 'osoby' : 'osób'}`, strong: true },
    { text: `. ${how}` },
  ];
}

const DIRECT = 'obsadzi odpowiedź osoby wskazanej imiennie';
const PICK = 'wybierzesz spośród zgłoszonych';

function howOf(
  sought: readonly RemoteSeat[],
  fills: Map<RemoteSeat, { fill: SeatFill; people: Map<string, Source> }>,
): string {
  if (sought.length === 1) {
    const seat = sought[0]!;
    return `${capital(seatAccusative(seat))} ${fills.get(seat)!.fill === 'direct' ? DIRECT : PICK}.`;
  }
  const pic = fills.get('pic')!;
  const dual = fills.get('dual')!;
  const confirm = [pic, dual].find((f) => f.fill === 'confirm');
  if (confirm != null) {
    // Osoba wskazana imiennie i obecna na liście drugiego fotela (pkt 37, 39).
    const seat: RemoteSeat = pic.fill === 'confirm' ? 'pic' : 'dual';
    const both = pic.fill === 'confirm' && dual.fill === 'confirm';
    const why = both
      ? 'ta sama osoba jest wskazana imiennie na oba fotele'
      : `osoba wskazana imiennie jest też ${viaGroupOn(fills.get(otherSeat(seat))!, fills.get(seat)!) ? 'w grupie' : 'na liście'} ${seatGenitive(otherSeat(seat))}`;
    return `Oba fotele wybierzesz spośród zgłoszonych - ${why}.`;
  }
  if (pic.fill === 'direct' && dual.fill === 'direct') {
    return 'Dowódcę i drugiego pilota obsadzą odpowiedzi osób wskazanych imiennie.';
  }
  if (pic.fill === 'pick' && dual.fill === 'pick') return `Oba fotele ${PICK}.`;
  return `Dowódcę ${pic.fill === 'direct' ? DIRECT : PICK}, drugiego pilota ${dual.fill === 'direct' ? DIRECT : PICK}.`;
}

/** Czy osoba z fotela `named` trafiła na fotel `other` przez grupę (a nie imiennie). */
function viaGroupOn(
  other: { people: Map<string, Source> },
  named: { people: Map<string, Source> },
): boolean {
  const id = [...named.people.keys()][0];
  return id != null && other.people.get(id)?.named === false;
}

/** Zdanie bez liczby - grupy niewczytane, więc rozwinięcia nie ma z czego policzyć. */
function howFallback(draft: OrderDraft, sought: readonly RemoteSeat[]): string {
  const direct = (seat: RemoteSeat): boolean => {
    const list = effectiveList(draft[seat]);
    return list.groupIds.length === 0 && list.pilotIds.length === 1;
  };
  if (sought.length === 1) {
    const seat = sought[0]!;
    return `${capital(seatAccusative(seat))} ${direct(seat) ? DIRECT : PICK}.`;
  }
  return `Dowódcę ${direct('pic') ? DIRECT : PICK}, drugiego pilota ${direct('dual') ? DIRECT : PICK}.`;
}

/**
 * Podpis pod osobą wskazaną imiennie, która jest też na liście drugiego fotela (pkt 39):
 * dostanie termin do potwierdzenia, więc jej „tak" nie obsadzi fotela samo. Mówi to
 * PRZED wysłaniem i niczego nie blokuje. `null` = podpisu nie ma (warunek nie zachodzi,
 * fotel nie jest w trybie „Osoba" albo grup nie wczytano).
 */
export function seatHint(
  draft: OrderDraft,
  seat: RemoteSeat,
  aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null,
  ctx: AudienceContext & { groupName: (id: string) => string },
): TextPart[] | null {
  if (draft.shared) return null;
  const seats = seatsOf(draft, aircraft);
  const other = otherSeat(seat);
  const named = draft[seat];
  if (seats[seat] !== 'sought' || seats[other] !== 'sought' || named.mode !== 'person' || named.person == null) {
    return null;
  }
  const people = peopleOf(effectiveList(draft[other]), ctx);
  const source = people?.get(named.person);
  if (source == null) return null;

  const lead =
    draft[other].mode === 'person'
      ? `Jest też imiennie na ${seatAccusative(other)}`
      : source.named
        ? `Jest też na liście ${seatGenitive(other)}`
        : `Jest też w grupie „${ctx.groupName(source.viaGroupId ?? '')}"`;
  return [{ text: lead, strong: true }, { text: ' - dostanie termin do potwierdzenia, fotel wybierzesz po odpowiedzi.' }];
}

// ── bramka kroku 3 ───────────────────────────────────────────────────────────

/** Powód blokady „WYŚLIJ ZLECENIE"; `reason: null` = blokada bez zdania (widać ją z kontrolki). */
export type Step3Gate = { reason: string | null } | null;

/**
 * Kolejność powagi (31B): najpierw „to w ogóle nie jest zlecenie", potem wymóg maszyny.
 * Szukany fotel bez adresatów blokuje BEZ zdania - pusty wiersz „Dodaj adresatów"
 * / „Wybierz osobę" stoi tuż nad przyciskiem (issue #55).
 */
export function step3Gate(draft: OrderDraft, aircraft: Pick<ReferenceAircraft, 'dualRequired'> | null): Step3Gate {
  const seats = seatsOf(draft, aircraft);
  const sought = soughtSeats(seats);
  if (sought.length === 0) return { reason: 'Ustaw „Szukam" przy co najmniej jednym fotelu.' };
  if (seats.dual === 'none' && aircraft?.dualRequired === true) return { reason: DUAL_REQUIRED_REASON };
  if (draft.shared) return isEmptyList(sharedListOf(draft, seats)) ? { reason: null } : null;
  return sought.some((seat) => isEmptyList(effectiveList(draft[seat]))) ? { reason: null } : null;
}

/**
 * Czy szkic niesie cokolwiek, co pilot straci przy wyjściu - liczone z KLUCZY pustego
 * szkicu (reguła issue #62). Pola podstawione przez nawigację nie liczą się jako wpis.
 */
export function orderDraftDirty(draft: OrderDraft, seeded: readonly (keyof OrderDraft)[]): boolean {
  const empty = emptyOrderDraft();
  return (Object.keys(empty) as (keyof OrderDraft)[])
    .filter((key) => !seeded.includes(key))
    .some((key) => JSON.stringify(draft[key]) !== JSON.stringify(empty[key]));
}
