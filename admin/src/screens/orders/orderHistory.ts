/**
 * Ninerdeck - panel: HISTORIA ZMIAN ZLECENIA w szufladzie prowadzącego (4.0.0, epik Z-D
 * #248; makieta `zlecenia-szczegoly` ZL3 i ZL3c; `docs/zlecenia.md` §10.3, pkt 31 i 40).
 *
 * Prowadzący widzi, KTO co zrobił - przy prowadzeniu przez kilka osób naraz (pkt 20) to
 * jedyna odpowiedź na „kto przestawił termin". Ten sam komponent, co historia korekt
 * w dzienniku (`.hist`): najnowsza zmiana na górze, kotwicą jest UTWORZENIE (kropka pusta),
 * odwołanie dostaje czerwień - jedyną rzecz niszczącą. Wpis zegara (wygaśnięcie) nazwiska
 * nie ma - zrobił to czas, nie człowiek.
 *
 * Słowa są te same, co w historii na telefonie (32): „Utworzone · <etykieta adresowania>"
 * (decyzja właściciela 2026-10-06), „Przyjęcie" przy fotelu imiennym, „Przydział" przy
 * wyborze prowadzącego. Rodzaj wpisu nieznany temu wydaniu dostaje ogólne „Zmiana".
 *
 * Moduł czysty - test obok.
 */

import { plural } from '@ninerdeck/format';

import type { OrderHistoryEntryDto, SeatDto } from '../../api/dto';
import type { PersonLookup } from '../calendar/bookingLabels';
import { NONE } from '../common/values';
import { fieldChanges, type ChangeContext, type FieldChange } from './orderChanges';
import { historyMoment, SEAT_LOWER } from './orderLabels';

export interface HistoryRowVm {
  id: string;
  /** „dziś · 07:10". */
  when: string;
  /** Wpis edycji - pary „było → jest"; inaczej pusta lista. */
  changes: FieldChange[];
  /** Wpis czynności - „Wysłano ponownie · przypomnienie dla 4 osób"; przy edycji `null`. */
  verdict: string | null;
  /** Powód jako cytat (odwołanie, rezygnacja, cofnięcie, odebranie). */
  reason: string | null;
  /** „Ty", nazwisko; `null` = zegar. */
  who: string | null;
  /** Odwołanie - jedyny wpis, który coś skasował. */
  void: boolean;
  /** Utworzenie - kotwica osi (kropka pusta). */
  origin: boolean;
}

export interface HistoryContext extends ChangeContext {
  now: number;
  viewerId: string | null;
  person: PersonLookup;
}

type Json = Record<string, unknown>;
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const seatOf = (value: unknown): SeatDto | null => (value === 'pic' || value === 'dual' ? value : null);

function nameOf(pilotId: string, ctx: HistoryContext): string {
  if (pilotId === ctx.viewerId) return 'Ty';
  return ctx.person(pilotId)?.name ?? NONE;
}

export function orderHistoryRows(history: readonly OrderHistoryEntryDto[], ctx: HistoryContext): HistoryRowVm[] {
  const rows: HistoryRowVm[] = [];
  for (const entry of history) {
    const at = Date.parse(entry.at);
    if (!Number.isFinite(at)) continue;
    const p: Json = entry.payload ?? {};
    const edited = entry.kind === 'edited';
    const changes = edited ? fieldChanges((p.changes as Json | undefined) ?? {}, ctx) : [];
    rows.push({
      id: entry.id,
      when: historyMoment(at, ctx.now, ctx.timezone),
      changes,
      verdict: edited && changes.length > 0 ? null : verdictOf(entry.kind, p, ctx),
      reason: reasonOf(entry.kind, p),
      who: entry.actorId == null ? null : nameOf(entry.actorId, ctx),
      void: entry.kind === 'cancelled',
      origin: entry.kind === 'created',
    });
  }
  return rows.reverse();
}

const titled = (name: string, detail: string | null): string => (detail == null ? name : `${name} · ${detail}`);

/** Przy dwóch osobach nazwiska, przy więcej - liczba. */
function people(pilotIds: readonly string[], ctx: HistoryContext): string | null {
  if (pilotIds.length === 0) return null;
  if (pilotIds.length > 2) return `${pilotIds.length} ${plural(pilotIds.length, 'osoba', 'osoby', 'osób')}`;
  return pilotIds.map((id) => nameOf(id, ctx)).join(', ');
}

/** „drugi pilot: Anna Kowal". */
function seatPerson(p: Json, ctx: HistoryContext): string | null {
  const seat = seatOf(p.seat);
  const pilotId = text(p.pilotId);
  if (seat == null) return null;
  return pilotId == null ? SEAT_LOWER[seat] : `${SEAT_LOWER[seat]}: ${nameOf(pilotId, ctx)}`;
}

function verdictOf(kind: string, p: Json, ctx: HistoryContext): string {
  switch (kind) {
    case 'created':
      return titled('Utworzone', text(p.audience));
    case 'recipients_added':
      return titled('Nowi adresaci', people(ids(p.pilotIds), ctx));
    case 'recipients_removed':
      return titled('Zlecenie cofnięte', people(ids(p.pilotIds), ctx));
    case 'resent':
      return titled('Wysłano ponownie', resentDetail(ids(p.added).length, ids(p.reminded).length));
    case 'assigned': {
      const seat = seatOf(p.seat);
      if (p.via === 'answer') return titled('Przyjęcie', seat == null ? null : SEAT_LOWER[seat]);
      return titled('Przydział', seatPerson(p, ctx));
    }
    case 'unassigned':
      return titled('Cofnięty przydział', seatPerson(p, ctx));
    case 'withdrawn': {
      const seat = seatOf(p.seat);
      return titled('Rezygnacja', seat == null ? null : SEAT_LOWER[seat]);
    }
    case 'cancelled':
      return 'Odwołanie';
    case 'expired':
      return 'Wygasło · początek terminu bez kompletu załogi';
    default:
      return 'Zmiana';
  }
}

/** „2 nowe osoby, przypomnienie dla 4 osób". */
function resentDetail(added: number, reminded: number): string | null {
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} ${plural(added, 'nowa osoba', 'nowe osoby', 'nowych osób')}`);
  if (reminded > 0) parts.push(`przypomnienie dla ${reminded} ${plural(reminded, 'osoby', 'osób', 'osób')}`);
  return parts.length === 0 ? null : parts.join(', ');
}

function reasonOf(kind: string, p: Json): string | null {
  switch (kind) {
    case 'cancelled':
    case 'withdrawn':
    case 'unassigned':
    case 'recipients_removed':
      return text(p.reason);
    default:
      return null;
  }
}
