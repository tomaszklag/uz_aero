/**
 * Ninerdeck - panel: SZUFLADA ZLECENIA OCZAMI PROWADZĄCEGO (makieta `zlecenia-szczegoly`,
 * ZL3 i ZL3c; 4.0.0, epik Z-D #248; `docs/zlecenia.md` §4.3, §5, §8, §13.1).
 *
 * Prowadzi autor i każdy z „Cudzymi rezerwacjami" (pkt 20). Szuflada odpowiada na trzy
 * pytania, w tej kolejności - te same, co karta 32 w telefonie (`orderLeaderCard.ts`
 * w aplikacji, słowo w słowo tam, gdzie panel mówi tym samym zdaniem):
 *  - KTO JUŻ LECI - karta „Załoga" z fotelami obsadzonymi (przyjęte albo przydział,
 *    z godziną z historii) i szukanymi („przydziel z listy niżej"). Stoi, gdy w którymś
 *    fotelu ktoś siedzi; przy obu fotelach szukanych powtarzałaby tylko karty pod spodem;
 *  - KOGO ZAPYTANO I CO ODPOWIEDZIAŁ - karta na każdy szukany wolny fotel (imiennie albo
 *    grupą) albo jedna karta wspólnej listy. Kolejność: najpierw ci, którzy MOGĄ
 *    (w kolejności zgłoszenia), potem odczytane, nieodczytane, na końcu odmowy;
 *  - CO SIĘ DZIAŁO - historia zmian z nazwiskami (`orderHistory.ts`).
 * Adresaci fotela już obsadzonego schodzą do zwiniętego „Pozostali adresaci · N ·
 * zlecenie nieaktualne" - to stan zlecenia z ICH strony, nie ocena ich odpowiedzi.
 *
 * ══ OSOBA PRZY OBU FOTELACH (pkt 38) ══
 * Adresat z terminem do potwierdzenia stoi w karcie KAŻDEGO wolnego fotela, na który może
 * trafić, z własnym „Wybierz" i dopiskiem „także na …"; wybór na jeden fotel zdejmuje go
 * z drugiego (serwer obsadza fotel, następny odczyt karty ułoży wiersze od nowa).
 *
 * ══ ZAMKNIĘTE ZLECENIE JEST ZAPISEM ══
 * Odwołane albo wygasłe: karty zostają z odpowiedziami z chwili zamknięcia, ale bez
 * „Wybierz", bez liczników i bez bursztynu - to podpowiedzi do działania, a działać nie
 * ma już czym.
 *
 * Moduł czysty - test obok.
 */

import { plural } from '@ninerdeck/format';

import type { OrderCardDto, OrderLeaderRecipientDto, SeatDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';
import { hoursLabel, operationLabel, type PersonLookup } from '../calendar/bookingLabels';
import { NONE } from '../common/values';
import { orderHistoryRows, type HistoryRowVm } from './orderHistory';
import {
  audienceParts,
  hoursSpan,
  momentLabel,
  planLabel,
  quoted,
  routeLabel,
  SEAT_ACCUSATIVE,
  SEAT_LABEL,
  seekingLabel,
  sentLabel,
  termHoursLabel,
  termRelative,
  termTitleDay,
} from './orderLabels';

export interface StatusPart {
  text: string;
  tone?: 'ok' | 'no' | 'unread';
}

export interface LeaderRowVm {
  pilotId: string;
  name: string;
  code: string | null;
  status: StatusPart[];
  /** Bursztyn pod statusem: kolizja z inną rezerwacją, zmiana nieodczytana po edycji. */
  warn: string[];
  /** „także na drugiego pilota" - termin do potwierdzenia (pkt 38). */
  also: string | null;
  /** Powód odmowy jako cytat. */
  reason: string | null;
  /** Przydział spośród zgłoszonych: „Wybierz" albo „Na dowódcę" / „Na drugiego pilota". */
  picks: { seat: SeatDto; label: string }[];
  /** Zwinięcie „Pozostali adresaci" - o stopień ciszej, bez akcji. */
  muted: boolean;
}

export interface SeatBlockVm {
  key: SeatDto | 'shared';
  /** „Dowódca · imiennie", „Drugi pilot · Piloci An-2", „Wspólna lista · Piloci An-2". */
  title: string;
  /** „2 mogą lecieć"; `null` = zero albo zlecenie zamknięte. */
  count: string | null;
  rows: LeaderRowVm[];
}

export interface CrewSeatVm {
  seat: SeatDto;
  label: string;
  /** Osoba w fotelu; `null` = szukany (plakietka „Szukany"). */
  pilotId: string | null;
  /**
   * Fotel, o który ekran pyta (`.rcp.open`): pusty w zleceniu żywym. W zamkniętym
   * ekran o nic już nie pyta, więc błękitna krawędź gaśnie razem z instrukcją.
   */
  asking: boolean;
  name: string | null;
  code: string | null;
  status: StatusPart[];
  /** Przydział da się cofnąć - osoba przydzielona do szukanego fotela, zlecenie żywe. */
  unassignable: boolean;
}

export interface LeaderCardVm {
  title: string;
  pill: { text: string; tone: PillTone };
  sub: string;
  /** Odwołane albo wygasłe - szuflada jest zapisem. */
  closed: boolean;
  crew: CrewSeatVm[] | null;
  blocks: SeatBlockVm[];
  others: { label: string; openLabel: string; rows: LeaderRowVm[] } | null;
  details: { label: string; value: string; sub: string | null }[];
  history: HistoryRowVm[];
  /** „Wyślij ponownie" - zlecenie szuka; notatka mówi, ile osób dostanie przypomnienie. */
  resend: { note: string | null } | null;
  /** Odwołanie - zlecenie żywe. */
  cancellable: boolean;
}

export interface LeaderCardInput {
  card: OrderCardDto;
  now: number;
  viewerId: string | null;
  person: PersonLookup;
  aircraft: (aircraftId: string) => { reg: string; type: string } | null;
}

const SEATS: readonly SeatDto[] = ['pic', 'dual'];
const other = (seat: SeatDto): SeatDto => (seat === 'pic' ? 'dual' : 'pic');

interface Ctx {
  input: LeaderCardInput;
  tz: string;
  live: boolean;
  open: readonly SeatDto[];
}

export function leaderCard(input: LeaderCardInput): LeaderCardVm | null {
  const { card } = input;
  const startsAt = Date.parse(card.booking.startsAt);
  const endsAt = Date.parse(card.booking.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;
  const tz = card.timezone;

  const status = card.order.status;
  const live = status === 'open' || status === 'filled';
  const crew: Record<SeatDto, string | null> = { pic: card.booking.pilotId, dual: card.booking.dualId };
  const open = SEATS.filter((seat) => card.order.seats[seat] === 'sought' && crew[seat] == null);
  const seated = new Set([crew.pic, crew.dual].filter((id): id is string => id != null));
  const recipients = (card.recipients ?? []).filter((r) => !r.removed && !seated.has(r.pilotId));
  const ctx: Ctx = { input, tz, live, open };

  const blocks = card.order.addressing === 'shared' ? sharedBlocks(recipients, ctx) : perSeatBlocks(recipients, ctx);
  const inBlocks = new Set(blocks.flatMap((b) => b.rows.map((r) => r.pilotId)));
  const leftover = sortRows(recipients.filter((r) => !inBlocks.has(r.pilotId)));
  const plane = input.aircraft(card.booking.aircraftId);
  const hours = `${termHoursLabel(startsAt, endsAt, tz)} czasu klubu`;
  const relative = live ? termRelative(startsAt, input.now, tz) : null;
  const task = [card.booking.operation == null ? null : operationLabel(card.booking.operation).toLowerCase(), routeLabel(card.booking.fromIcao, card.booking.toIcao)]
    .filter((p): p is string => p != null)
    .join(' ');

  const reminders = recipients.filter((r) => r.inPlay && r.answer == null && r.assignedSeat == null).length;
  return {
    title: `${plane?.reg ?? NONE} · ${termTitleDay(startsAt, tz)}`,
    pill: pillOf(status, open),
    // Zlecenie żywe mówi długość i „jutro" - zamknięte mówi, czym było, bo czasu na nic już nie ma.
    sub: live
      ? [hours, hoursLabel(endsAt - startsAt), relative].filter((p): p is string => p != null).join(' · ')
      : [hours, task === '' ? null : task].filter((p): p is string => p != null).join(' · '),
    closed: !live,
    crew: seated.size === 0 ? null : crewSeats(card, ctx),
    blocks,
    others:
      leftover.length === 0
        ? null
        : {
            label: `Pozostali adresaci · ${leftover.length} · zlecenie nieaktualne`,
            openLabel: `Zwiń · pozostali adresaci · ${leftover.length} · zlecenie nieaktualne`,
            rows: leftover.map((r) => rowOf(r, ctx, null, true)),
          },
    details: detailRows(card, input),
    history:
      card.history == null
        ? []
        : orderHistoryRows(card.history, {
            timezone: tz,
            now: input.now,
            viewerId: input.viewerId,
            person: input.person,
            regOf: (id) => input.aircraft(id)?.reg ?? null,
            termAt: startsAt,
          }),
    resend:
      status === 'open'
        ? { note: reminders === 0 ? null : `Przypomnienie dostaną ${reminders} ${plural(reminders, 'osoba', 'osoby', 'osób')} bez odpowiedzi` }
        : null,
    cancellable: live,
  };
}

function pillOf(status: OrderCardDto['order']['status'], open: readonly SeatDto[]): LeaderCardVm['pill'] {
  if (status === 'cancelled') return { text: 'Odwołane', tone: 'dim' };
  if (status === 'expired') return { text: 'Wygasło', tone: 'dim' };
  if (status === 'filled' || open.length === 0) return { text: 'Komplet załogi', tone: 'green' };
  return { text: seekingLabel(open) ?? 'Szuka załogi', tone: 'blue' };
}

/** Kolejność: mogą (wg zgłoszenia) → odczytane → nieodczytane → odmowy. */
function sortRows(rows: readonly OrderLeaderRecipientDto[]): OrderLeaderRecipientDto[] {
  const rank = (r: OrderLeaderRecipientDto): number => (r.answer === 'yes' ? 0 : r.answer === 'no' ? 3 : r.seen ? 1 : 2);
  const at = (r: OrderLeaderRecipientDto): number => (r.answeredAt == null ? 0 : Date.parse(r.answeredAt) || 0);
  return rows
    .map((r, index) => ({ r, index }))
    .sort((a, b) => rank(a.r) - rank(b.r) || (rank(a.r) === 0 ? at(a.r) - at(b.r) : 0) || a.index - b.index)
    .map((x) => x.r);
}

/** „2 mogą lecieć" - liczba, na którą prowadzący czeka; zero i zlecenie zamknięte milczą. */
function volunteers(rows: readonly OrderLeaderRecipientDto[], live: boolean): string | null {
  if (!live) return null;
  const n = rows.filter((r) => r.answer === 'yes').length;
  return n === 0 ? null : `${n} ${plural(n, 'może', 'mogą', 'może')} lecieć`;
}

function perSeatBlocks(recipients: readonly OrderLeaderRecipientDto[], ctx: Ctx): SeatBlockVm[] {
  const audience = audienceParts(ctx.input.card.order.audienceLabel);
  const blocks: SeatBlockVm[] = [];
  for (const seat of ctx.open) {
    const own = recipients.filter((r) => r.seat === seat || r.seat == null);
    const named = own.filter((r) => (r.seat === seat && r.viaGroupId == null) || r.namedSeat === seat);
    const grouped = own.filter((r) => r.seat === seat && r.viaGroupId != null);
    const confirm = own.filter((r) => r.seat == null && r.namedSeat !== seat);
    const how = grouped.length === 0 && confirm.length === 0 && named.length === 1 ? 'imiennie' : audience[seat];
    blocks.push({
      key: seat,
      title: how == null ? SEAT_LABEL[seat] : `${SEAT_LABEL[seat]} · ${how}`,
      count: volunteers(own, ctx.live),
      rows: sortRows(own).map((r) => rowOf(r, ctx, seat, false)),
    });
  }
  return blocks;
}

function sharedBlocks(recipients: readonly OrderLeaderRecipientDto[], ctx: Ctx): SeatBlockVm[] {
  if (ctx.open.length === 0) return [];
  const shared = audienceParts(ctx.input.card.order.audienceLabel).shared;
  return [
    {
      key: 'shared',
      title: shared == null ? 'Wspólna lista' : `Wspólna lista · ${shared}`,
      count: volunteers(recipients, ctx.live),
      rows: sortRows(recipients).map((r) => rowOf(r, ctx, null, false)),
    },
  ];
}

function nameOf(pilotId: string, input: LeaderCardInput): string {
  if (pilotId === input.viewerId) return 'Ty';
  return input.person(pilotId)?.name ?? NONE;
}

const parsed = (iso: string | null): number | null => {
  if (iso == null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
};

/**
 * Wiersz adresata. `blockSeat` - fotel karty per fotel (`null` = wspólna lista albo
 * zwinięcie); `muted` - zwinięcie „Pozostali adresaci": bez tonów, akcji i bursztynu.
 */
function rowOf(r: OrderLeaderRecipientDto, ctx: Ctx, blockSeat: SeatDto | null, muted: boolean): LeaderRowVm {
  const { input, tz, live } = ctx;
  const active = live && !muted;
  const when = (iso: string | null): string => {
    const at = parsed(iso);
    return at == null ? '' : momentLabel(at, input.now, tz);
  };
  const tone = (t: StatusPart['tone']): StatusPart['tone'] => (muted ? undefined : t);

  let status: StatusPart[];
  if (r.answer === 'yes') status = [{ text: `Może lecieć · ${when(r.answeredAt)}`, tone: tone('ok') }];
  else if (r.answer === 'no') status = [{ text: `Nie może · ${when(r.answeredAt)}`, tone: tone('no') }];
  else if (r.seen) {
    // Przy fotelu imiennym brak odpowiedzi jest informacją sam w sobie - to moment, w którym
    // prowadzący pisze albo zamienia osobę.
    const quiet = r.direct && r.seat != null ? ' · bez odpowiedzi' : '';
    status = [{ text: `Odczytane ${when(r.seenAt)}${quiet}` }];
  } else status = [{ text: 'Nieodczytane', tone: tone('unread') }];

  const warn: string[] = [];
  if (active && r.conflict != null) {
    const s = parsed(r.conflict.startsAt);
    const e = parsed(r.conflict.endsAt);
    if (s != null && e != null) {
      warn.push(`w tym czasie ma rezerwację ${input.aircraft(r.conflict.aircraftId)?.reg ?? NONE} ${hoursSpan(s, e, tz)}`);
    }
  }
  const edited = parsed(input.card.order.editedAt);
  if (active && r.editUnseen && edited != null) warn.push(`zmiana z ${momentLabel(edited, input.now, tz)} nieodczytana`);

  const picks: LeaderRowVm['picks'] = [];
  if (active && input.card.order.status === 'open' && r.answer === 'yes') {
    if (blockSeat != null) picks.push({ seat: blockSeat, label: 'Wybierz' });
    else for (const seat of ctx.open) picks.push({ seat, label: `Na ${SEAT_ACCUSATIVE[seat]}` });
  }

  // Dopisek mówi, na który fotel osoba może JESZCZE trafić - po odmowie nie trafi na żaden.
  const alsoSeat = blockSeat == null || r.seat != null || r.answer === 'no' ? null : other(blockSeat);
  return {
    pilotId: r.pilotId,
    name: nameOf(r.pilotId, input),
    code: input.person(r.pilotId)?.code ?? null,
    status,
    warn,
    also: active && alsoSeat != null && ctx.open.includes(alsoSeat) ? `także na ${SEAT_ACCUSATIVE[alsoSeat]}` : null,
    reason: r.answer === 'no' && r.answerReason != null && r.answerReason.trim() !== '' ? quoted(r.answerReason) : null,
    picks,
    muted,
  };
}

/** Karta „Załoga": kto leci (z godziną przyjęcia albo przydziału) i który fotel jeszcze szuka. */
function crewSeats(card: OrderCardDto, ctx: Ctx): CrewSeatVm[] {
  const { input, tz } = ctx;
  const crew: Record<SeatDto, string | null> = { pic: card.booking.pilotId, dual: card.booking.dualId };
  const rows: CrewSeatVm[] = [];
  for (const seat of SEATS) {
    const state = card.order.seats[seat];
    if (state === 'none') continue;
    const person = crew[seat];
    if (person == null) {
      rows.push({
        seat,
        label: SEAT_LABEL[seat],
        pilotId: null,
        name: null,
        code: null,
        // Instrukcja, nie opis stanu - to, że szuka, powiedziała już plakietka w nagłówku.
        status: ctx.live ? [{ text: card.order.addressing === 'shared' ? 'przydziel z listy niżej' : 'wybierz z listy niżej' }] : [],
        asking: ctx.live,
        unassignable: false,
      });
      continue;
    }
    if (state === 'self') {
      rows.push({
        seat,
        label: SEAT_LABEL[seat],
        pilotId: person,
        name: nameOf(person, input),
        code: input.person(person)?.code ?? null,
        status: [{ text: 'osoba zlecająca' }],
        asking: false,
        unassignable: false,
      });
      continue;
    }
    const entry = lastSeating(card, seat, person);
    const at = entry == null ? null : parsed(entry.at);
    const accepted = entry?.payload.via === 'answer';
    const when = at == null ? null : momentLabel(at, input.now, tz);
    rows.push({
      seat,
      label: SEAT_LABEL[seat],
      pilotId: person,
      name: nameOf(person, input),
      code: input.person(person)?.code ?? null,
      // „Leci" wyłącznie w zleceniu żywym: po odwołaniu albo wygaśnięciu lot się nie odbędzie,
      // a karta zostaje zapisem - kto i kiedy usiadł w fotelu, bez zieleni odpowiedzi.
      status: ctx.live
        ? [{ text: when == null ? 'Leci' : `Leci · ${accepted ? 'przyjęte' : 'przydział'} ${when}`, tone: 'ok' }]
        : when == null
          ? []
          : [{ text: `${accepted ? 'Przyjęte' : 'Przydział'} ${when}` }],
      asking: false,
      unassignable: ctx.live,
    });
  }
  return rows;
}

/** Ostatnie obsadzenie fotela tą osobą - z historii (przyjęcie albo przydział). */
function lastSeating(card: OrderCardDto, seat: SeatDto, pilotId: string): NonNullable<OrderCardDto['history']>[number] | null {
  const history = card.history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i]!;
    if (entry.kind === 'assigned' && entry.payload.seat === seat && entry.payload.pilotId === pilotId) return entry;
  }
  return null;
}

/**
 * Karta „Zlecenie": zadanie, trasa (same kody - decyzja 2026-10-07, jak szuflada
 * rezerwacji w kalendarzu), plan lotu, opis i kto zleca. Maszyna stoi w tytule szuflady.
 */
function detailRows(card: OrderCardDto, input: LeaderCardInput): LeaderCardVm['details'] {
  const b = card.booking;
  const rows: LeaderCardVm['details'] = [];
  if (b.operation != null) rows.push({ label: 'Zadanie', value: operationLabel(b.operation), sub: null });
  const route = routeLabel(b.fromIcao, b.toIcao);
  if (route != null) rows.push({ label: route.includes('→') ? 'Trasa' : 'Lotnisko', value: route, sub: null });
  const plan = planLabel(b.plannedAirMin, b.plannedFuelL);
  if (plan !== '') rows.push({ label: 'Plan lotu', value: plan, sub: null });
  if (b.note != null && b.note.trim() !== '') rows.push({ label: 'Opis', value: b.note.trim(), sub: null });

  const own = card.order.createdBy === input.viewerId;
  const created = parsed(card.order.createdAt);
  const sent = created == null ? null : sentLabel(created, input.now, card.timezone);
  const code = own ? null : (input.person(card.order.createdBy)?.code ?? null);
  rows.push({
    label: 'Zleca',
    value: nameOf(card.order.createdBy, input),
    sub: [code, sent].filter((p): p is string => p != null).join(' · ') || null,
  });
  return rows;
}
