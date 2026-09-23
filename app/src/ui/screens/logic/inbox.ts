/**
 * Ninerdeck - SKRZYNKA POWIADOMIEŃ (`design/25`, 3.1.0, epik R-I; `docs/rezerwacje.md` §12).
 *
 * ══ WIADOMOŚĆ TO NIE SPRAWA ══
 * „Nowe" mówi o WIADOMOŚCI („nie widziałeś jeszcze tej nowiny") i gaśnie z chwilą
 * otwarcia listy; „Do decyzji" mówi o SPRAWIE i stoi, dopóki nie zapadnie decyzja -
 * choćby pilot czytał listę dziesięć razy. Stąd dwa różne znaki (krawędź przy brzegu
 * wiersza i plakietka przy treści) i dwa różne źródła: `readAt` z wiadomości oraz
 * kolejka spraw z `GET /me/approvals/queue`. Gdyby jedno gasiło drugie, wystarczyłoby
 * zerknąć na skrzynkę, żeby prośba o zgodę przestała się dopominać.
 *
 * ══ LISTA JEST CHRONOLOGICZNA, SPRAWY NIE SĄ PRZYPINANE ══
 * Przypięcie kazałoby czytać listę dwa razy: raz w kolejności czasu i raz wagi.
 *
 * ══ POWÓD ODMOWY JEST CZĘŚCIĄ WIADOMOŚCI ══
 * Bez niego „odmowa" zostawia pilota z pytaniem, na które musiałby zadzwonić. Tą samą
 * zasadą wiadomość o wygaśnięciu mówi, co robić dalej.
 *
 * ══ ROZSTRZYGNIĘCIE IDZIE RZECZOWNIKIEM ══
 * „Odmowa zgody · Anna Kowal", nie „Anna Kowal odmówiła zgody": czasownika nie da się
 * odmienić bez znajomości płci. „Prosi o zgodę" zostaje - trzecia osoba czasu
 * teraźniejszego brzmi tak samo dla każdego.
 *
 * ══ RODZAJ NIEZNANY TEMU WYDANIU NIE ZNIKA ══
 * Serwer nowszy niż aplikacja dokłada rodzaje wiadomości; taka wiadomość dostaje
 * tytuł ogólny i wchodzi w kartę rezerwacji, jeśli ją niesie.
 */

import { plural } from '@ninerdeck/format';

import type { RemoteCalendarDay, RemoteNotification } from '../../../application';

import { dayShort } from './calendarHeading';
import { clubHhmm, type ClubDayBounds } from './clubClock';

/** Ton ikony wiersza - kolory z makiety: prośba błękitem, zgoda zielenią, odmowa czerwienią. */
export type InboxTone = 'ask' | 'ok' | 'no' | 'warn' | 'info';

export interface InboxRowVm {
  id: string;
  tone: InboxTone;
  title: string;
  /** „SP-AXA · sob 26 WRZ 09:00-12:00" - znak i termin czasem klubu; `null` = wiadomość bez terminu. */
  sub: string | null;
  /** Powód odmowy albo zdanie, co robić dalej; `null` = wiadomość mówi wszystko tytułem. */
  reason: string | null;
  /** „12 min temu", „3 h temu", „2 dni temu". */
  when: string;
  /** Nieprzeczytana - zielona krawędź; gaśnie z otwarciem listy. */
  isNew: boolean;
  /** Sprawa czeka na MOJĄ decyzję - plakietka „Do decyzji"; stoi do decyzji. */
  todo: boolean;
  bookingId: string | null;
  /** Dokąd prowadzi tapnięcie: ekran decyzji (26), karta rezerwacji (23) albo nigdzie. */
  opens: 'decision' | 'booking' | null;
}

export interface InboxInput {
  items: readonly RemoteNotification[];
  /** Rezerwacje czekające na MOJĄ decyzję - identyfikatory z kolejki spraw. */
  todoIds: ReadonlySet<string>;
  now: number;
  /** Znak maszyny z cache floty; `null` = poza cache'em. */
  regOf: (aircraftId: string) => string | null;
  /** Imię i nazwisko z cache członków; `null` = poza cache'em. */
  nameOf: (pilotId: string) => string | null;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/** „przed chwilą", „12 min temu", „3 h temu", „2 dni temu" - wiek wiadomości. */
export function agoLabel(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return 'przed chwilą';
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h temu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'wczoraj';
  return `${days} ${plural(days, 'dzień', 'dni', 'dni')} temu`;
}

/** Doba z drutu → liczby; `null`, gdy stemple nie dają się przeczytać. */
export function dayBounds(day: RemoteCalendarDay | null): ClubDayBounds | null {
  if (day == null) return null;
  const startsAt = Date.parse(day.startsAt);
  const endsAt = Date.parse(day.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || !(endsAt > startsAt)) return null;
  return { date: day.date, startsAt, endsAt };
}

/**
 * „sob 26 WRZ 09:00-12:00" - termin CZASEM KLUBU, liczony odejmowaniem od granic doby
 * (§6.1). Bez doby terminu nie piszemy wcale: godzina w UTC obok osi kalendarza
 * w czasie klubu byłaby dwiema godzinami jednego lotu.
 */
export function termLabel(day: ClubDayBounds | null, startsAt: number, endsAt: number): string | null {
  if (day == null || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;
  const dzien = dayShort(day);
  return `${dzien.charAt(0).toLowerCase()}${dzien.slice(1)} ${clubHhmm(startsAt, day)}-${clubHhmm(endsAt, day)}`;
}

export function inboxRows(input: InboxInput): InboxRowVm[] {
  return input.items.map((n) => {
    const bookingId = str(n.payload.bookingId);
    const aircraftId = str(n.payload.aircraftId);
    const reg = aircraftId == null ? null : (input.regOf(aircraftId) ?? aircraftId);
    const term = termLabel(
      dayBounds(n.day),
      Date.parse(str(n.payload.startsAt) ?? ''),
      Date.parse(str(n.payload.endsAt) ?? ''),
    );
    const sub = reg == null ? term : term == null ? reg : `${reg} · ${term}`;
    const base = {
      id: n.id,
      sub,
      when: agoLabel(Date.parse(n.createdAt), input.now),
      isNew: n.readAt == null,
      bookingId,
    };
    const opensBooking = bookingId == null ? null : ('booking' as const);

    switch (n.kind) {
      case 'approval_requested': {
        const who = str(n.payload.pilotId);
        const name = who == null ? null : input.nameOf(who);
        const todo = bookingId != null && input.todoIds.has(bookingId);
        return {
          ...base,
          tone: 'ask',
          title: name == null ? 'Prośba o zgodę na lot' : `${name} prosi o zgodę na lot`,
          reason: null,
          todo,
          opens: todo ? 'decision' : opensBooking,
        };
      }
      case 'booking_approved':
        return {
          ...base,
          tone: 'ok',
          title: 'Twoja rezerwacja jest zatwierdzona',
          reason: null,
          todo: false,
          opens: opensBooking,
        };
      case 'booking_rejected': {
        const who = str(n.payload.decidedBy);
        const name = who == null ? null : input.nameOf(who);
        return {
          ...base,
          tone: 'no',
          title: name == null ? 'Odmowa zgody' : `Odmowa zgody · ${name}`,
          reason: str(n.payload.reason),
          todo: false,
          opens: opensBooking,
        };
      }
      case 'booking_expired':
        return {
          ...base,
          tone: 'warn',
          title: 'Termin minął, zanim ktokolwiek zdecydował',
          reason: 'Maszyna wróciła do puli - jeśli nadal chcesz lecieć, złóż rezerwację jeszcze raz.',
          todo: false,
          opens: opensBooking,
        };
      default:
        return {
          ...base,
          tone: 'info',
          title: 'Wiadomość z klubu',
          reason: null,
          todo: false,
          opens: opensBooking,
        };
    }
  });
}

/** Identyfikatory wiadomości do przeczytania przy otwarciu listy. */
export const unreadIds = (items: readonly RemoteNotification[]): string[] =>
  items.filter((n) => n.readAt == null).map((n) => n.id);
