/**
 * Ninerdeck - panel: WIERSZ SKRZYNKI POWIADOMIEŃ (4.0.0, K7 `docs/kanal-klubu.md`;
 * makieta `design/panel/powiadomienia.html` PW2, brzmienie z telefonu 25/25C/25D).
 *
 * Ta sama osoba czyta skrzynkę w panelu i w telefonie, więc wiersz mówi TO SAMO - te
 * same rodzaje, te same tytuły rzeczownikiem („Odmowa zgody · Anna Kowal", nie
 * „Anna Kowal odmówiła": czasownika nie da się odmienić bez znajomości płci). Różnice
 * idą wyłącznie za stylem lekkim panelu: termin pełnym dniem tygodnia ze strzałką,
 * godziny i znaki krojem maszynowym, nazwiska pogrubione, stare wartości przekreślone.
 *
 * ══ WIADOMOŚĆ TO NIE SPRAWA ══
 * „Nowe" (zielona krawędź) mówi o WIADOMOŚCI i gaśnie z otwarciem listy - krawędź zostaje
 * do końca tej wizyty (`freshIds`). „Do decyzji" mówi o SPRAWIE i stoi, dopóki decyzja
 * nie zapadnie - liczy się z kolejki decyzji, nie z przeczytania.
 *
 * ══ WIERSZ PROWADZI DO RZECZY ══
 * Prośba o zgodę na MOIM kroku → kolejka decyzji; rezerwacja → jej szuflada
 * w kalendarzu; samolot → karta w module Samoloty (gdy sesja go ma). Zlecenia nie
 * prowadzą jeszcze nigdzie - moduł zleceń panelu powstaje w Z-D i dopisze swoje adresy.
 *
 * Czysty moduł: wiadomości + słownik klubu + zegar → model wiersza. Zdania składa tutaj,
 * żeby dało się je sprawdzić testem, a nie oglądaniem panelu.
 */

import type { MhFormat } from '@ninerdeck/domain';
import { duration, litres, motoHours, plural, timeUtc } from '@ninerdeck/format';

import type { InboxItemDto } from '../../api/dto';
import { clubDayIndex, godzina, operationLabel } from '../calendar/bookingLabels';
import { orderPath, threadPath, type OrderView } from '../orders/orderPaths';

/** Ton ikony - zieleń: odpowiedź, na którą czekasz; błękit: pytanie i rozmowa; reszta jak w makiecie. */
export type InboxTone = 'ok' | 'ask' | 'warn' | 'no' | 'plain';

export type InboxIcon =
  | 'person-check'
  | 'person-x'
  | 'chat'
  | 'clock'
  | 'check'
  | 'pencil'
  | 'plane'
  | 'warning'
  | 'cross'
  | 'info';

/** Kawałek podpisu albo treści - krój maszynowy (godziny, znaki), pogrubienie (nazwiska), przekreślenie (stara wartość). */
export interface Segment {
  text: string;
  style?: 'mono' | 'b' | 's';
}

export interface InboxRowVm {
  id: string;
  tone: InboxTone;
  icon: InboxIcon;
  title: string;
  /** Podpis - termin, znak, kto; pusty = wiadomość bez podpisu. */
  sub: Segment[];
  /** Treść - kto i co, powód, odczyty; pusta = tytuł mówi wszystko. */
  text: Segment[];
  /** Plakietka sprawy („Do decyzji") albo liczby nowych wiadomości w rozmowie. */
  pill: { text: string; tone: 'green' | 'blue' } | null;
  when: string;
  /** Nowa w tej wizycie - zielona krawędź. */
  isNew: boolean;
  /** Dokąd prowadzi wiersz; `null` = nigdzie (wiersz nie jest linkiem). */
  href: string | null;
}

export interface InboxRowsInput {
  items: readonly InboxItemDto[];
  /** Strefa klubu - terminy i „dziś 20:12" liczą się jego dobą. */
  timezone: string;
  now: number;
  /** Imię i nazwisko ze słownika klubu; `null` = spoza słownika. */
  nameOf: (pilotId: string) => string | null;
  /** Znak maszyny ze słownika klubu; `null` = spoza słownika. */
  regOf: (aircraftId: string) => string | null;
  /** Format licznika maszyny - odczyt w „Zdana" tak, jak na tarczy. */
  mhFormatOf: (aircraftId: string) => MhFormat | null;
  /** Rezerwacje czekające na MOJĄ decyzję - z kolejki decyzji. */
  todoIds: ReadonlySet<string>;
  /** Wiadomości nowe w chwili otwarcia skrzynki - krawędź zostaje do końca wizyty. */
  freshIds: ReadonlySet<string>;
  /** Moduły, do których sesja ma wstęp - wiersz nie prowadzi tam, gdzie czekałaby odmowa. */
  canOpen: { fleet: boolean; decisions: boolean };
}

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const instant = (value: unknown): number | null => {
  const at = Date.parse(str(value) ?? '');
  return Number.isFinite(at) ? at : null;
};

const fmt = (timezone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('pl-PL', { ...options, timeZone: timezone || undefined });

/** „3 PAŹ" - dzień i skrót miesiąca wersalikami, jak na kafelkach telefonu. */
function dayMonthShort(at: number, tz: string): string {
  const parts = fmt(tz, { day: 'numeric', month: 'short' }).formatToParts(new Date(at));
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = (parts.find((p) => p.type === 'month')?.value ?? '').replace('.', '');
  return `${day} ${month.toLocaleUpperCase('pl-PL')}`;
}

/** „sobota 3 PAŹ · 09:00 → 13:00" - termin czasem klubu. */
function termSegments(startsAt: number | null, endsAt: number | null, tz: string): Segment[] {
  if (startsAt == null || endsAt == null) return [];
  const weekday = fmt(tz, { weekday: 'long' }).format(new Date(startsAt));
  return [
    { text: `${weekday} ${dayMonthShort(startsAt, tz)} · ` },
    { text: `${godzina(new Date(startsAt), tz)} → ${godzina(new Date(endsAt), tz)}`, style: 'mono' },
  ];
}

/** „09:00-11:00" - zakres godzin jednego terminu, do „było → jest". */
const hours = (startsAt: number, endsAt: number, tz: string): string =>
  `${godzina(new Date(startsAt), tz)}-${godzina(new Date(endsAt), tz)}`;

/** „przed chwilą", „39 min temu", „dziś 20:12", „wczoraj 19:48", „28 WRZ 14:02". */
export function whenLabel(at: number, now: number, tz: string): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return 'przed chwilą';
  if (minutes < 60) return `${minutes} min temu`;
  const time = godzina(new Date(at), tz);
  const days = clubDayIndex(now, tz) - clubDayIndex(at, tz);
  if (days === 0) return `dziś ${time}`;
  if (days === 1) return `wczoraj ${time}`;
  return `${dayMonthShort(at, tz)} ${time}`;
}

/** „dziś 17:05 UTC" - chwila zdarzenia z rejestru; rejestr mówi w UTC, więc doba też jest UTC. */
function utcMoment(at: number, now: number): string {
  const days = Math.floor(now / 86_400_000) - Math.floor(at / 86_400_000);
  const day = days === 0 ? 'dziś' : days === 1 ? 'wczoraj' : dayMonthShort(at, 'UTC');
  return `${day} ${timeUtc(at)} UTC`;
}

const SEAT: Readonly<Record<string, string>> = { pic: 'dowódca', dual: 'drugi pilot' };
const SEAT_GENITIVE: Readonly<Record<string, string>> = { pic: 'dowódcy', dual: 'drugiego pilota' };

/** Powód zdania bez lotu (09C) - te same cztery słowa, co na ekranie zdania w telefonie. */
const NO_FLIGHT: Readonly<Record<string, string>> = {
  weather: 'pogoda',
  malfunction: 'usterka',
  cancelled: 'odwołane',
  other: 'inny powód',
};

const quoted = (text: string): string => `„${text}"`;
const join = (parts: readonly (Segment[] | null)[]): Segment[] => {
  const present = parts.filter((p): p is Segment[] => p != null && p.length > 0);
  return present.flatMap((p, i) => (i === 0 ? p : [{ text: ' · ' }, ...p]));
};
const plain = (text: string | null): Segment[] | null => (text == null ? null : [{ text }]);
const bold = (text: string | null): Segment[] | null => (text == null ? null : [{ text, style: 'b' }]);
const mono = (text: string | null): Segment[] | null => (text == null ? null : [{ text, style: 'mono' }]);

/** Zmiany edycji zlecenia - „Plan lotu ~~2:00~~ → **3:00**", kolejne po średnikach. */
function editSegments(
  changes: Record<string, { from?: unknown; to?: unknown }>,
  regOf: (id: string) => string | null,
): Segment[] {
  const out: Segment[][] = [];
  const pair = (label: string, from: string, to: string): Segment[] => [
    { text: `${label} ` },
    { text: from, style: 's' },
    { text: ' → ' },
    { text: to, style: 'b' },
  ];
  for (const [field, change] of Object.entries(changes)) {
    if (field === 'plannedAirMin') {
      const from = num(change.from);
      const to = num(change.to);
      out.push(pair('Plan lotu', from == null ? '-' : duration(from * 60_000), to == null ? '-' : duration(to * 60_000)));
    } else if (field === 'plannedFuelL') {
      out.push(pair('Paliwo do zabrania', litres(num(change.from)), litres(num(change.to))));
    } else if (field === 'operation') {
      out.push(pair('Zadanie', operationLabel(str(change.from)), operationLabel(str(change.to))));
    } else if (field === 'aircraft') {
      const from = str(change.from);
      const to = str(change.to);
      out.push(pair('Samolot', from == null ? '-' : (regOf(from) ?? '-'), to == null ? '-' : (regOf(to) ?? '-')));
    } else if (field === 'route') {
      const route = (value: unknown): string => {
        const r = (value ?? {}) as { fromIcao?: unknown; toIcao?: unknown };
        return `${str(r.fromIcao) ?? '-'} → ${str(r.toIcao) ?? '-'}`;
      };
      out.push(pair('Trasa', route(change.from), route(change.to)));
    } else if (field === 'note') {
      out.push([{ text: 'Notatka zmieniona' }]);
    } else if (field === 'seats') {
      out.push([{ text: 'Zmieniona obsada foteli' }]);
    }
  }
  return out.flatMap((segments, i) => (i === 0 ? segments : [{ text: '; ' }, ...segments]));
}

export function inboxRows(input: InboxRowsInput): InboxRowVm[] {
  const { timezone: tz, now } = input;
  return input.items.map((n) => {
    const p = n.payload;
    const bookingId = str(p.bookingId);
    const aircraftId = str(p.aircraftId);
    const reg = aircraftId == null ? null : (input.regOf(aircraftId) ?? null);
    const regTitle = reg ?? 'samolot';
    const name = (key: string): string | null => {
      const id = str(p[key]);
      return id == null ? null : input.nameOf(id);
    };
    const term = termSegments(instant(p.startsAt), instant(p.endsAt), tz);
    const seat = str(p.seat) ?? str(p.assignedSeat);
    const createdAt = Date.parse(n.createdAt);

    const base = {
      id: n.id,
      when: Number.isFinite(createdAt) ? whenLabel(createdAt, now, tz) : '',
      isNew: n.readAt == null || input.freshIds.has(n.id),
      pill: null,
      text: [] as Segment[],
    };
    const toBooking = bookingId == null ? null : `/kalendarz/${bookingId}`;
    // Zlecenie otwiera się nad tą połową listy, z której perspektywy mówi wiadomość: adresat
    // („Do mnie") albo prowadzący („Zlecone") - koordynator bywa jednym i drugim naraz.
    const orderId = str(p.orderId);
    const toOrder = (view: OrderView): string | null => (orderId == null ? null : orderPath(orderId, view));
    const toAircraft = aircraftId == null || !input.canOpen.fleet ? null : `/samoloty/${aircraftId}`;
    // Podpis wiadomości o terminie: znak i termin (przy rezerwacji) albo sam termin
    // (przy zleceniu i maszynie - znak stoi w tytule).
    const regTerm = join([mono(reg), term]);
    const termWho = (who: string): Segment[] => join([term, plain(name(who))]);

    switch (n.kind) {
      // ── rezerwacje i ścieżka zgód (3.1.0) ──
      case 'approval_requested': {
        const who = name('pilotId');
        const todo = bookingId != null && input.todoIds.has(bookingId);
        return {
          ...base,
          tone: 'ask',
          icon: 'clock',
          title: who == null ? 'Prośba o zgodę na lot' : `${who} prosi o zgodę na lot`,
          sub: regTerm,
          pill: todo ? { text: 'Do decyzji', tone: 'green' } : null,
          href: todo && input.canOpen.decisions ? '/kalendarz/decyzje' : toBooking,
        };
      }
      case 'approval_withdrawn': {
        const who = name('pilotId');
        return {
          ...base,
          tone: 'plain',
          icon: 'cross',
          title: who == null ? 'Prośba o zgodę wycofana' : `Prośba wycofana · ${who}`,
          sub: regTerm,
          text: [{ text: 'Rezerwację odwołano - nie ma już o czym decydować.' }],
          href: toBooking,
        };
      }
      case 'booking_approved':
        return { ...base, tone: 'ok', icon: 'check', title: 'Twoja rezerwacja jest zatwierdzona', sub: regTerm, href: toBooking };
      case 'booking_rejected': {
        const who = name('decidedBy');
        return {
          ...base,
          tone: 'no',
          icon: 'cross',
          title: who == null ? 'Odmowa zgody' : `Odmowa zgody · ${who}`,
          sub: regTerm,
          text: plain(str(p.reason)) ?? [],
          href: toBooking,
        };
      }
      case 'booking_cancelled': {
        // Odwołanie rezerwacji - do osób w fotelach poza odwołującym (§12.9). Ten sam
        // słownik, co skrzynka telefonu: rzeczownik z odwołującym, powód jako treść,
        // a bez powodu skutek.
        const who = name('cancelledBy');
        return {
          ...base,
          tone: 'no',
          icon: 'cross',
          title: who == null ? 'Rezerwacja odwołana' : `Rezerwacja odwołana · ${who}`,
          sub: regTerm,
          text: plain(str(p.reason)) ?? [{ text: 'Termin się zwolnił.' }],
          href: toBooking,
        };
      }
      case 'booking_expired':
        return {
          ...base,
          tone: 'warn',
          icon: 'clock',
          title: 'Termin minął, zanim ktokolwiek zdecydował',
          sub: regTerm,
          text: [{ text: 'Termin się zwolnił - jeśli nadal chcesz lecieć, złóż rezerwację jeszcze raz.' }],
          href: toBooking,
        };

      // ── obserwowana maszyna (3.2.0) ──
      case 'aircraft_flight_soon':
        return { ...base, tone: 'ask', icon: 'plane', title: `Zbliża się lot · ${regTitle}`, sub: termWho('pilotId'), href: toAircraft };
      case 'aircraft_flight_cancelled': {
        const moved = (p.movedTo ?? null) as { startsAt?: unknown; endsAt?: unknown } | null;
        const movedStart = moved == null ? null : instant(moved.startsAt);
        const movedEnd = moved == null ? null : instant(moved.endsAt);
        return {
          ...base,
          tone: 'warn',
          icon: 'warning',
          title: `Odwołany lot · ${regTitle}`,
          sub: termWho('pilotId'),
          text:
            movedStart != null && movedEnd != null
              ? [{ text: 'Przesunięty po przypomnieniu - nowy termin ' }, ...termSegments(movedStart, movedEnd, tz), { text: '.' }]
              : [{ text: 'Odwołany po przypomnieniu.' }],
          href: toAircraft,
        };
      }
      case 'aircraft_engine_started': {
        const at = instant(p.at);
        const task = str(p.operation);
        const planned = p.planned === true;
        return {
          ...base,
          tone: 'ask',
          icon: 'plane',
          title: `Uruchomienie · ${regTitle}`,
          sub: join([plain(at == null ? null : utcMoment(at, now)), plain(name('pilotId')), plain(task == null ? null : operationLabel(task).toLocaleLowerCase('pl-PL'))]),
          text: planned
            ? [{ text: 'Zgodnie z planem', style: 'b' }, { text: ' - na tę godzinę była rezerwacja.' }]
            : [{ text: 'Poza planem', style: 'b' }, { text: ' - na tę godzinę nie było rezerwacji.' }],
          href: toAircraft,
        };
      }
      case 'aircraft_released': {
        const at = instant(p.at);
        const byAdmin = p.closedBy === 'admin';
        const flights = num(p.flights) ?? 0;
        const blockMs = num(p.blockMs);
        const fuel = num(p.fuelEndL);
        const mh = num(p.mhEnd);
        const noFlight = str(p.noFlightReason);
        const format = aircraftId == null ? null : input.mhFormatOf(aircraftId);
        const readings = join([
          plain(fuel == null ? null : `Paliwo ${litres(fuel)}`),
          plain(mh == null ? null : `licznik ${motoHours(mh, format)}`),
        ]);
        const adminReason = str(p.reason);
        return {
          ...base,
          tone: byAdmin ? 'warn' : 'ok',
          icon: 'check',
          title: `Zdana · ${regTitle}`,
          sub: byAdmin
            ? join([plain(at == null ? null : utcMoment(at, now)), plain('zakończył administrator')])
            : join([
                plain(at == null ? null : utcMoment(at, now)),
                plain(name('pilotId')),
                blockMs == null ? null : [{ text: 'blok ' }, { text: duration(blockMs), style: 'mono' }],
                plain(`${flights} ${plural(flights, 'lot', 'loty', 'lotów')}`),
              ]),
          text: byAdmin
            ? [{ text: adminReason == null ? 'Bez odczytów - operację zakończył administrator.' : `Bez odczytów - ${quoted(adminReason)}.` }]
            : noFlight != null
              ? join([plain(`Zdana bez lotu - ${NO_FLIGHT[noFlight] ?? noFlight}`), readings])
              : readings,
          href: toAircraft,
        };
      }
      case 'aircraft_not_taken':
        return {
          ...base,
          tone: 'warn',
          icon: 'warning',
          title: `Nie odebrano · ${regTitle}`,
          sub: termWho('pilotId'),
          text: [{ text: 'Przez godzinę nikt nie rozpoczął lotu - termin się zwolnił.' }],
          href: toAircraft,
        };

      // ── zlecenia na lot (4.0.0) ──
      case 'order_offered':
        return {
          ...base,
          tone: 'ask',
          icon: 'plane',
          title: `Zlecenie lotu · ${regTitle}`,
          sub: term,
          text: join([bold(name('createdBy')), p.reminder === true ? plain('czeka na Twoją odpowiedź') : null]),
          href: toOrder('do-mnie'),
        };
      case 'order_changed': {
        const termChange = p.term === true;
        const changes = (p.changes ?? {}) as Record<string, { from?: unknown; to?: unknown }>;
        const was = (changes.term?.from ?? null) as { startsAt?: unknown; endsAt?: unknown } | null;
        const is = (changes.term?.to ?? null) as { startsAt?: unknown; endsAt?: unknown } | null;
        const wasStart = instant(was?.startsAt);
        const wasEnd = instant(was?.endsAt);
        const isStart = instant(is?.startsAt);
        const isEnd = instant(is?.endsAt);
        return {
          ...base,
          tone: 'plain',
          icon: 'pencil',
          title: termChange ? `Zlecenie zmienione · ${regTitle}` : `Zlecenie edytowane · ${regTitle}`,
          sub: term,
          text: termChange
            ? wasStart != null && wasEnd != null && isStart != null && isEnd != null
              ? [
                  { text: 'Termin ' },
                  { text: hours(wasStart, wasEnd, tz), style: 's' },
                  { text: ' → ' },
                  { text: hours(isStart, isEnd, tz), style: 'b' },
                  { text: '. Odpowiedz na nowy termin.' },
                ]
              : [{ text: 'Zmienił się termin - odpowiedz na nowy.' }]
            : editSegments(changes, input.regOf),
          href: toOrder('do-mnie'),
        };
      }
      case 'order_answered': {
        const yes = p.answer === 'yes';
        const assigned = str(p.assignedSeat);
        const reason = str(p.reason);
        return {
          ...base,
          tone: yes ? 'ok' : 'plain',
          icon: yes ? 'person-check' : 'person-x',
          title: `Odpowiedź na zlecenie · ${regTitle}`,
          sub: join([term, plain(seat == null ? null : (SEAT[seat] ?? null))]),
          text: join([
            bold(name('pilotId')),
            plain(yes ? (assigned != null ? 'przyjęte - fotel obsadzony' : 'może lecieć') : reason == null ? 'nie może' : `nie może - ${quoted(reason)}`),
          ]),
          href: toOrder('zlecone'),
        };
      }
      case 'order_assigned':
        return {
          ...base,
          tone: 'ok',
          icon: 'person-check',
          title: `Lot przydzielony · ${regTitle}`,
          sub: join([term, plain(seat == null ? null : (SEAT[seat] ?? null))]),
          text: [{ text: 'Lot jest Twoją rezerwacją.' }],
          href: toBooking,
        };
      case 'order_filled':
        return {
          ...base,
          tone: 'plain',
          icon: 'info',
          title: `Zlecenie nieaktualne · ${regTitle}`,
          sub: term,
          text: [{ text: p.reason === 'seat_dropped' ? 'Fotel nie jest już potrzebny.' : 'Fotel jest już obsadzony.' }],
          href: toOrder('do-mnie'),
        };
      case 'order_removed': {
        const reason = str(p.reason);
        return {
          ...base,
          tone: 'no',
          icon: 'cross',
          title: `Zlecenie nieaktualne · ${regTitle}`,
          sub: term,
          text: [{ text: reason == null ? 'Zlecenie nie jest już do Ciebie.' : `Zlecenie nie jest już do Ciebie - ${quoted(reason)}.` }],
          href: toOrder('do-mnie'),
        };
      }
      case 'order_withdrawn': {
        const reason = str(p.reason);
        return {
          ...base,
          tone: 'warn',
          icon: 'person-x',
          title: `Rezygnacja z lotu · ${regTitle}`,
          sub: join([term, plain(seat == null ? null : (SEAT[seat] ?? null))]),
          text: join([bold(name('pilotId')), plain(reason == null ? 'fotel znów jest do obsadzenia' : quoted(reason))]),
          href: toOrder('zlecone'),
        };
      }
      case 'order_unassigned': {
        const reason = str(p.reason);
        return {
          ...base,
          tone: 'no',
          icon: 'person-x',
          title: `Przydział cofnięty · ${regTitle}`,
          sub: join([term, plain(seat == null ? null : (SEAT[seat] ?? null))]),
          text: plain(reason == null ? 'Lot nie jest już Twoją rezerwacją.' : quoted(reason)) ?? [],
          href: toOrder('do-mnie'),
        };
      }
      case 'order_cancelled': {
        const reason = str(p.reason);
        return {
          ...base,
          tone: 'no',
          icon: 'cross',
          title: `Zlecenie odwołane · ${regTitle}`,
          sub: term,
          text: join([bold(name('cancelledBy')), plain(reason == null ? null : quoted(reason))]),
          href: toOrder('do-mnie'),
        };
      }
      case 'order_unfilled': {
        const open = Array.isArray(p.openSeats) ? p.openSeats.filter((s): s is string => typeof s === 'string') : [];
        const missing = open.map((s) => SEAT_GENITIVE[s] ?? s).join(' i ');
        return {
          ...base,
          tone: 'warn',
          icon: 'warning',
          title: `Zlecenie bez kompletu załogi · ${regTitle}`,
          sub: term,
          text: [
            {
              text: `${missing === '' ? 'Załoga nie jest kompletna' : `Brakuje ${missing}`}. Jeśli do początku terminu nikt się nie znajdzie, zlecenie wygaśnie, a termin się zwolni.`,
            },
          ],
          href: toOrder('zlecone'),
        };
      }
      case 'order_expired':
        return {
          ...base,
          tone: 'warn',
          icon: 'clock',
          title: `Zlecenie wygasło · ${regTitle}`,
          sub: term,
          text: [{ text: 'Do początku terminu nie zebrała się cała załoga - termin się zwolnił.' }],
          href: toOrder('zlecone'),
        };
      case 'order_message': {
        // JEDEN wiersz na rozmowę z licznikiem (§7.3); treścią jest OSTATNIA wiadomość, bo
        // na nią się odpowiada. Licznik świeci, póki wiersz jest nowy - jak w telefonie.
        const unread = num(p.unread) ?? 0;
        const preview = str(p.preview);
        const recipientId = str(p.recipientId);
        // Pisał adresat - czyta autor nad „Zlecone"; pisał autor - czyta adresat nad „Do mnie".
        const view: OrderView = str(p.authorId) === recipientId ? 'zlecone' : 'do-mnie';
        return {
          ...base,
          tone: 'ask',
          icon: 'chat',
          title: `Wiadomość w zleceniu · ${regTitle}`,
          sub: term,
          text: join([bold(name('authorId')), plain(preview == null ? null : quoted(preview))]),
          pill:
            base.isNew && unread > 0
              ? { text: `${unread} ${plural(unread, 'nowa wiadomość', 'nowe wiadomości', 'nowych wiadomości')}`, tone: 'blue' }
              : null,
          href: orderId == null || recipientId == null ? null : threadPath(orderId, recipientId, view),
        };
      }

      // Rodzaj nieznany temu wydaniu nie znika - dostaje tytuł ogólny i prowadzi do
      // rezerwacji, jeśli ją niesie (reguła skrzynki z 3.1.0).
      default:
        return { ...base, tone: 'plain', icon: 'info', title: 'Wiadomość z klubu', sub: regTerm, href: toBooking };
    }
  });
}

/** Wiadomości do przeczytania przy otwarciu skrzynki. */
export const unreadIdsOf = (items: readonly InboxItemDto[]): string[] =>
  items.filter((n) => n.readAt == null).map((n) => n.id);

/**
 * Nieprzeczytane, których ta wizyta jeszcze nie wysłała - każda wiadomość przeczytuje się
 * RAZ. Efekt szuflady przebiega w trybie deweloperskim dwa razy (StrictMode), a odczyt
 * w locie potrafi przynieść stan sprzed przeczytania: bez pamięci wysłanych to samo
 * „przeczytaj" szło do serwera po trzy razy.
 */
export const notSentYet = (unread: readonly string[], sent: ReadonlySet<string>): string[] =>
  unread.filter((id) => !sent.has(id));

/**
 * Czy szuflada ma już z czego złożyć wiersze. Słownik i kolejka decyzji są częścią ZDANIA
 * (nazwisko, znak, „Do decyzji") - wiersz narysowany bez nich mówiłby najpierw ogólnie,
 * a po chwili przeskakiwał na pełne brzmienie. Kolejka liczy się wyłącznie u osoby, która
 * rozstrzyga: zapytanie wyłączone czeka w React Query bez końca. Odczyt, który się nie
 * udał, plamek nie trzyma - wiersz mówi wtedy ogólnie, jak przy osobie spoza słownika.
 */
export function inboxPending(state: { inbox: boolean; directory: boolean; queue: boolean; canDecide: boolean }): boolean {
  return state.inbox || state.directory || (state.canDecide && state.queue);
}
