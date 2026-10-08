/**
 * Ninerdeck - KARTA ZLECENIA OCZAMI ADRESATA (4.0.0, epik Z-C #247; makiety 28, 28A, 28B,
 * 28C; `docs/zlecenia.md` §4, §5, §6.3, §8).
 *
 * ══ KARTA MÓWI O FOTELACH I ZAŁODZE, NIGDY O INNYCH ADRESATACH (pkt 18) ══
 * Adresat widzi fotel, który zaproponowano JEMU, i załogę, która już jest - z kim poleci,
 * to treść zlecenia. Do kogo jeszcze poszło zlecenie, przez jaką grupę i ile osób się
 * zgłosiło, należy do prowadzących.
 *
 * ══ CZTERY STANY JEDNEJ KARTY ══
 *  - pytanie (28, 28A): plakietka „Czeka na odpowiedź", pas PRZYJMUJĘ / MOGĘ LECIEĆ /
 *    NIE MOGĘ z jednym zdaniem o skutku tapnięcia;
 *  - po odpowiedzi: „Zgłoszone" (zostaje samo NIE MOGĘ, które wycofuje zgłoszenie) albo
 *    „Nie mogę" (zostaje sam przycisk zmiany zdania - decyzja właściciela 2026-10-06);
 *  - termin zmieniony (28C): odpowiedzi zaczynają się od nowa, poprzednia stoi przekreślona;
 *  - nieaktualne (28B): baner mówi DLACZEGO, pasa akcji nie ma, rozmowa zostaje do odczytu.
 * Lot, który JUŻ JEST mój, nie ma karty zlecenia: jest rezerwacją (23F, §14.3) - stąd
 * `kind: 'booking'`, po którym ekran przechodzi na kartę rezerwacji.
 *
 * Otwarcie karty zapisuje „Odczytane" u prowadzących (pkt 17) - ekran o tym nie mówi, bo
 * to skutek patrzenia, a nie czynność.
 */

import { plural } from '@ninerdeck/format';

import type { RemoteOrderCard, RemoteOrderMe, RemoteSeat } from '../../../application';

import { routeDetailRow } from './bookingDetails';
import type { ClubDayBounds } from './clubClock';
import { changesParts, termSpan, type ChangePart } from './orderChanges';
import {
  ANSWER,
  dayAround,
  instant,
  LONG,
  momentLabel,
  NONE,
  orderCountdown,
  orderDate,
  orderDay,
  orderDayShort,
  orderHours,
  orderLength,
  orderReference,
  orderSpan,
  personLabel,
  planLine,
  seatGenitive,
  seatLabel,
} from './orderFormat';
import { operationLabelOf } from './operations';

/** Ton plakietki w hero: błękit pyta, zieleń mówi „w normie", bursztyn - uwaga, czerwień - odwołanie. */
export type BadgeTone = 'blue' | 'green' | 'dim' | 'amber' | 'red' | 'neutral';

export interface OrderHeroVm {
  /** „Sobota · 3 października". */
  date: string;
  badge: { text: string; tone: BadgeTone };
  /** „09:00 → 13:00". */
  hours: string;
  /** „było 09:00-11:00" - wyłącznie przy zmienionym terminie (28C). */
  was: string | null;
  /** „4 h". */
  length: string;
  /** „ZA 11 H 12 MIN"; `null` w zleceniu nieaktualnym. */
  countdown: string | null;
}

/** Wiersz karty „Załoga": fotel i kto w nim jest (albo że jest szukany). */
export interface CrewRowVm {
  /** „Dowódca"; `null` = wiersz „Ty" przy terminie do potwierdzenia (bez fotela). */
  seat: string | null;
  value: string;
  you: boolean;
  sought: boolean;
  /** „Proponowany fotel" / „Termin do potwierdzenia". */
  tag: string | null;
}

export interface DetailRowVm {
  label: string;
  value: string;
  sub: string | null;
  mono: boolean;
}

export interface OrderBannerVm {
  /** Los zlecenia - po nim ekran dobiera glif banera (28B: „i", krzyżyk, klepsydra, cofnięcie). */
  kind: 'filled' | 'cancelled' | 'expired' | 'removed';
  title: string;
  /** Zdanie pod tytułem („Fotel drugiego pilota na tym locie jest już zajęty."). */
  text: string | null;
  /** Powód jako cytat - opcjonalny (pkt 16); bez niego baner ma sam tytuł i godzinę. */
  quote: string | null;
  meta: string | null;
  tone: 'neutral' | 'red';
}

export interface AnswerVm {
  /** „Mogę lecieć" / „Nie mogę". */
  value: string;
  /** `old` = odpowiedź z poprzedniego terminu, przekreślona (28C). */
  tone: 'ok' | 'no' | 'old';
  sub: string;
  quote: string | null;
}

export interface ThreadRowVm {
  title: string;
  sub: string;
  /** Kropka - nowa wiadomość od osoby zlecającej. */
  unread: boolean;
  /** Rozmowa do odczytu (28B) - prowadzi do rozmowy bez pola wiadomości. */
  readOnly: boolean;
}

export type RecipientAction = 'accept' | 'volunteer';

export interface RecipientCardVm {
  /** `booking` = lot jest już mój - ekran pokazuje kartę rezerwacji (23F), nie zlecenia. */
  kind: 'question' | 'stale' | 'booking';
  hero: OrderHeroVm;
  banner: OrderBannerVm | null;
  /** `null` w zleceniu nieaktualnym - załoga przestała być treścią dla adresata (28B). */
  crew: CrewRowVm[] | null;
  answer: AnswerVm | null;
  /** „SP-AXA 10:00-12:00" - moja inna rezerwacja w tym terminie (Typ B, bursztyn). */
  clash: string | null;
  details: DetailRowVm[];
  /** „Edytowane 07:10 · plan lotu 2:00 → 3:00" / „Termin zmieniony 07:31 · …". */
  edited: ChangePart[] | null;
  thread: ThreadRowVm | null;
  /** PRZYJMUJĘ albo MOGĘ LECIEĆ; `null` = odpowiedź „tak" już padła. */
  primary: RecipientAction | null;
  decline: boolean;
  /** Zdanie pod pasem - skutek tapnięcia, z jednym pogrubieniem. */
  note: ChangePart[] | null;
  /** „SP-AXA · sob 3 PAŹ 09:00-11:00" - na co odpowiadasz, w arkuszu „Nie mogę" (28D). */
  reference: string;
}

export interface RecipientCardInput {
  card: RemoteOrderCard;
  now: number;
  pilotId: string;
  nameOf: (pilotId: string) => string | null;
  codeOf: (pilotId: string) => string | null;
  aircraft: { reg: string; type: string | null } | null;
  airfieldName: (icao: string) => string | null;
  regOf: (aircraftId: string) => string | null;
}

/** `null` = karta nie do narysowania (termin nie do przeczytania albo nie jestem adresatem). */
export function recipientCardVm(input: RecipientCardInput): RecipientCardVm | null {
  const { card } = input;
  const me = card.viewer.recipient;
  const day = orderDay(card.day);
  const startsAt = instant(card.booking.startsAt);
  const endsAt = instant(card.booking.endsAt);
  if (me == null || day == null || startsAt == null || endsAt == null) return null;

  const stale = !me.inPlay;
  const kind: RecipientCardVm['kind'] = stale ? 'stale' : me.assignedSeat != null ? 'booking' : 'question';
  const termChanged = !stale && me.answer == null && card.lastTermChange != null;
  const creator = personLabel(card.order.createdBy, input.pilotId, input.nameOf);

  return {
    kind,
    hero: {
      date: orderDate(day),
      badge: badgeOf(card, me, termChanged),
      hours: orderHours(startsAt, endsAt, day),
      was: termChanged ? wasOf(card, day) : null,
      length: orderLength(startsAt, endsAt),
      countdown: stale ? null : orderCountdown(startsAt, endsAt, input.now),
    },
    banner: stale ? bannerOf(card, me, day, input) : null,
    crew: stale ? null : crewRows(card, me, input),
    answer: stale ? null : answerOf(me, day, input.now, creator),
    clash: stale ? null : clashOf(card, day, input),
    details: detailRows(card, day, input, creator),
    edited: stale ? null : editedOf(card, day, input, termChanged),
    thread: threadOf(me, creator, input.codeOf(card.order.createdBy), day, input, stale),
    primary: stale || me.answer === 'yes' ? null : me.direct && me.seat != null ? 'accept' : 'volunteer',
    decline: !stale && me.answer !== 'no',
    note: stale ? null : noteOf(me),
    reference: orderReference(regOf(card, input), day, startsAt, endsAt),
  };
}

/** Znak maszyny z pamięci floty; kreska, gdy maszyny tam nie ma (inny klub, skasowana). */
function regOf(card: RemoteOrderCard, input: RecipientCardInput): string {
  return input.aircraft?.reg ?? input.regOf(card.booking.aircraftId) ?? NONE;
}

function badgeOf(card: RemoteOrderCard, me: RemoteOrderMe, termChanged: boolean): OrderHeroVm['badge'] {
  if (!me.inPlay) {
    if (card.order.status === 'cancelled') return { text: 'Odwołane', tone: 'red' };
    if (card.order.status === 'expired') return { text: 'Wygasło', tone: 'neutral' };
    return { text: 'Nieaktualne', tone: 'neutral' };
  }
  if (termChanged) return { text: 'Termin zmieniony', tone: 'amber' };
  if (me.answer === 'yes') return { text: 'Zgłoszone', tone: 'dim' };
  if (me.answer === 'no') return { text: 'Nie mogę', tone: 'dim' };
  return { text: 'Czeka na odpowiedź', tone: 'blue' };
}

/** „było 09:00-11:00" - poprzedni termin; inna doba dostaje datę przed godzinami. */
function wasOf(card: RemoteOrderCard, day: ClubDayBounds): string | null {
  const span = termSpan(card.lastTermChange?.from, day);
  if (span == null) return null;
  const from = card.lastTermChange?.from as { startsAt?: string } | undefined;
  const before = instant(from?.startsAt);
  const otherDay = before != null && dayAround(day, before).startsAt !== day.startsAt;
  return otherDay ? `było ${orderDayShort(day, before)} ${span}` : `było ${span}`;
}

/** Baner 28B - DLACZEGO zlecenie przestało czekać na tę osobę. */
function bannerOf(card: RemoteOrderCard, me: RemoteOrderMe, day: ClubDayBounds, input: RecipientCardInput): OrderBannerVm {
  const at = (iso: string | null): string | null => {
    const ms = instant(iso);
    return ms == null ? null : momentLabel(ms, day, input.now, LONG);
  };
  if (card.order.status === 'cancelled') {
    // Tytuł RZECZOWNIKIEM i nazwisko za separatorem - bez czasownika z płcią.
    const by = card.order.closedBy == null ? null : personLabel(card.order.closedBy, input.pilotId, input.nameOf);
    return {
      kind: 'cancelled',
      title: by == null ? 'Odwołanie' : `Odwołanie · ${by}`,
      text: null,
      quote: card.order.closeReason,
      meta: at(card.order.closedAt),
      tone: 'red',
    };
  }
  if (card.order.status === 'expired') {
    // Bez nazwiska - zrobił to zegar, nie człowiek; bez koloru - nic się nie zepsuło.
    return {
      kind: 'expired',
      title: 'Zlecenie wygasło',
      text: 'Do początku terminu nie zebrała się cała załoga - termin się zwolnił.',
      quote: null,
      meta: at(card.order.closedAt),
      tone: 'neutral',
    };
  }
  if (me.staleReason === 'removed') {
    return {
      kind: 'removed',
      title: 'Zlecenie nie jest już do Ciebie',
      text: null,
      quote: me.removeReason,
      meta: at(me.removedAt),
      tone: 'neutral',
    };
  }
  // Fotel obsadzony - i fotel zniesiony, który adresat czyta tak samo (decyzja właściciela
  // 2026-10-06). Kto dostał fotel, adresata nie dotyczy (pkt 18).
  const seat = me.seat ?? me.namedSeat;
  return {
    kind: 'filled',
    title: 'Fotel obsadzony',
    text: seat == null ? 'Załoga na tym locie jest już kompletna.' : `Fotel ${seatGenitive(seat)} na tym locie jest już zajęty.`,
    quote: null,
    meta: null,
    tone: 'neutral',
  };
}

function crewRows(card: RemoteOrderCard, me: RemoteOrderMe, input: RecipientCardInput): CrewRowVm[] {
  const rows: CrewRowVm[] = [];
  const seated: Record<RemoteSeat, string | null> = { pic: card.booking.pilotId, dual: card.booking.dualId };
  for (const seat of ['pic', 'dual'] as RemoteSeat[]) {
    const state = card.order.seats[seat];
    // Fotel „brak" nie dostaje wiersza - wiersz o pustym fotelu byłby zdaniem o niczym.
    if (state === 'none') continue;
    const person = seated[seat];
    if (person != null) {
      rows.push({ seat: seatLabel(seat), value: personLabel(person, input.pilotId, input.nameOf), you: false, sought: false, tag: null });
    } else if (me.seat === seat) {
      rows.push({ seat: seatLabel(seat), value: 'Ty', you: true, sought: false, tag: 'Proponowany fotel' });
    } else {
      rows.push({ seat: seatLabel(seat), value: 'szukany', you: false, sought: true, tag: null });
    }
  }
  if (me.seat == null) {
    // Termin do potwierdzenia: żaden fotel nie jest Twój - mówi to plakietka (28A, ramka 3).
    rows.push({ seat: null, value: 'Ty', you: true, sought: false, tag: 'Termin do potwierdzenia' });
  }
  return rows;
}

function answerOf(me: RemoteOrderMe, day: ClubDayBounds, now: number, creator: string): AnswerVm | null {
  const at = (iso: string | null): string => {
    const ms = instant(iso);
    return ms == null ? NONE : momentLabel(ms, day, now, ANSWER);
  };
  if (me.answer === 'yes') {
    return { value: 'Mogę lecieć', tone: 'ok', sub: `Zgłoszone ${at(me.answeredAt)} · fotel przydziela ${creator}`, quote: null };
  }
  if (me.answer === 'no') {
    return { value: 'Nie mogę', tone: 'no', sub: at(me.answeredAt), quote: me.answerReason };
  }
  if (me.previousAnswer != null) {
    return {
      value: me.previousAnswer === 'yes' ? 'Mogę lecieć' : 'Nie mogę',
      tone: 'old',
      sub: `${at(me.previousAnswerAt)} · poprzedni termin`,
      quote: me.previousAnswerReason,
    };
  }
  return null;
}

/** „SP-AXA 10:00-12:00" - pierwsza moja kolizja; kolejne dochodzą po przecinku. */
function clashOf(card: RemoteOrderCard, day: ClubDayBounds, input: RecipientCardInput): string | null {
  const spans: string[] = [];
  for (const c of card.myConflicts) {
    const startsAt = instant(c.startsAt);
    const endsAt = instant(c.endsAt);
    if (startsAt == null || endsAt == null) continue;
    spans.push(`${input.regOf(c.aircraftId) ?? NONE} ${orderSpan(startsAt, endsAt, day)}`);
  }
  return spans.length === 0 ? null : spans.join(', ');
}

/** Te same pola, co karta rezerwacji (23), plus „Zleca" - z tą osobą rozmawiasz. */
function detailRows(card: RemoteOrderCard, day: ClubDayBounds, input: RecipientCardInput, creator: string): DetailRowVm[] {
  const b = card.booking;
  const rows: DetailRowVm[] = [
    { label: 'Samolot', value: regOf(card, input), sub: input.aircraft?.type ?? null, mono: true },
  ];
  const task = operationLabelOf(b.operation);
  if (task != null) rows.push({ label: 'Zadanie', value: task, sub: null, mono: false });
  const route = routeDetailRow(b.fromIcao, b.toIcao, input.airfieldName);
  if (route != null) rows.push({ ...route, mono: true });
  const plan = planLine(b.plannedAirMin, b.plannedFuelL);
  if (plan != null) rows.push({ label: 'Plan lotu', value: plan, sub: null, mono: false });
  if (b.note != null && b.note.trim() !== '') rows.push({ label: 'Opis', value: b.note.trim(), sub: null, mono: false });

  const created = instant(card.order.createdAt);
  const code = input.codeOf(card.order.createdBy);
  const sent = created == null ? null : `wysłane ${momentLabel(created, day, input.now, LONG)}`;
  rows.push({
    label: 'Zleca',
    value: creator,
    sub: [code, sent].filter((p): p is string => p != null).join(' · ') || null,
    mono: false,
  });
  return rows;
}

/** Linijka zmiany pod kartą „Zlecenie" - bez nazwiska zmieniającego (pkt 31). */
function editedOf(
  card: RemoteOrderCard,
  day: ClubDayBounds,
  input: RecipientCardInput,
  termChanged: boolean,
): ChangePart[] | null {
  if (termChanged && card.lastTermChange != null) {
    const at = instant(card.lastTermChange.at);
    const before = termSpan(card.lastTermChange.from, day);
    const after = termSpan(card.lastTermChange.to, day);
    if (at != null && before != null && after != null) {
      return [{ text: `Termin zmieniony ${momentLabel(at, day, input.now, ANSWER)} · ${before} → ` }, { text: after, strong: true }];
    }
  }
  if (card.lastEdit == null) return null;
  const at = instant(card.lastEdit.at);
  const parts = changesParts(card.lastEdit.changes, { day, regOf: input.regOf }, ['term']);
  if (at == null || parts.length === 0) return null;
  return [{ text: `Edytowane ${momentLabel(at, day, input.now, ANSWER)} · ` }, ...parts];
}

/**
 * Wiersz rozmowy z osobą zlecającą. Bez wiadomości mówi, do kogo napiszesz; z nową -
 * ile i kiedy; w zleceniu nieaktualnym prowadzi do rozmowy do odczytu, o ile ta w ogóle
 * powstała (pusta rozmowa bez pola wiadomości nie ma treści - 28B, ramka 2).
 */
function threadOf(
  me: RemoteOrderMe,
  creator: string,
  code: string | null,
  day: ClubDayBounds,
  input: RecipientCardInput,
  stale: boolean,
): ThreadRowVm | null {
  if (stale) {
    return me.threadId == null ? null : { title: `Rozmowa · ${creator}`, sub: 'do odczytu', unread: false, readOnly: true };
  }
  if (me.threadId == null) return { title: 'Napisz wiadomość', sub: `${creator} · zleca`, unread: false, readOnly: false };
  if (me.unread > 0) {
    const last = instant(me.lastUnreadAt);
    const count = `${me.unread} ${plural(me.unread, 'nowa wiadomość', 'nowe wiadomości', 'nowych wiadomości')}`;
    return {
      title: `Rozmowa · ${creator}`,
      sub: last == null ? count : `${count} · ${momentLabel(last, day, input.now, ANSWER)}`,
      unread: true,
      readOnly: false,
    };
  }
  // Rozmowa jest, nowych wiadomości nie ma - podpis jak nagłówek rozmowy (29): „zleca · MZI".
  return { title: `Rozmowa · ${creator}`, sub: code == null ? 'zleca' : `zleca · ${code}`, unread: false, readOnly: false };
}

/** Zdanie pod pasem - skutek tapnięcia, raz (28, 28A). */
function noteOf(me: RemoteOrderMe): ChangePart[] {
  if (me.answer === 'yes') return [{ text: 'Jeśli coś się zmieni, „NIE MOGĘ" wycofa Twoje zgłoszenie.' }];
  if (me.direct && me.seat != null) {
    return [{ text: 'Po przyjęciu lot jest ' }, { text: 'Twoją rezerwacją', strong: true }, { text: ' - zobaczysz go na Pulpicie i w kalendarzu.' }];
  }
  if (me.seat == null) {
    return [
      { text: '„MOGĘ LECIEĆ" potwierdza ' },
      { text: 'termin', strong: true },
      { text: ' - fotel przydzieli osoba zlecająca, a o decyzji dostaniesz wiadomość.' },
    ];
  }
  return [
    { text: '„MOGĘ LECIEĆ" to ' },
    { text: 'zgłoszenie', strong: true },
    { text: ' - fotel przydziela osoba zlecająca, a o decyzji dostaniesz wiadomość.' },
  ];
}
