/**
 * Ninerdeck - ROZMOWA W ZLECENIU (4.0.0, epik Z-C #247; makiety 29, 29A, 29B;
 * `docs/zlecenia.md` §7, pkt 3, 19, 20, 43).
 *
 * Prywatny wątek autora zlecenia z jednym adresatem (pkt 3) - do NEGOCJACJI („mogę
 * dopiero o 10"), a nie do uzgodnień: termin zmienia edycja zlecenia, którą widzą
 * wszyscy adresaci (§7.2). Czyta go też każdy z „Cudzymi rezerwacjami", ale nie pisze
 * (pkt 19, 20).
 *
 * ══ TRZY WIDZE ══
 *  - adresat: tytułem jest osoba zlecająca („zleca · MZI"), własne wiadomości po prawej;
 *  - autor: tytułem jest adresat („adresat · AKW"), własne wiadomości po prawej;
 *  - czytelnik (29B): tytułem jest adresat, a podtytuł nazywa autora („rozmowa · Marta
 *    Zięba") - nagłówek musi nazwać OBIE strony. Autor stoi po PRAWEJ, jak u autora,
 *    żaden dymek nie ma odcienia „własnych", a nazwisko staje nad pierwszym dymkiem serii.
 * Nazwiska w mianowniku, bez „z" - „Rozmowa z Martą Ziębą" wymagałoby odmiany.
 *
 * ══ „ODCZYTANE" (pkt 17, 19) ══
 * U uczestnika stoi WYŁĄCZNIE pod ostatnią własną wiadomością - pytanie brzmi „czy
 * przeczytał to, co napisałem na końcu". U czytelnika - pod ostatnią wiadomością
 * i mówi o drugim uczestniku; odczyt koordynatora nie zapala go nigdy.
 *
 * Czasy klubu liczą się od granic doby terminu (`card.day`), jak cała reszta zleceń.
 */

import { weekdayShortUtc } from '@ninerdeck/format';

import type { RemoteOrderCard, RemoteThreadMessage, RemoteThreadPage } from '../../../application';

import { clubHhmm, clubInstant, type ClubDayBounds } from './clubClock';
import type { ChangePart } from './orderChanges';
import {
  ANSWER,
  dayAround,
  dayIndex,
  instant,
  momentLabel,
  NONE,
  orderDay,
  orderDayShort,
  orderSpan,
  routeCodes,
  seatLower,
} from './orderFormat';
import { audienceOf } from './orderLeaderCard';
import { operationLabelOf } from './operations';

export type ThreadRole = 'author' | 'recipient' | 'reader';

export type ThreadItemVm =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      side: 'left' | 'right';
      /** Dymek w odcieniu „własnych" - wyłącznie u uczestnika, przy jego wiadomości. */
      own: boolean;
      /** Nazwisko nad pierwszym dymkiem serii - wyłącznie u czytelnika (29B). */
      author: { name: string; code: string | null } | null;
      body: string;
      /** „19:02". */
      time: string;
      /** „Odczytane 07:41". */
      read: string | null;
    };

export type ThreadFooterVm =
  /** Pole wiadomości ze zdaniem o tym, kto jeszcze czyta (pkt 19). */
  | { kind: 'composer'; visibility: string }
  /** Zdanie zamiast pola - dlaczego tu się nie pisze (29B, rozmowa po zamknięciu). */
  | { kind: 'readonly'; parts: ChangePart[] };

export interface ThreadVm {
  role: ThreadRole;
  header: { title: string; sub: string | null };
  /** Pasek zlecenia nad wiadomościami - rozmowa jest zawsze o jednym zleceniu. */
  strip: { top: string; sub: string | null };
  /** Od najstarszej. */
  items: ThreadItemVm[];
  footer: ThreadFooterVm;
}

export interface ThreadInput {
  page: Pick<RemoteThreadPage, 'role' | 'closed' | 'participants' | 'messages'>;
  card: RemoteOrderCard;
  recipientId: string;
  viewerId: string;
  now: number;
  nameOf: (pilotId: string) => string | null;
  codeOf: (pilotId: string) => string | null;
  regOf: (aircraftId: string) => string | null;
}

/** `null` = termin zlecenia nie do przeczytania - bez doby klubu nie ma godzin. */
export function threadVm(input: ThreadInput): ThreadVm | null {
  const { card, page } = input;
  const day = orderDay(card.day);
  const startsAt = instant(card.booking.startsAt);
  const endsAt = instant(card.booking.endsAt);
  if (day == null || startsAt == null || endsAt == null) return null;

  const author = card.order.createdBy;
  const role: ThreadRole =
    input.viewerId === input.recipientId ? 'recipient' : page.role === 'reader' ? 'reader' : 'author';
  const name = (id: string): string => input.nameOf(id) ?? NONE;

  const header =
    role === 'recipient'
      ? { title: name(author), sub: tagged('zleca', input.codeOf(author)) }
      : role === 'author'
        ? { title: name(input.recipientId), sub: tagged('adresat', input.codeOf(input.recipientId)) }
        : { title: name(input.recipientId), sub: `rozmowa · ${name(author)}` };

  const reg = input.regOf(card.booking.aircraftId) ?? NONE;
  const dow = weekdayShortUtc(clubInstant(startsAt, day)).toLowerCase();
  const strip = {
    top: `${reg} · ${dow} ${orderDayShort(day, startsAt)} · ${orderSpan(startsAt, endsAt, day)}`,
    sub: stripSub(card, role, input.recipientId),
  };

  return {
    role,
    header,
    strip,
    items: itemsOf(input, role, author, day),
    footer: footerOf(page, role, name(author)),
  };
}

const tagged = (label: string, code: string | null): string => (code == null ? label : `${label} · ${code}`);

/**
 * „Przelot EPKK → EPRJ · Twój fotel: dowódca" u adresata; u autora i czytelnika - na jaki
 * fotel i przez co zlecenie trafiło do tej osoby („drugi pilot · Piloci An-2", 29B).
 */
function stripSub(card: RemoteOrderCard, role: ThreadRole, recipientId: string): string | null {
  const b = card.booking;
  const what = [operationLabelOf(b.operation), routeCodes(b.fromIcao, b.toIcao)].filter((p): p is string => p != null).join(' ');
  const parts: string[] = what === '' ? [] : [what];

  if (role === 'recipient') {
    const me = card.viewer.recipient;
    if (me?.assignedSeat != null) parts.push(`Twój fotel: ${seatLower(me.assignedSeat)}`);
    else if (me?.inPlay === true && me.seat != null) parts.push(`proponowany fotel: ${seatLower(me.seat)}`);
    else if (me?.inPlay === true) parts.push('termin do potwierdzenia');
  } else {
    const r = (card.recipients ?? []).find((x) => x.pilotId === recipientId);
    const audience = audienceOf(card.order.audienceLabel);
    if (r != null) {
      const seat = r.assignedSeat ?? r.seat;
      if (card.order.addressing === 'shared') parts.push(['wspólna lista', audience.shared].filter((p) => p != null).join(' · '));
      else if (seat == null) parts.push('termin do potwierdzenia');
      else {
        const named = (r.direct && r.seat === seat) || r.namedSeat === seat;
        parts.push([seatLower(seat), named ? 'imiennie' : audience[seat]].filter((p) => p != null).join(' · '));
      }
    }
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

function itemsOf(input: ThreadInput, role: ThreadRole, author: string, day: ClubDayBounds): ThreadItemVm[] {
  const sorted = [...input.page.messages]
    .map((m) => ({ m, at: instant(m.createdAt) }))
    .filter((x): x is { m: RemoteThreadMessage; at: number } => x.at != null)
    .sort((a, b) => a.at - b.at || (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0));

  const readOf = (pilotId: string | undefined): number | null =>
    pilotId == null ? null : instant(input.page.participants.find((p) => p.pilotId === pilotId)?.lastReadAt ?? null);

  // Pod którą wiadomością stoi „Odczytane" i czyj to odczyt.
  let markAt = -1;
  let markReader: string | undefined;
  if (role === 'reader') {
    markAt = sorted.length - 1;
    const last = sorted[markAt];
    markReader = last == null ? undefined : last.m.authorId === author ? input.recipientId : author;
  } else {
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (sorted[i]!.m.authorId === input.viewerId) {
        markAt = i;
        break;
      }
    }
    markReader = role === 'recipient' ? author : input.recipientId;
  }

  const today = dayIndex(day, input.now);
  const items: ThreadItemVm[] = [];
  let lastDay: number | null = null;
  let lastAuthor: string | null = null;
  sorted.forEach(({ m, at }, i) => {
    const index = dayIndex(day, at);
    if (index !== lastDay) {
      items.push({ kind: 'day', key: `day-${index}`, label: dayLabel(index - today, day, at) });
      lastDay = index;
      lastAuthor = null;
    }
    const mine = m.authorId === input.viewerId;
    const right = role === 'reader' ? m.authorId === author : mine;
    const seriesStart = m.authorId !== lastAuthor;
    lastAuthor = m.authorId;

    const readAt = i === markAt ? readOf(markReader) : null;
    // Odczyt tej samej doby - sama godzina, bo dzień mówi już separator nad wiadomością
    // (29A: „Odczytane 19:11" pod „Wczoraj"); odczyt innej doby dostaje ją w napisie.
    const readLabel =
      readAt == null || readAt < at
        ? null
        : dayIndex(day, readAt) === index
          ? clubHhmm(readAt, dayAround(day, readAt))
          : momentLabel(readAt, day, input.now, ANSWER);
    items.push({
      kind: 'message',
      key: m.id,
      side: right ? 'right' : 'left',
      own: role !== 'reader' && mine,
      author: role === 'reader' && seriesStart ? { name: input.nameOf(m.authorId) ?? NONE, code: input.codeOf(m.authorId) } : null,
      body: m.body,
      time: clubHhmm(at, dayAround(day, at)),
      read: readLabel == null ? null : `Odczytane ${readLabel}`,
    });
  });
  return items;
}

/** „Dziś", „Wczoraj", dalej data - separator dnia jest zawsze czasem klubu. */
function dayLabel(offset: number, day: ClubDayBounds, at: number): string {
  if (offset === 0) return 'Dziś';
  if (offset === -1) return 'Wczoraj';
  return orderDayShort(day, at);
}

function footerOf(page: ThreadInput['page'], role: ThreadRole, authorName: string): ThreadFooterVm {
  if (role === 'reader' || page.role === 'reader') {
    // Pisze wyłącznie autor (pkt 20) - zdanie mówi, kto prowadzi i co wolno patrzącemu.
    return { kind: 'readonly', parts: [{ text: 'Rozmowę prowadzi ' }, { text: authorName, strong: true }, { text: ' - możesz ją czytać.' }] };
  }
  if (page.closed != null) {
    // Zlecenie zamknięte albo adresat wypadł z gry (pkt 53) - wszystko zostaje do czytania.
    return { kind: 'readonly', parts: [{ text: 'Zlecenie jest nieaktualne - rozmowę możesz czytać.' }] };
  }
  return { kind: 'composer', visibility: 'Rozmowę widzą też koordynatorzy lotów klubu.' };
}
