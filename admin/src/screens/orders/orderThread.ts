/**
 * Ninerdeck - panel: ROZMOWA W ZLECENIU (`#/zlecenia/:id/rozmowa/:adresat`; makieta
 * `zlecenia-watek`, ZL4, ZL4a, ZL4b; 4.0.0, epik Z-D #248; `docs/zlecenia.md` §7, pkt 3,
 * 17, 19, 20, 29).
 *
 * Prywatny wątek autora zlecenia z jednym adresatem - do NEGOCJACJI („mogę dopiero
 * o 10"); termin zmienia edycja zlecenia, którą widzą wszyscy adresaci (§7.2). Czyta go
 * też każdy z „Cudzymi rezerwacjami", ale nie pisze (pkt 19, 20). Te same słowa i ta sama
 * reguła, co ekran 29 w telefonie (`orderThread.ts` w aplikacji).
 *
 * ══ TYTUŁEM JEST ROZMÓWCA ══
 *  - adresat: osoba zlecająca („zleca · MZI"), własne wiadomości po prawej;
 *  - autor: adresat („adresat · AKO"), własne po prawej;
 *  - czytelnik (ZL4a): adresat, a autora nazywa pasek zlecenia („zleca Marta Zięba") -
 *    nagłówek i pasek razem nazywają OBIE strony. Autor stoi po prawej, jak u autora,
 *    a nazwisko staje nad pierwszym dymkiem serii, bo samo położenie nie mówi, kto pisze.
 * Nazwiska w mianowniku, bez „z" - „Rozmowa z Martą Ziębą" wymagałoby odmiany.
 *
 * ══ „ODCZYTANE" (pkt 17, 19) ══
 * U uczestnika WYŁĄCZNIE pod ostatnią własną wiadomością - pytanie brzmi „czy przeczytano
 * to, co napisałem na końcu". U czytelnika pod ostatnią wiadomością i mówi o drugim
 * uczestniku; odczyt koordynatora nie zapala go nigdy.
 *
 * Czas klubu: separator dnia („Wczoraj", „Dziś"), godzina przy dymku i chwila odczytu.
 * Moduł czysty - test obok.
 */

import type { OrderCardDto, ThreadPageDto } from '../../api/dto';
import { clubDayIndex, godzina, operationLabel, type PersonLookup } from '../calendar/bookingLabels';
import { NONE } from '../common/values';
import { audienceParts, dayMoment, dayMonthLabel, routeLabel, SEAT_LOWER, termHoursLabel, termShortDay } from './orderLabels';
import { orderPath, type OrderPeriod } from './orderPaths';

export type ThreadRole = 'author' | 'recipient' | 'reader';

export type ThreadItemVm =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      /** `out` - po prawej: własna u uczestnika, autora u czytelnika. */
      side: 'in' | 'out';
      /** Nazwisko nad pierwszym dymkiem serii - wyłącznie u czytelnika (ZL4a). */
      who: string | null;
      body: string;
      /** „19:02" - dzień mówi separator nad dymkiem. */
      time: string;
      /** „Odczytane 07:41". */
      read: string | null;
    };

export type ThreadFooterVm =
  /** Pole wiadomości ze zdaniem o tym, kto jeszcze czyta (pkt 19). */
  | { kind: 'composer'; note: string; to: string }
  /** Zdanie zamiast pola: kto prowadzi rozmowę (`reader`) albo dlaczego jest do odczytu (`closed`). */
  | { kind: 'readonly'; text: string; tone: 'reader' | 'closed' };

export interface ThreadVm {
  role: ThreadRole;
  title: string;
  sub: { label: string; code: string | null };
  /** Nazwa okna dla czytnika ekranu - „Rozmowa · Marta Zięba". */
  label: string;
  /** Pasek zlecenia nad wiadomościami - rozmowa jest zawsze o jednym zleceniu. */
  strip: { top: string; sub: string | null; href: string };
  /** Od najstarszej. */
  items: ThreadItemVm[];
  footer: ThreadFooterVm;
  /**
   * Kiedy zapisać odczyt: uczestnik z wiadomościami w rozmowie - identyfikator najnowszej
   * wiadomości DRUGIEJ strony (pusty napis, gdy pisał tylko patrzący). Zmiana tej wartości
   * znaczy „przyszło coś do przeczytania". `null` = odczytu nie ma czego zapisywać.
   */
  readMark: string | null;
}

export interface ThreadInput {
  page: Omit<ThreadPageDto, 'next'>;
  card: OrderCardDto;
  recipientId: string;
  viewerId: string | null;
  now: number;
  /** Okres listy pod szufladą - pasek zlecenia wraca nad tę samą listę. */
  period: OrderPeriod;
  person: PersonLookup;
  aircraft: (aircraftId: string) => { reg: string; type: string } | null;
}

const parsed = (iso: string | null | undefined): number | null => {
  if (iso == null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
};

/** `null` = termin zlecenia nie do przeczytania. */
export function threadVm(input: ThreadInput): ThreadVm | null {
  const { card, page } = input;
  const startsAt = parsed(card.booking.startsAt);
  const endsAt = parsed(card.booking.endsAt);
  if (startsAt == null || endsAt == null) return null;
  const tz = card.timezone;

  const author = card.order.createdBy;
  const role: ThreadRole =
    input.viewerId === input.recipientId ? 'recipient' : page.role === 'reader' ? 'reader' : 'author';
  const name = (id: string): string => input.person(id)?.name ?? NONE;
  const code = (id: string): string | null => input.person(id)?.code ?? null;
  const other = role === 'recipient' ? author : input.recipientId;

  const me = card.viewer.recipient;
  const seated = role === 'recipient' && me != null && me.inPlay && me.assignedSeat != null;
  const reg = input.aircraft(card.booking.aircraftId)?.reg ?? NONE;

  return {
    role,
    title: name(other),
    sub: { label: role === 'recipient' ? 'zleca' : 'adresat', code: code(other) },
    label: `${role === 'reader' ? 'Rozmowa w zleceniu' : 'Rozmowa'} · ${name(other)}`,
    strip: {
      top: `${reg} · ${termShortDay(startsAt, tz)} · ${termHoursLabel(startsAt, endsAt, tz)}`,
      sub: stripSub(card, role, input.recipientId, name(author)),
      // Lot już mój nie ma karty zlecenia - jest rezerwacją (§14.3).
      href: seated
        ? `/kalendarz/${encodeURIComponent(card.booking.id)}`
        : orderPath(card.order.id, role === 'recipient' ? 'do-mnie' : 'zlecone', input.period),
    },
    items: itemsOf(input, role, author),
    footer: footerOf(card, page, role, name(author), name(other)),
    readMark: readMarkOf(page, role, input.viewerId),
  };
}

/**
 * „Przelot EPKK → EPRJ · Twój fotel: dowódca" u adresata; u autora - na jaki fotel i przez
 * co zlecenie trafiło do tej osoby („drugi pilot · Piloci An-2"); u czytelnika - kto zleca.
 */
function stripSub(card: OrderCardDto, role: ThreadRole, recipientId: string, authorName: string): string | null {
  const b = card.booking;
  const route = routeLabel(b.fromIcao, b.toIcao);
  const task = [b.operation == null ? null : operationLabel(b.operation), route].filter((p): p is string => p != null).join(' ');
  const parts: string[] = task === '' ? [] : [task];

  if (role === 'reader') parts.push(`zleca ${authorName}`);
  else if (role === 'recipient') {
    const me = card.viewer.recipient;
    if (me?.inPlay === true && me.assignedSeat != null) parts.push(`Twój fotel: ${SEAT_LOWER[me.assignedSeat]}`);
    else if (me?.inPlay === true && me.seat != null) parts.push(`proponowany fotel: ${SEAT_LOWER[me.seat]}`);
    else if (me?.inPlay === true) parts.push('termin do potwierdzenia');
  } else {
    const r = (card.recipients ?? []).find((x) => x.pilotId === recipientId);
    const audience = audienceParts(card.order.audienceLabel);
    if (r != null) {
      const seat = r.assignedSeat ?? r.seat;
      if (card.order.addressing === 'shared') parts.push(['wspólna lista', audience.shared].filter((p) => p != null).join(' · '));
      else if (seat == null) parts.push('termin do potwierdzenia');
      else {
        const named = (r.direct && r.seat === seat) || r.namedSeat === seat;
        parts.push([SEAT_LOWER[seat], named ? 'imiennie' : audience[seat]].filter((p) => p != null).join(' · '));
      }
    }
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

function itemsOf(input: ThreadInput, role: ThreadRole, author: string): ThreadItemVm[] {
  const tz = input.card.timezone;
  const sorted = input.page.messages
    .map((m) => ({ m, at: parsed(m.createdAt) }))
    .filter((x): x is { m: (typeof input.page.messages)[number]; at: number } => x.at != null)
    .sort((a, b) => a.at - b.at || (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0));

  const readOf = (pilotId: string | undefined): number | null =>
    pilotId == null ? null : parsed(input.page.participants.find((p) => p.pilotId === pilotId)?.lastReadAt);

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

  const today = clubDayIndex(input.now, tz);
  const items: ThreadItemVm[] = [];
  let lastDay: number | null = null;
  let lastAuthor: string | null = null;
  sorted.forEach(({ m, at }, i) => {
    const index = clubDayIndex(at, tz);
    if (index !== lastDay) {
      items.push({ kind: 'day', key: `day-${index}`, label: dayLabel(index - today, at, tz) });
      lastDay = index;
      lastAuthor = null;
    }
    const seriesStart = m.authorId !== lastAuthor;
    lastAuthor = m.authorId;
    const right = role === 'reader' ? m.authorId === author : m.authorId === input.viewerId;

    const readAt = i === markAt ? readOf(markReader) : null;
    // Odczyt tej samej doby - sama godzina, bo dzień mówi separator nad dymkiem;
    // odczyt innej doby dostaje ją w napisie („Odczytane dziś 07:41").
    const readLabel =
      readAt == null || readAt < at
        ? null
        : clubDayIndex(readAt, tz) === index
          ? godzina(new Date(readAt), tz)
          : dayMoment(readAt, input.now, tz);
    items.push({
      kind: 'message',
      key: m.id,
      side: right ? 'out' : 'in',
      who: role === 'reader' && seriesStart ? (input.person(m.authorId)?.name ?? NONE) : null,
      body: m.body,
      time: godzina(new Date(at), tz),
      read: readLabel == null ? null : `Odczytane ${readLabel}`,
    });
  });
  return items;
}

/** „Dziś", „Wczoraj", dalej data - separator dnia jest zawsze czasem klubu. */
function dayLabel(offset: number, at: number, tz: string): string {
  if (offset === 0) return 'Dziś';
  if (offset === -1) return 'Wczoraj';
  return dayMonthLabel(at, tz);
}

function footerOf(card: OrderCardDto, page: ThreadInput['page'], role: ThreadRole, authorName: string, otherName: string): ThreadFooterVm {
  // Pisze wyłącznie autor (pkt 20) - w miejscu pola jedno zdanie, kto prowadzi. Nie
  // wyszarzone pole: pisanie nie jest tu zablokowane, tylko należy do kogoś innego.
  if (role === 'reader') return { kind: 'readonly', tone: 'reader', text: `Rozmowę prowadzi ${authorName}.` };
  if (page.closed != null) {
    // Zlecenie zamknięte albo adresat wypadł z gry (28B) - bez nazwiska tego, kto
    // zamknął, i bez niczego o innych adresatach (pkt 18).
    if (role === 'recipient') {
      return { kind: 'readonly', tone: 'closed', text: 'Zlecenie nie jest już dla Ciebie aktualne - rozmowa zostaje do odczytu.' };
    }
    return {
      kind: 'readonly',
      tone: 'closed',
      text:
        card.order.status === 'open'
          ? 'Zlecenie nie jest już aktualne dla tej osoby - rozmowa zostaje do odczytu.'
          : 'Zlecenie jest zamknięte - rozmowa zostaje do odczytu.',
    };
  }
  return { kind: 'composer', note: 'Rozmowę widzą też koordynatorzy lotów klubu.', to: otherName };
}

function readMarkOf(page: ThreadInput['page'], role: ThreadRole, viewerId: string | null): string | null {
  if (role === 'reader' || page.messages.length === 0) return null;
  let newest: { id: string; at: number } | null = null;
  for (const m of page.messages) {
    const at = parsed(m.createdAt);
    if (m.authorId === viewerId || at == null) continue;
    if (newest == null || at > newest.at || (at === newest.at && m.id > newest.id)) newest = { id: m.id, at };
  }
  return newest?.id ?? '';
}

/** Ile znaków mieści wiadomość - ta sama granica, co na serwerze (CHECK w bazie). */
export const MESSAGE_MAX = 2000;
