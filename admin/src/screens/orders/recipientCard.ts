/**
 * Ninerdeck - panel: SZUFLADA ZLECENIA OCZAMI ADRESATA (makieta `zlecenia-szczegoly`, ZL3a
 * i ZL3d; `docs/zlecenia.md` §4, §5, §6.3, §8; 4.0.0, epik Z-D #248).
 *
 * Te same stany i słowa, co karta 28 w telefonie (`orderRecipientCard.ts`), w kształcie
 * szuflady panelu.
 *
 * ══ KARTA MÓWI O FOTELACH I ZAŁODZE, NIGDY O INNYCH ADRESATACH (pkt 18) ══
 * Adresat widzi fotel zaproponowany JEMU („Proponowany fotel", błękitna krawędź - jedyny
 * kolorowy wiersz, bo jedyny, o który ekran pyta) i załogę, która już jest. Drugi fotel
 * pisze „szukany", dopóki nikt go nie zajmie - komu go zlecono, adresat się nie dowie.
 * Fotel „brak" wiersza nie ma.
 *
 * ══ CZTERY STANY JEDNEJ SZUFLADY ══
 *  - pytanie: „Czeka na odpowiedź", stopka „Nie mogę" + „Przyjmuję" (imiennie - obsadza fotel)
 *    albo „Mogę lecieć" (grupa, wspólna lista, termin do potwierdzenia - to zgłoszenie);
 *  - po odpowiedzi: „Zgłoszone" (zostaje samo „Nie mogę", które wycofuje zgłoszenie) albo
 *    „Nie mogę" (zostaje sam przycisk zmiany zdania - decyzja właściciela 2026-10-06);
 *  - termin zmieniony: odpowiedzi od nowa (pkt 13), poprzednia przekreślona, „było …" przy
 *    godzinach;
 *  - nieaktualne: karta albo baner mówi DLACZEGO, stopki nie ma.
 * Lot, który JUŻ JEST mój, nie ma karty zlecenia - jest rezerwacją (§14.3): `kind: 'booking'`
 * każe szufladzie przejść do kalendarza.
 *
 * Trasa pokazuje same kody ICAO (decyzja 2026-10-07) - panel nie zna nazw lotnisk.
 * Moduł czysty - test obok.
 */

import { plural } from '@ninerdeck/format';

import type { OrderCardDto, OrderMeDto, SeatDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import { hoursLabel, operationLabel, type PersonLookup } from '../calendar/bookingLabels';
import { NONE } from '../common/values';
import { fieldChanges, type FieldChange } from './orderChanges';
import {
  dayMoment,
  hoursSpan,
  momentLabel,
  planLabel,
  quoted,
  routeLabel,
  SEAT_GENITIVE,
  SEAT_LABEL,
  sentLabel,
  termHoursLabel,
  termRelative,
  termTitleDay,
} from './orderLabels';

export interface RecipientCardInput {
  card: OrderCardDto;
  now: number;
  person: PersonLookup;
  aircraft: (aircraftId: string) => { reg: string; type: string } | null;
}

/** Wiersz karty „Załoga". */
export interface CrewLineVm {
  label: string;
  /** Nazwisko osoby w fotelu albo „Ty"; `null` przy fotelu szukanym i terminie do potwierdzenia. */
  value: string | null;
  /** Fotel zaproponowany mnie (`.kv.you`) - z plakietką. */
  you: boolean;
  /** „Proponowany fotel" / „Termin do potwierdzenia". */
  tag: string | null;
  /** Fotel szukany - „szukany" przygaszonym tonem (`.was`). */
  sought: boolean;
}

export interface AnswerVm {
  value: string;
  /** Odpowiedź sprzed zmiany terminu - przekreślona. */
  old: boolean;
  sub: string;
  quote: string | null;
}

/** Dlaczego zlecenie przestało czekać - karta z tytułem albo czerwony baner odwołania. */
export interface OutcomeVm {
  kind: 'filled' | 'removed' | 'expired' | 'cancelled';
  title: string;
  text: string | null;
  quote: string | null;
  /** „dziś 16:20" - chwila decyzji; `null` = bez godziny. */
  meta: string | null;
}

export interface DetailVm {
  label: string;
  value: string;
  sub: string | null;
}

/** Linijka zmiany na końcu karty „Zlecenie" - BEZ nazwiska zmieniającego (pkt 31). */
export interface EditedVm {
  label: 'Edytowane' | 'Termin zmieniony';
  when: string;
  changes: FieldChange[];
}

/**
 * Wiersz karty „Rozmowa" (`.todo-row`) - z osobą zlecającą. Bez wiadomości mówi, do kogo
 * napiszesz; z nową - ile i kiedy; w zleceniu nieaktualnym prowadzi do rozmowy do odczytu,
 * o ile ta w ogóle powstała. Te same zdania, co wiersz rozmowy na karcie 28 w telefonie.
 */
export interface RecipientThreadVm {
  title: string;
  sub: string;
  readOnly: boolean;
}

export type RecipientAnswer = 'accept' | 'volunteer';

export interface RecipientCardVm {
  kind: 'question' | 'stale' | 'booking';
  title: string;
  pill: { text: string; tone: PillTone };
  sub: string;
  outcome: OutcomeVm | null;
  crew: CrewLineVm[] | null;
  answer: AnswerVm | null;
  /** „SP-AXA 10:00-12:00" - moja inna rezerwacja w tym terminie; nie blokuje (§4.3). */
  clash: string | null;
  details: DetailVm[];
  edited: EditedVm | null;
  /** Wejście w rozmowę; `null` = nie ma czego otworzyć (nieaktualne, a rozmowa nie powstała). */
  thread: RecipientThreadVm | null;
  /** „Przyjmuję" albo „Mogę lecieć"; `null` = „tak" już padło albo zlecenie nieaktualne. */
  primary: RecipientAnswer | null;
  decline: boolean;
  /** Zdanie w stopce - skutek kliknięcia; `null` = stopki nie ma. */
  note: string | null;
  /** Kto przydziela fotel - nazwisko osoby zlecającej (zdania w stopce i przy odpowiedzi). */
  creator: string;
}

const SEATS: readonly SeatDto[] = ['pic', 'dual'];

const parsed = (iso: string | null | undefined): number | null => {
  if (iso == null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
};

/** `null` = karta nie do narysowania (termin nie do przeczytania albo nie jestem adresatem). */
export function recipientCard(input: RecipientCardInput): RecipientCardVm | null {
  const { card } = input;
  const me = card.viewer.recipient;
  const startsAt = parsed(card.booking.startsAt);
  const endsAt = parsed(card.booking.endsAt);
  if (me == null || startsAt == null || endsAt == null) return null;
  const tz = card.timezone;

  const stale = !me.inPlay;
  const kind: RecipientCardVm['kind'] = stale ? 'stale' : me.assignedSeat != null ? 'booking' : 'question';
  const termChanged = termChangedFor(card, me);
  const creator = input.person(card.order.createdBy)?.name ?? NONE;
  const plane = input.aircraft(card.booking.aircraftId);

  const hours = `${termHoursLabel(startsAt, endsAt, tz)} czasu klubu`;
  const was = termChanged ? wasOf(card.lastTermChange?.from, tz) : null;
  const task = [card.booking.operation == null ? null : operationLabel(card.booking.operation).toLowerCase(), routeLabel(card.booking.fromIcao, card.booking.toIcao)]
    .filter((p): p is string => p != null)
    .join(' ');

  return {
    kind,
    title: `${plane?.reg ?? NONE} · ${termTitleDay(startsAt, tz)}`,
    pill: pillOf(card, me, termChanged),
    // Zlecenie żywe mówi długość i ile zostało; nieaktualne - czym było, jak w widoku prowadzącego.
    sub: stale
      ? [hours, task === '' ? null : task].filter((p): p is string => p != null).join(' · ')
      : [hours, hoursLabel(endsAt - startsAt), termRelative(startsAt, input.now, tz), was].filter((p): p is string => p != null).join(' · '),
    outcome: stale ? outcomeOf(card, me, input) : null,
    crew: stale ? null : crewLines(card, me, input),
    answer: stale ? null : answerOf(me, input, creator),
    clash: stale ? null : clashOf(card, input),
    details: detailRows(card, input, creator, plane),
    edited: stale ? null : editedOf(card, input, termChanged, startsAt),
    thread: threadOf(me, creator, input.person(card.order.createdBy)?.code ?? null, input.now, tz, stale),
    primary: stale || me.answer === 'yes' ? null : me.direct && me.seat != null ? 'accept' : 'volunteer',
    decline: !stale && me.answer !== 'no',
    note: stale ? null : noteOf(me, creator),
    creator,
  };
}

/** Termin zmieniono, a ja jeszcze nie odpowiedziałem na nowy - przypomnienie w plakietce. */
const termChangedFor = (card: OrderCardDto, me: OrderMeDto): boolean =>
  me.inPlay && me.answer == null && card.lastTermChange != null;

/**
 * Plakietka adresata poza jego szufladą - w szufladzie zajętości kalendarza (K2c), gdzie
 * „czeka na odpowiedź" trzeba dopowiedzieć słowem „Twoją": szuflada mówi tam o rezerwacji,
 * nie o moim zleceniu. `null` = patrzący nie jest adresatem.
 */
export function recipientPill(card: OrderCardDto, waiting?: string): RecipientCardVm['pill'] | null {
  const me = card.viewer.recipient;
  return me == null ? null : pillOf(card, me, termChangedFor(card, me), waiting);
}

function pillOf(
  card: OrderCardDto,
  me: OrderMeDto,
  termChanged: boolean,
  waiting = 'Czeka na odpowiedź',
): RecipientCardVm['pill'] {
  if (!me.inPlay) {
    if (card.order.status === 'cancelled') return { text: 'Odwołane', tone: 'red' };
    if (card.order.status === 'expired') return { text: 'Wygasło', tone: 'dim' };
    return { text: 'Nieaktualne', tone: 'dim' };
  }
  if (termChanged) return { text: 'Termin zmieniony', tone: 'amber' };
  if (me.answer === 'yes') return { text: 'Zgłoszone', tone: 'dim' };
  if (me.answer === 'no') return { text: 'Nie mogę', tone: 'dim' };
  return { text: waiting, tone: 'blue' };
}

/** „było 09:00-11:00" - poprzedni termin w godzinach doby klubu. */
function wasOf(from: unknown, tz: string): string | null {
  if (from == null || typeof from !== 'object') return null;
  const value = from as { startsAt?: unknown; endsAt?: unknown };
  const s = typeof value.startsAt === 'string' ? parsed(value.startsAt) : null;
  const e = typeof value.endsAt === 'string' ? parsed(value.endsAt) : null;
  return s == null || e == null ? null : `było ${hoursSpan(s, e, tz)}`;
}

/** DLACZEGO zlecenie przestało czekać na tę osobę - kto dostał fotel, adresata nie dotyczy. */
function outcomeOf(card: OrderCardDto, me: OrderMeDto, input: RecipientCardInput): OutcomeVm {
  const at = (iso: string | null): string | null => {
    const ms = parsed(iso);
    return ms == null ? null : dayMoment(ms, input.now, card.timezone);
  };
  if (card.order.status === 'cancelled') {
    // Tytuł RZECZOWNIKIEM i nazwisko za separatorem - bez czasownika z płcią.
    const by = card.order.closedBy == null ? null : (input.person(card.order.closedBy)?.name ?? null);
    return {
      kind: 'cancelled',
      title: by == null ? 'Odwołanie' : `Odwołanie · ${by}`,
      text: null,
      quote: card.order.closeReason == null || card.order.closeReason.trim() === '' ? null : quoted(card.order.closeReason),
      meta: at(card.order.closedAt),
    };
  }
  if (card.order.status === 'expired') {
    // Bez nazwiska - zrobił to zegar, nie człowiek.
    return {
      kind: 'expired',
      title: 'Zlecenie wygasło',
      text: 'Początek terminu bez kompletu załogi - termin wrócił do puli.',
      quote: null,
      meta: at(card.order.closedAt),
    };
  }
  if (me.staleReason === 'removed') {
    return {
      kind: 'removed',
      title: 'Zlecenie cofnięte',
      text: null,
      quote: me.removeReason == null || me.removeReason.trim() === '' ? null : quoted(me.removeReason),
      meta: at(me.removedAt),
    };
  }
  // Fotel obsadzony - i fotel zniesiony, który adresat czyta tak samo (decyzja 2026-10-06).
  const seat = me.seat ?? me.namedSeat;
  return {
    kind: 'filled',
    title: 'Fotel obsadzony',
    text: seat == null ? 'Załoga na tym locie jest już kompletna.' : `Fotel ${SEAT_GENITIVE[seat]} na tym locie jest już zajęty.`,
    quote: null,
    meta: null,
  };
}

function crewLines(card: OrderCardDto, me: OrderMeDto, input: RecipientCardInput): CrewLineVm[] {
  const seated: Record<SeatDto, string | null> = { pic: card.booking.pilotId, dual: card.booking.dualId };
  const lines: CrewLineVm[] = [];
  for (const seat of SEATS) {
    // Fotel „brak" nie dostaje wiersza - wiersz o pustym fotelu byłby zdaniem o niczym.
    if (card.order.seats[seat] === 'none') continue;
    const person = seated[seat];
    if (person != null) lines.push({ label: SEAT_LABEL[seat], value: input.person(person)?.name ?? NONE, you: false, tag: null, sought: false });
    else if (me.seat === seat) lines.push({ label: SEAT_LABEL[seat], value: 'Ty', you: true, tag: 'Proponowany fotel', sought: false });
    else lines.push({ label: SEAT_LABEL[seat], value: null, you: false, tag: null, sought: true });
  }
  // Termin do potwierdzenia: żaden fotel nie jest mój - fotel przydzieli osoba zlecająca.
  if (me.seat == null) lines.push({ label: 'Twój fotel', value: null, you: true, tag: 'Termin do potwierdzenia', sought: false });
  return lines;
}

function answerOf(me: OrderMeDto, input: RecipientCardInput, creator: string): AnswerVm | null {
  const tz = input.card.timezone;
  const at = (iso: string | null): string => {
    const ms = parsed(iso);
    return ms == null ? NONE : momentLabel(ms, input.now, tz);
  };
  const reason = (text: string | null): string | null => (text == null || text.trim() === '' ? null : quoted(text));
  if (me.answer === 'yes') return { value: 'Mogę lecieć', old: false, sub: `zgłoszone ${at(me.answeredAt)} · fotel przydziela ${creator}`, quote: null };
  if (me.answer === 'no') return { value: 'Nie mogę', old: false, sub: at(me.answeredAt), quote: reason(me.answerReason) };
  if (me.previousAnswer != null) {
    return {
      value: me.previousAnswer === 'yes' ? 'Mogę lecieć' : 'Nie mogę',
      old: true,
      sub: `${at(me.previousAnswerAt)} · poprzedni termin`,
      quote: reason(me.previousAnswerReason),
    };
  }
  return null;
}

/** Moje inne rezerwacje w tym terminie - po przecinku, każda ze znakiem i godzinami. */
function clashOf(card: OrderCardDto, input: RecipientCardInput): string | null {
  const spans: string[] = [];
  for (const c of card.myConflicts) {
    const s = parsed(c.startsAt);
    const e = parsed(c.endsAt);
    if (s == null || e == null) continue;
    spans.push(`${input.aircraft(c.aircraftId)?.reg ?? NONE} ${hoursSpan(s, e, card.timezone)}`);
  }
  return spans.length === 0 ? null : spans.join(', ');
}

/** Te same pary, co szuflada zajętości (K2), plus „Zleca" - z tą osobą się rozmawia. */
function detailRows(
  card: OrderCardDto,
  input: RecipientCardInput,
  creator: string,
  plane: { reg: string; type: string } | null,
): DetailVm[] {
  const b = card.booking;
  const rows: DetailVm[] = [{ label: 'Samolot', value: plane?.reg ?? NONE, sub: plane?.type ?? null }];
  if (b.operation != null) rows.push({ label: 'Zadanie', value: operationLabel(b.operation), sub: null });
  const route = routeLabel(b.fromIcao, b.toIcao);
  if (route != null) rows.push({ label: route.includes('→') ? 'Trasa' : 'Lotnisko', value: route, sub: null });
  const plan = planLabel(b.plannedAirMin, b.plannedFuelL);
  if (plan !== '') rows.push({ label: 'Plan lotu', value: plan, sub: null });
  if (b.note != null && b.note.trim() !== '') rows.push({ label: 'Opis', value: b.note.trim(), sub: null });
  const created = parsed(card.order.createdAt);
  const code = input.person(card.order.createdBy)?.code ?? null;
  const sent = created == null ? null : sentLabel(created, input.now, card.timezone);
  rows.push({ label: 'Zleca', value: creator, sub: [code, sent].filter((p): p is string => p != null).join(' · ') || null });
  return rows;
}

function editedOf(card: OrderCardDto, input: RecipientCardInput, termChanged: boolean, termAt: number): EditedVm | null {
  const tz = card.timezone;
  const ctx = { timezone: tz, regOf: (id: string) => input.aircraft(id)?.reg ?? null, termAt };
  if (termChanged && card.lastTermChange != null) {
    const at = parsed(card.lastTermChange.at);
    const [change] = fieldChanges({ term: { from: card.lastTermChange.from, to: card.lastTermChange.to } }, ctx);
    if (at != null && change != null) return { label: 'Termin zmieniony', when: dayMoment(at, input.now, tz), changes: [change] };
  }
  if (card.lastEdit == null) return null;
  const at = parsed(card.lastEdit.at);
  const changes = fieldChanges(card.lastEdit.changes, ctx, ['term']);
  if (at == null || changes.length === 0) return null;
  return { label: 'Edytowane', when: dayMoment(at, input.now, tz), changes };
}

/** Zdanie w stopce - skutek kliknięcia, raz. */
function noteOf(me: OrderMeDto, creator: string): string {
  if (me.answer === 'yes') return 'Jeśli coś się zmieni, „Nie mogę" wycofa Twoje zgłoszenie';
  if (me.direct && me.seat != null) return 'Po przyjęciu lot jest Twoją rezerwacją';
  if (me.seat == null) return `„Mogę lecieć" potwierdza termin - fotel przydziela ${creator}`;
  return `„Mogę lecieć" to zgłoszenie - fotel przydziela ${creator}`;
}

function threadOf(
  me: OrderMeDto,
  creator: string,
  code: string | null,
  now: number,
  tz: string,
  stale: boolean,
): RecipientThreadVm | null {
  if (stale) return me.threadId == null ? null : { title: `Rozmowa · ${creator}`, sub: 'do odczytu', readOnly: true };
  if (me.threadId == null) return { title: 'Napisz wiadomość', sub: `${creator} · zleca`, readOnly: false };
  if (me.unread > 0) {
    const last = parsed(me.lastUnreadAt);
    const count = `${me.unread} ${plural(me.unread, 'nowa wiadomość', 'nowe wiadomości', 'nowych wiadomości')}`;
    return {
      title: `Rozmowa · ${creator}`,
      sub: last == null ? count : `${count} · ${momentLabel(last, now, tz)}`,
      readOnly: false,
    };
  }
  // Rozmowa jest, nowych wiadomości nie ma - podpis jak nagłówek rozmowy: „zleca · MZI".
  return { title: `Rozmowa · ${creator}`, sub: code == null ? 'zleca' : `zleca · ${code}`, readOnly: false };
}
