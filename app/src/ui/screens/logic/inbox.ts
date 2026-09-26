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
 *
 * ══ WIADOMOŚCI O OBSERWOWANEJ MASZYNIE (3.2.0, `docs/obserwowanie-samolotu.md` §5) ══
 * Pięć rodzajów, tytuły RZECZOWNIKIEM ze znakiem maszyny („Uruchomienie · SP-AXA"),
 * tapnięcie otwiera kartę maszyny (27). Wiadomość o zdarzeniu z rejestru niesie CZAS
 * Z REJESTRU w UTC, nie chwilę dotarcia paczki (§2.3): wiersz mówi „08:12 UTC", a gdy
 * zapis dotarł później niż kwadrans po zdarzeniu, dokłada „zapis dotarł 09:40 UTC"
 * w tonie podpisu. Terminy (za godzinę, odwołany, nie odebrano) - czasem klubu, jak
 * w kalendarzu. Ton ikony: błękit = rzecz się dzieje, zieleń = wróciła z odczytami,
 * bursztyn = coś przepadło.
 */

import { duration, litres, motoHours, plural, relativeAge, timeUtc } from '@ninerdeck/format';

import type { RemoteCalendarDay, RemoteNotification } from '../../../application';

import { dayShort } from './calendarHeading';
import { clubHhmm, type ClubDayBounds } from './clubClock';
import { operationLabelOf } from './operations';

/**
 * Ton ikony wiersza - kolory z makiety: prośba błękitem, zgoda zielenią, odmowa
 * czerwienią; `news` = błękit dla rzeczy, która się DZIEJE z maszyną (25C),
 * `info` = neutralny dla rodzaju nieznanego temu wydaniu.
 */
export type InboxTone = 'ask' | 'ok' | 'no' | 'warn' | 'info' | 'news';

/** Wyróżnione pierwsze słowa wiersza powodu: „Poza planem" bursztynem, „Paliwo 128 L" zielenią. */
export interface InboxLead {
  text: string;
  tone: 'amber' | 'green';
}

export interface InboxRowVm {
  id: string;
  tone: InboxTone;
  title: string;
  /** „SP-AXA · sob 26 WRZ 09:00-12:00" - znak i termin czasem klubu; `null` = wiadomość bez terminu. */
  sub: string | null;
  /** Powód odmowy albo zdanie, co robić dalej; `null` = wiadomość mówi wszystko tytułem. */
  reason: string | null;
  /** Wyróżniony początek `reason` (wiadomości o maszynie); `null` = powód jednym tonem. */
  lead: InboxLead | null;
  /** „zapis dotarł 09:40 UTC" - zwłoka ponad kwadrans między zdarzeniem a paczką; `null` = bez zwłoki. */
  late: string | null;
  /** „12 min temu", „3 h temu", „2 dni temu". */
  when: string;
  /** Nieprzeczytana - zielona krawędź; gaśnie z otwarciem listy. */
  isNew: boolean;
  /** Sprawa czeka na MOJĄ decyzję - plakietka „Do decyzji"; stoi do decyzji. */
  todo: boolean;
  bookingId: string | null;
  aircraftId: string | null;
  /** Dokąd prowadzi tapnięcie: ekran decyzji (26), karta rezerwacji (23), karta maszyny (27) albo nigdzie. */
  opens: 'decision' | 'booking' | 'aircraft' | null;
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
  /** Format licznika maszyny z cache floty - do odczytu przy „zdana"; `null` = poza cache'em. */
  mhFormatOf?: (aircraftId: string) => 'hhmm' | 'decimal' | null;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const instant = (value: unknown): number | null => {
  const at = Date.parse(str(value) ?? '');
  return Number.isFinite(at) ? at : null;
};

/** Zwłoka między zdarzeniem a dotarciem paczki, od której wiersz o niej mówi (§2.3). */
const LATE_MS = 15 * 60_000;

const DAY_MS = 86_400_000;

/** Powód zdania bez lotu (09C) - te same cztery słowa, co na ekranie zdania. */
const NO_FLIGHT_LABEL: Readonly<Record<string, string>> = {
  weather: 'pogoda',
  malfunction: 'usterka',
  cancelled: 'odwołane',
  other: 'inny powód',
};

/**
 * Doba klubu przesunięta o pełne dni do chwili `at` - nowy termin po przesunięciu
 * potrafi leżeć w innej dobie niż stary, a wiadomość niesie dobę STAREGO.
 */
function dayAround(day: ClubDayBounds | null, at: number): ClubDayBounds | null {
  if (day == null) return null;
  const shift = Math.floor((at - day.startsAt) / DAY_MS) * DAY_MS;
  return shift === 0 ? day : { date: day.date, startsAt: day.startsAt + shift, endsAt: day.endsAt + shift };
}

/** „zapis dotarł 09:40 UTC", gdy paczka dotarła później niż kwadrans po zdarzeniu. */
export function lateNote(eventAt: number | null, createdAt: number): string | null {
  if (eventAt == null || createdAt - eventAt <= LATE_MS) return null;
  return `zapis dotarł ${timeUtc(createdAt)} UTC`;
}

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
    const createdAt = Date.parse(n.createdAt);
    const base = {
      id: n.id,
      sub,
      lead: null,
      late: null,
      when: agoLabel(createdAt, input.now),
      isNew: n.readAt == null,
      bookingId,
      aircraftId,
    };
    const opensBooking = bookingId == null ? null : ('booking' as const);
    const opensAircraft = aircraftId == null ? null : ('aircraft' as const);
    const regTitle = reg ?? 'samolot';
    const who = (id: string | null): string | null => (id == null ? null : input.nameOf(id));
    // Wiadomość o maszynie ma znak w TYTULE, więc podpis niesie sam termin i nazwisko.
    const termWho = [term, who(str(n.payload.pilotId))].filter((x): x is string => x != null).join(' · ');

    switch (n.kind) {
      case 'aircraft_flight_soon':
        return {
          ...base,
          sub: termWho === '' ? null : termWho,
          tone: 'news',
          title: `Zbliża się lot · ${regTitle}`,
          reason: null,
          todo: false,
          opens: opensAircraft,
        };
      case 'aircraft_flight_cancelled': {
        const startsAt = instant(n.payload.startsAt);
        const moved = n.payload.movedTo as { startsAt?: unknown; endsAt?: unknown } | null | undefined;
        const movedStart = moved == null ? null : instant(moved.startsAt);
        const movedEnd = moved == null ? null : instant(moved.endsAt);
        const before =
          startsAt != null && Number.isFinite(createdAt) && startsAt > createdAt
            ? ` ${relativeAge(startsAt - createdAt)} przed startem`
            : '';
        const newTerm =
          movedStart == null || movedEnd == null
            ? null
            : termLabel(dayAround(dayBounds(n.day), movedStart), movedStart, movedEnd);
        return {
          ...base,
          sub: termWho === '' ? null : termWho,
          tone: 'warn',
          title: `Odwołany lot · ${regTitle}`,
          reason:
            newTerm != null
              ? `Przesunięty${before} - nowy termin ${newTerm}, po przypomnieniu.`
              : `Odwołany${before} - po przypomnieniu.`,
          todo: false,
          opens: opensAircraft,
        };
      }
      case 'aircraft_engine_started': {
        const at = instant(n.payload.at);
        const task = operationLabelOf(str(n.payload.operation));
        const planned = n.payload.planned === true;
        return {
          ...base,
          sub: [at == null ? null : `${timeUtc(at)} UTC`, who(str(n.payload.pilotId)), task?.toLowerCase() ?? null]
            .filter((x): x is string => x != null)
            .join(' · '),
          tone: 'news',
          title: `Uruchomienie · ${regTitle}`,
          lead: planned ? { text: 'Zgodnie z planem', tone: 'green' } : { text: 'Poza planem', tone: 'amber' },
          reason: planned ? ' - na tę godzinę była rezerwacja.' : ' - na tę godzinę nie było rezerwacji.',
          late: lateNote(at, createdAt),
          todo: false,
          opens: opensAircraft,
        };
      }
      case 'aircraft_released': {
        const at = instant(n.payload.at);
        const byAdmin = n.payload.closedBy === 'admin';
        const flights = num(n.payload.flights) ?? 0;
        const blockMs = num(n.payload.blockMs);
        const fuel = num(n.payload.fuelEndL);
        const mh = num(n.payload.mhEnd);
        const noFlight = str(n.payload.noFlightReason);
        const adminReason = str(n.payload.reason);
        const format = aircraftId == null ? null : (input.mhFormatOf?.(aircraftId) ?? null);
        const sub = byAdmin
          ? [at == null ? null : `${timeUtc(at)} UTC`, 'zakończył administrator']
          : [
              at == null ? null : `${timeUtc(at)} UTC`,
              who(str(n.payload.pilotId)),
              blockMs == null ? null : `blok ${duration(blockMs)}`,
              `${flights} ${plural(flights, 'lot', 'loty', 'lotów')}`,
            ];
        // Odczyty końcowe są tym, po co mechanik czeka - zielenią, jak stan w normie.
        // Oleju NIE MA: zdanie samolotu oleju nie mierzy (issue #60).
        const readings =
          fuel == null && mh == null
            ? null
            : { lead: fuel == null ? null : { text: `Paliwo ${litres(fuel)}`, tone: 'green' as const }, rest: mh == null ? '' : ` · licznik ${motoHours(mh, format)}` };
        return {
          ...base,
          sub: sub.filter((x): x is string => x != null).join(' · '),
          tone: byAdmin ? 'warn' : 'ok',
          title: `Zdana · ${regTitle}`,
          lead: readings?.lead ?? null,
          reason: byAdmin
            ? adminReason == null
              ? 'Bez odczytów - operację zakończył administrator.'
              : `Bez odczytów - „${adminReason}".`
            : noFlight != null
              ? `Zdana bez lotu - ${NO_FLIGHT_LABEL[noFlight] ?? noFlight}.${readings == null ? '' : ` ${readings.lead?.text ?? ''}${readings.rest}`.replace(/^ · /, ' ')}`
              : readings == null
                ? null
                : readings.lead == null
                  ? readings.rest.replace(/^ · /, '')
                  : readings.rest,
          late: lateNote(at, createdAt),
          todo: false,
          opens: opensAircraft,
        };
      }
      case 'aircraft_not_taken':
        return {
          ...base,
          sub: termWho === '' ? null : termWho,
          tone: 'warn',
          title: `Nie odebrano · ${regTitle}`,
          reason: 'Maszyna stała godzinę bez przejęcia - termin wrócił do puli.',
          todo: false,
          opens: opensAircraft,
        };
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
