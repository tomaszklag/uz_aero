/**
 * Ninerdeck - panel: FORMULARZ ZLECENIA - szkic i krok 3 „załoga i adresaci" (makieta
 * `zlecenia-nowe`, ZL2, ZL2b, ZL2c; 4.0.0, epik Z-D #248; `docs/zlecenia.md` §4, §6.2,
 * §14.4, pkt 37-39, 47, 48).
 *
 * Kroki 1 i 2 to kroki własnej rezerwacji K7 (zlecenie jest rezerwacją, która szuka
 * załogi, §2.1) i pilnują ich te same bramki (`ownBookingForm.ts`). Ten moduł niesie to,
 * czego rezerwacja nie zna: dwa fotele z trzema stanami i adresatów szukanych foteli.
 * Reguły są te same, co w telefonie (`orderForm.ts` w aplikacji, Z-C) - różnią się
 * kontrolki (`<select>` i listy kart zamiast arkuszy) i krótsza stopka („Trafi do 6 osób").
 *
 * ══ FOTEL = STAN → SPOSÓB → ADRESACI ══
 * „Ja / Szukam / Brak" (§4.1); pod szukanym - „Osoba" (imiennie) albo „Grupa" (lub kilka
 * osób) (§4.2 pkt 1-2); nad fotelami przełącznik „Wspólna lista" (pkt 3). Szkic PAMIĘTA
 * wybór każdego sposobu osobno - przełączenie „Osoba" ↔ „Grupa" ani fotel przestawiony na
 * „Ja" i z powrotem nie gubią tego, co już wskazano. Na drut idzie wyłącznie to, co widać
 * (`orderAudienceOf`): lista fotela, którego zlecenie nie szuka, byłaby odmową
 * `seat_not_sought`.
 *
 * ══ WSPÓLNA LISTA NIE GUBI WYBORU (pkt 47, 48) ══
 * Włączona pokazuje SUMĘ list szukanych foteli - nic się nie przenosi, więc wyłączenie
 * przywraca podział sprzed włączenia samo z siebie. Kogo dopisano w trakcie, ten czeka
 * w `sharedExtra` i po wyłączeniu staje przy OBU szukanych fotelach (termin do
 * potwierdzenia). Kogo odznaczono na liście wspólnej, ten znika też z list foteli.
 *
 * ══ ROZWINIĘCIE GRUP LICZYMY TAK, JAK SERWER ══
 * Stopka („Trafi do 6 osób"), osoby „przez grupę" i podpis pkt 39 mówią to, co serwer
 * zrobi przy wysłaniu (`domain/orderAddressing.ts`): bez zlecającego, bez członków
 * nieaktywnych, osoba liczona raz. O wyniku rozstrzyga serwer - tu jest zapowiedź.
 *
 * Moduł czysty - test obok.
 */

import { plural } from '@ninerdeck/format';

import type {
  AddressListDto,
  DirectoryMemberDto,
  DualSeatStateDto,
  GroupDto,
  NewOrderDto,
  OrderAudienceDto,
  OrderSeatsDto,
  SeatDto,
} from '../../api/dto';
import type { Blocker } from '../calendar/blockForm';
import {
  draftSlot,
  parseFuel,
  parsePlannedAir,
  planBlocker,
  routeBlocker,
  singleField,
  type PlanWords,
  type TaskFields,
  type TermFields,
} from '../calendar/ownBookingForm';
import { SEAT_ACCUSATIVE, SEAT_GENITIVE } from './orderLabels';

/** „Osoba" (imiennie) albo „Grupa" (lub kilka osób) (§4.2). */
export type AddressMode = 'person' | 'group';

export interface SeatAddress {
  mode: AddressMode;
  /** Osoba wskazana imiennie - pamiętana także w trybie „Grupa". */
  person: string | null;
  /** Grupy i osoby trybu „Grupa". */
  list: AddressListDto;
}

export interface OrderFormDraft extends TermFields, TaskFields {
  /** OPIS dla adresatów - przeczytają go na karcie zlecenia. */
  note: string;
  /** `null` = jeszcze nie ruszone - formularz pokazuje stan domyślny (`seatsOf`). */
  seats: OrderSeatsDto | null;
  pic: SeatAddress;
  dual: SeatAddress;
  /** Przełącznik „Wspólna lista" (§4.2 pkt 3). */
  shared: boolean;
  /** Dopisani przy włączonej wspólnej liście (pkt 48). */
  sharedExtra: AddressListDto;
}

/** Maszyna i dzień podstawione z komórki kalendarza - to nie jest wpis prowadzącego. */
export interface OrderSeed {
  aircraftId?: string;
  date?: string;
}

/** Maszyna widziana przez krok 3 - znak do zdań i wymóg załogi dwuosobowej. */
export interface FormAircraft {
  reg: string;
  dualRequired: boolean;
}

export const SEATS: readonly SeatDto[] = ['pic', 'dual'];

export const otherSeat = (seat: SeatDto): SeatDto => (seat === 'pic' ? 'dual' : 'pic');

export const emptyList = (): AddressListDto => ({ pilotIds: [], groupIds: [] });

const emptySeat = (): SeatAddress => ({ mode: 'person', person: null, list: emptyList() });

export function emptyOrderForm(seed: OrderSeed = {}): OrderFormDraft {
  return {
    aircraftId: seed.aircraftId ?? '',
    date: seed.date ?? '',
    from: '',
    to: '',
    operation: '',
    fromIcao: '',
    toIcao: '',
    plannedAir: '',
    plannedFuel: '',
    note: '',
    seats: null,
    pic: emptySeat(),
    dual: emptySeat(),
    shared: false,
    sharedExtra: emptyList(),
  };
}

/** Podpis planu lotu w zleceniu - „Termin 4 h · plan lotu 2:00 zostawia 2 h na obsługę". */
export const ORDER_PLAN_WORDS: PlanWords = { lead: 'Termin', overflow: 'nie mieści się w terminie' };

/**
 * Bramka kroku 2 zlecenia - rodzaj, trasa i plan, jak w rezerwacji, bez drugiego pilota
 * (ten stał się fotelem w kroku 3).
 */
export function orderStep2Blocker(draft: OrderFormDraft): Blocker {
  return routeBlocker(draft) ?? planBlocker(draft);
}

/**
 * Stany foteli - wybrane albo domyślne. Domyślnie zlecenie SZUKA dowódcy, a drugi fotel
 * szuka wtedy, gdy maszyna wymaga załogi dwuosobowej - inaczej „Brak". Stan domyślny jest
 * liczony, nie zapisany: zmiana maszyny w kroku 1 przestawia go sama, dopóki prowadzący
 * nie tknął foteli. Po pierwszym tknięciu szkic trzyma wybór, a wymóg pilnuje bramka.
 */
export function seatsOf(draft: Pick<OrderFormDraft, 'seats'>, aircraft: FormAircraft | null): OrderSeatsDto {
  return draft.seats ?? { pic: 'sought', dual: aircraft?.dualRequired === true ? 'sought' : 'none' };
}

/** Fotele, których zlecenie szuka - w stałej kolejności: dowódca, drugi pilot. */
export const soughtSeats = (seats: OrderSeatsDto): SeatDto[] => SEATS.filter((seat) => seats[seat] === 'sought');

/** Lista, którą fotel naprawdę wysyła - w trybie „Osoba" jedna osoba albo nikt. */
export function effectiveList(seat: SeatAddress): AddressListDto {
  if (seat.mode === 'group') return seat.list;
  return { pilotIds: seat.person == null ? [] : [seat.person], groupIds: [] };
}

/** Suma list bez powtórzeń; kolejność pierwszego wystąpienia. */
export function unionLists(...lists: readonly AddressListDto[]): AddressListDto {
  const pilotIds: string[] = [];
  const groupIds: string[] = [];
  for (const list of lists) {
    for (const id of list.pilotIds) if (!pilotIds.includes(id)) pilotIds.push(id);
    for (const id of list.groupIds) if (!groupIds.includes(id)) groupIds.push(id);
  }
  return { pilotIds, groupIds };
}

export const isEmptyList = (list: AddressListDto): boolean => list.pilotIds.length === 0 && list.groupIds.length === 0;

/** Lista wspólna: suma list szukanych foteli i dopisanych w trakcie (pkt 47, 48). */
export function sharedListOf(draft: OrderFormDraft, seats: OrderSeatsDto): AddressListDto {
  return unionLists(...soughtSeats(seats).map((seat) => effectiveList(draft[seat])), draft.sharedExtra);
}

/**
 * Stan fotela. „Ja" stoi najwyżej w jednym fotelu (§4.1) - karta „Ja" przy drugim fotelu
 * jest wtedy zablokowana (`seatStates`), a gdyby jednak przyszła, drugi fotel wraca do
 * szukania. Dowódca „Brak" nie ma - lot bez dowódcy nie istnieje.
 */
export function withSeatState(draft: OrderFormDraft, seat: SeatDto, state: DualSeatStateDto, aircraft: FormAircraft | null): OrderFormDraft {
  const current = seatsOf(draft, aircraft);
  if (seat === 'pic' && state === 'none') return draft;
  const next: OrderSeatsDto =
    seat === 'pic' ? { pic: state as OrderSeatsDto['pic'], dual: current.dual } : { pic: current.pic, dual: state };
  if (state === 'self' && next[otherSeat(seat)] === 'self') {
    if (seat === 'pic') next.dual = 'sought';
    else next.pic = 'sought';
  }
  return { ...draft, seats: next };
}

const fitsPerson = (list: AddressListDto): boolean => list.groupIds.length === 0 && list.pilotIds.length <= 1;

/**
 * Sposób adresowania fotela. Wybór przechodzi do drugiego sposobu, kiedy ten jest pusty:
 * osoba wskazana imiennie staje się pierwszą osobą listy, a lista z jedną osobą - osobą
 * wskazaną imiennie. Przełączenie, które zaczynałoby od pustego, kazałoby wybierać drugi
 * raz to, co już wybrano.
 */
export function withMode(draft: OrderFormDraft, seat: SeatDto, mode: AddressMode): OrderFormDraft {
  const current = draft[seat];
  if (current.mode === mode) return draft;
  if (mode === 'group') {
    const list = isEmptyList(current.list) && current.person != null ? { pilotIds: [current.person], groupIds: [] } : current.list;
    return { ...draft, [seat]: { ...current, mode, list } };
  }
  const person = current.person ?? (fitsPerson(current.list) ? (current.list.pilotIds[0] ?? null) : null);
  return { ...draft, [seat]: { ...current, mode, person } };
}

/** Osoba wskazana imiennie (`<select>`); pusty napis = „Wybierz osobę". */
export function withPerson(draft: OrderFormDraft, seat: SeatDto, pilotId: string): OrderFormDraft {
  return { ...draft, [seat]: { ...draft[seat], mode: 'person', person: pilotId === '' ? null : pilotId } };
}

/** Pozycja listy adresatów - osoba albo grupa. */
export interface AddressEntry {
  kind: 'person' | 'group';
  id: string;
}

const has = (list: AddressListDto, entry: AddressEntry): boolean =>
  entry.kind === 'person' ? list.pilotIds.includes(entry.id) : list.groupIds.includes(entry.id);

const without = (list: AddressListDto, entry: AddressEntry): AddressListDto =>
  entry.kind === 'person'
    ? { ...list, pilotIds: list.pilotIds.filter((id) => id !== entry.id) }
    : { ...list, groupIds: list.groupIds.filter((id) => id !== entry.id) };

const withEntry = (list: AddressListDto, entry: AddressEntry): AddressListDto =>
  entry.kind === 'person' ? { ...list, pilotIds: [...list.pilotIds, entry.id] } : { ...list, groupIds: [...list.groupIds, entry.id] };

function seatWithout(seat: SeatAddress, entry: AddressEntry): SeatAddress {
  if (seat.mode === 'person') return entry.kind === 'person' && seat.person === entry.id ? { ...seat, person: null } : seat;
  return { ...seat, list: without(seat.list, entry) };
}

/**
 * Zaznaczenie albo odznaczenie pozycji na liście kart. Na liście fotela (tryb „Grupa") -
 * zwykły przełącznik. Na liście wspólnej odznaczenie zdejmuje pozycję WSZĘDZIE (z list
 * szukanych foteli i z dopisanych), a zaznaczenie dopisuje ją do `sharedExtra` (pkt 48).
 */
export function toggleEntry(
  draft: OrderFormDraft,
  target: SeatDto | 'shared',
  entry: AddressEntry,
  aircraft: FormAircraft | null,
): OrderFormDraft {
  if (target !== 'shared') {
    const seat = draft[target];
    const list = has(seat.list, entry) ? without(seat.list, entry) : withEntry(seat.list, entry);
    return { ...draft, [target]: { ...seat, mode: 'group', list } };
  }
  const seats = seatsOf(draft, aircraft);
  if (!has(sharedListOf(draft, seats), entry)) return { ...draft, sharedExtra: withEntry(draft.sharedExtra, entry) };
  let out: OrderFormDraft = { ...draft, sharedExtra: without(draft.sharedExtra, entry) };
  for (const seat of soughtSeats(seats)) out = { ...out, [seat]: seatWithout(out[seat], entry) };
  return out;
}

/**
 * Przełącznik „Wspólna lista". Włączenie niczego nie przenosi - lista wspólna jest sumą
 * list foteli (pkt 47). Wyłączenie stawia dopisanych w trakcie przy OBU szukanych fotelach
 * (pkt 48); fotel w trybie „Osoba", który z nimi przestaje mieścić jedną osobę, przechodzi
 * na „Grupa" - tryb „Osoba" nie umie pokazać dwóch nazwisk.
 */
export function withShared(draft: OrderFormDraft, on: boolean, aircraft: FormAircraft | null): OrderFormDraft {
  if (on) return { ...draft, shared: true, sharedExtra: emptyList() };
  let out: OrderFormDraft = { ...draft, shared: false, sharedExtra: emptyList() };
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
export function orderAudienceOf(draft: OrderFormDraft, aircraft: FormAircraft | null): OrderAudienceDto {
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
 * Osoby jednej listy - jak `collect` serwera: bez zlecającego, bez nieaktywnych; wskazanie
 * imienne wygrywa z grupą. `null` = nie wiadomo (grupy niewczytane).
 */
export function peopleOf(list: AddressListDto, ctx: AudienceContext): Map<string, Source> | null {
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

/** Kontekst rozwinięcia ze słownika klubu i listy grup. */
export function audienceContext(me: string, members: readonly DirectoryMemberDto[], groups: readonly GroupDto[] | null): AudienceContext {
  const active = new Set(members.filter((m) => m.active).map((m) => m.id));
  return {
    me,
    groups: groups == null ? null : new Map(groups.map((g) => [g.id, g.memberIds])),
    isActive: (id) => active.has(id),
  };
}

/** „1 osoba", „3 osoby", „5 osób". */
export const peopleCount = (n: number): string => `${n} ${plural(n, 'osoba', 'osoby', 'osób')}`;

/**
 * Stopka kroku 3: „Trafi do 6 osób" - SKUTEK przed kliknięciem. Osoba z list obu foteli
 * liczy się raz. `null` = nie ma czego zapowiadać (pusta lista albo grupy niewczytane).
 */
export function audienceNote(draft: OrderFormDraft, aircraft: FormAircraft | null, ctx: AudienceContext): string | null {
  const seats = seatsOf(draft, aircraft);
  const sought = soughtSeats(seats);
  if (sought.length === 0) return null;
  const lists = draft.shared ? [sharedListOf(draft, seats)] : sought.map((seat) => effectiveList(draft[seat]));
  if (lists.some(isEmptyList)) return null;
  const everyone = new Set<string>();
  for (const list of lists) {
    const people = peopleOf(list, ctx);
    if (people == null) return null;
    for (const id of people.keys()) everyone.add(id);
  }
  if (everyone.size === 0) return null;
  return `Trafi do ${everyone.size} ${everyone.size === 1 ? 'osoby' : 'osób'}`;
}

// ── krok 3: karty foteli i listy adresatów ───────────────────────────────────

export interface SeatStateVm {
  state: DualSeatStateDto;
  name: string;
  desc: string;
  selected: boolean;
  disabled: boolean;
}

/**
 * Karty stanu fotela. „Ja" w drugim fotelu jest zablokowane z powodem w środku, a „Brak"
 * przy maszynie z wymogiem załogi dwuosobowej - tymi samymi słowami, co bramka (ZL2b, ZL2c).
 */
export function seatStates(draft: OrderFormDraft, seat: SeatDto, aircraft: FormAircraft | null): SeatStateVm[] {
  const seats = seatsOf(draft, aircraft);
  const other = otherSeat(seat);
  const out: SeatStateVm[] = [
    {
      state: 'self',
      name: 'Ja',
      desc: seats[other] === 'self' ? `Jesteś w fotelu ${SEAT_GENITIVE[other]}` : 'Lecisz w tym fotelu',
      selected: seats[seat] === 'self',
      disabled: seats[other] === 'self',
    },
    {
      state: 'sought',
      name: 'Szukam',
      desc: draft.shared ? 'Z listy niżej' : 'Wyślesz zlecenie',
      selected: seats[seat] === 'sought',
      disabled: false,
    },
  ];
  if (seat === 'dual') {
    const required = aircraft?.dualRequired === true;
    out.push({
      state: 'none',
      name: 'Brak',
      desc: required ? dualRequiredReason(aircraft) : 'Lot bez drugiego pilota',
      selected: seats.dual === 'none',
      disabled: required,
    });
  }
  return out;
}

const dualRequiredReason = (aircraft: FormAircraft | null): string =>
  `${aircraft?.reg === '' || aircraft == null ? 'Ta maszyna' : aircraft.reg} wymaga załogi dwuosobowej`;

/** Pozycja listy kart: grupa albo osoba. */
export interface AddressOptionVm {
  kind: 'group' | 'person';
  id: string;
  name: string;
  desc: string;
  selected: boolean;
  /** Osoba zaznaczona przez grupę - widać, że dostanie zlecenie, ale odznacza się grupę. */
  disabled: boolean;
}

/**
 * Wysłani adresaci w edycji (6b): zlecenie już do nich poszło, więc na liście stoją
 * zaznaczeni i zablokowani - odebranie to osobna czynność („⋯" przy adresacie na karcie).
 */
export interface SentAddressees {
  /** Osoby, które zlecenie mają (na dowolnym fotelu). */
  people: ReadonlySet<string>;
  /** Grupy wysłane na TĘ listę - z liczbą osób, do których przez nią poszło. */
  groups: ReadonlyMap<string, number>;
}

export interface AddressOptionsInput {
  draft: OrderFormDraft;
  target: SeatDto | 'shared';
  aircraft: FormAircraft | null;
  members: readonly DirectoryMemberDto[];
  groups: readonly GroupDto[];
  ctx: AudienceContext;
  /** Wyszukiwarka nad listą - nazwa grupy, nazwisko albo kod osoby. */
  query: string;
  /** Edycja - wysłani adresaci; bez tego lista jest listą nowego zlecenia. */
  sent?: SentAddressees;
}

/**
 * Listy kart kroku 3: grupy NAD osobami (jednym wyborem obejmują wielu). Osoby, do których
 * zlecenie dojdzie przez zaznaczoną grupę, stoją zaznaczone i zablokowane („przez grupę") -
 * widać, kto naprawdę je dostanie. Osoba wskazana imiennie na drugi fotel jest DOSTĘPNA
 * z podpisem o terminie do potwierdzenia (pkt 37). Zlecającego i członków wyłączonych na
 * liście nie ma wcale.
 */
export function addressOptions(input: AddressOptionsInput): { groups: AddressOptionVm[]; people: AddressOptionVm[] } {
  const { draft, target, ctx } = input;
  const seats = seatsOf(draft, input.aircraft);
  const list = target === 'shared' ? sharedListOf(draft, seats) : draft[target].list;
  const q = input.query.trim().toLocaleLowerCase('pl-PL');
  const hit = (...texts: string[]): boolean => q === '' || texts.some((t) => t.toLocaleLowerCase('pl-PL').includes(q));

  const groups: AddressOptionVm[] = input.groups
    .filter((g) => hit(g.name))
    .map((g) => {
      const sentTo = input.sent?.groups.get(g.id);
      if (sentTo != null) {
        return { kind: 'group', id: g.id, name: g.name, desc: `wysłane · ${peopleCount(sentTo)}`, selected: true, disabled: true };
      }
      return {
        kind: 'group',
        id: g.id,
        name: g.name,
        desc: peopleCount(peopleOf({ pilotIds: [], groupIds: [g.id] }, ctx)?.size ?? 0),
        selected: list.groupIds.includes(g.id),
        disabled: false,
      };
    });

  const groupName = new Map(input.groups.map((g) => [g.id, g.name]));
  const viaGroups = peopleOf({ pilotIds: [], groupIds: list.groupIds }, ctx) ?? new Map<string, Source>();
  const other = target === 'shared' ? null : otherSeat(target);
  const namedOnOther =
    other != null && !draft.shared && seats[other] === 'sought' && draft[other].mode === 'person' ? draft[other].person : null;

  const people: AddressOptionVm[] = input.members
    .filter((m) => m.active && m.id !== ctx.me && hit(m.name, m.code))
    .map((m) => {
      if (input.sent?.people.has(m.id) === true) {
        return { kind: 'person', id: m.id, name: m.name, desc: `${m.code} · ma już zlecenie`, selected: true, disabled: true };
      }
      const via = viaGroups.get(m.id);
      if (via?.viaGroupId != null) {
        return {
          kind: 'person',
          id: m.id,
          name: m.name,
          desc: `${m.code} · przez grupę ${groupName.get(via.viaGroupId) ?? ''}`.trim(),
          selected: true,
          disabled: true,
        };
      }
      const selected = list.pilotIds.includes(m.id);
      const desc =
        namedOnOther === m.id && other != null
          ? `${m.code} · imiennie na fotel ${SEAT_GENITIVE[other]} · ${selected ? 'dostanie termin do potwierdzenia' : 'po zaznaczeniu termin do potwierdzenia'}`
          : m.code;
      return { kind: 'person', id: m.id, name: m.name, desc, selected, disabled: false };
    });

  return { groups, people };
}

/** Osoby do `<select>` trybu „Osoba" - aktywni członkowie bez zlecającego. */
export function personChoices(members: readonly DirectoryMemberDto[], me: string): { id: string; label: string }[] {
  return members.filter((m) => m.active && m.id !== me).map((m) => ({ id: m.id, label: `${m.name} · ${m.code}` }));
}

/** Fragment zdania; `strong` = pogrubienie. */
export interface TextPart {
  text: string;
  strong?: boolean;
}

/**
 * Podpis pod osobą wskazaną imiennie, która jest też na liście drugiego fotela (pkt 39):
 * dostanie termin do potwierdzenia, więc jej „tak" nie obsadzi fotela samo. Mówi to PRZED
 * wysłaniem i niczego nie blokuje. `null` = warunek nie zachodzi albo grup nie wczytano.
 */
export function seatHint(
  draft: OrderFormDraft,
  seat: SeatDto,
  aircraft: FormAircraft | null,
  ctx: AudienceContext,
  groupName: (id: string) => string,
): TextPart[] | null {
  if (draft.shared) return null;
  const seats = seatsOf(draft, aircraft);
  const other = otherSeat(seat);
  const named = draft[seat];
  if (seats[seat] !== 'sought' || seats[other] !== 'sought' || named.mode !== 'person' || named.person == null) return null;
  const source = peopleOf(effectiveList(draft[other]), ctx)?.get(named.person);
  if (source == null) return null;
  const lead =
    draft[other].mode === 'person'
      ? `Jest też imiennie na ${SEAT_ACCUSATIVE[other]}`
      : source.named
        ? `Jest też na liście ${SEAT_GENITIVE[other]}`
        : `Jest też w grupie „${groupName(source.viaGroupId ?? '')}"`;
  return [{ text: lead, strong: true }, { text: ' · dostanie termin do potwierdzenia, fotel wybierzesz po odpowiedzi.' }];
}

/** Zdanie pod listą fotela w trybie „Grupa" - jak fotel się obsadzi. */
export const GROUP_HINT = 'Zgłoszenia zobaczysz na karcie zlecenia - fotel obsadzisz przyciskiem „Wybierz".';

/** Zdanie pod wspólną listą - fotele przydziela prowadzący na karcie zlecenia (§4.3). */
export function sharedHint(seats: OrderSeatsDto): string {
  const sought = soughtSeats(seats);
  if (sought.length === 1) {
    return `Fotel przydzielisz na karcie zlecenia: „Na ${SEAT_ACCUSATIVE[sought[0]!]}" przy każdej osobie, która może lecieć.`;
  }
  return 'Fotele przydzielisz na karcie zlecenia: „Na dowódcę" albo „Na drugiego pilota" przy każdej osobie, która może lecieć.';
}

// ── bramka kroku 3 i drut ────────────────────────────────────────────────────

/**
 * Powód blokady „Wyślij zlecenie" (ZL2c). Kolejność powagi: najpierw „to w ogóle nie jest
 * zlecenie", potem wymóg maszyny - obu nie widać z kontrolki nad przyciskiem, więc niosą
 * powód. Szukany fotel bez adresatów blokuje BEZ zdania - puste pole stoi tuż nad nim.
 */
export function orderStep3Blocker(draft: OrderFormDraft, aircraft: FormAircraft | null): Blocker {
  const seats = seatsOf(draft, aircraft);
  const sought = soughtSeats(seats);
  if (sought.length === 0) return { reason: 'Ustaw „Szukam" przy co najmniej jednym fotelu.' };
  if (seats.dual === 'none' && aircraft?.dualRequired === true) return { reason: `${dualRequiredReason(aircraft)}.` };
  if (draft.shared) return isEmptyList(sharedListOf(draft, seats)) ? 'incomplete' : null;
  return sought.some((seat) => isEmptyList(effectiveList(draft[seat]))) ? 'incomplete' : null;
}

/**
 * Czy szkic różni się od tego, od czego szuflada wystartowała - pytanie o rezygnację przy
 * zamknięciu i bramka „Zapisz zmiany" w edycji. Punktem odniesienia jest szkic STARTOWY:
 * pusty z maszyną i dniem z komórki kalendarza (podstawione nie liczą się jako wpis -
 * reguła z telefonu), powielony albo odtworzony z karty zlecenia.
 */
export function orderFormDirty(draft: OrderFormDraft, initial: OrderFormDraft): boolean {
  return (Object.keys(initial) as (keyof OrderFormDraft)[]).some((key) => JSON.stringify(draft[key]) !== JSON.stringify(initial[key]));
}

const orNull = (text: string): string | null => (text.trim() === '' ? null : text.trim());
const icao = (text: string): string | null => orNull(text)?.toUpperCase() ?? null;

/** Ciało `POST /orders`; `null` = szkic nie przechodzi bramek (nie ma czego wysłać). */
export function orderCreateBody(draft: OrderFormDraft, id: string, tz: string, aircraft: FormAircraft | null): NewOrderDto | null {
  const slot = draftSlot(draft, tz);
  const air = parsePlannedAir(draft.plannedAir);
  const fuel = parseFuel(draft.plannedFuel);
  if (slot == null || air == null || fuel === undefined) return null;
  return {
    id,
    aircraftId: draft.aircraftId,
    startsAt: new Date(slot.startsAt).toISOString(),
    endsAt: new Date(slot.endsAt).toISOString(),
    operation: draft.operation,
    fromIcao: icao(draft.fromIcao),
    // Skoki mają jedno lotnisko - pole „Lądowanie" znika z formularza i z drutu.
    toIcao: singleField(draft.operation) ? null : icao(draft.toIcao),
    plannedAirMin: air,
    plannedFuelL: fuel,
    note: orNull(draft.note),
    seats: seatsOf(draft, aircraft),
    audience: orderAudienceOf(draft, aircraft),
  };
}
