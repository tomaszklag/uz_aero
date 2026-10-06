/**
 * Ninerdeck - HISTORIA ZMIAN ZLECENIA na karcie prowadzącego (4.0.0, epik Z-C #247;
 * `docs/zlecenia.md` §10.3, pkt 31 i 40; makiety 32, 32A, 32B).
 *
 * Prowadzący widzi, KTO co zrobił - przy prowadzeniu przez kilka osób naraz (pkt 20) to
 * jedyna odpowiedź na „kto przestawił termin". Nazwisko stoi osobno, po prawej, jako
 * podmiot w mianowniku; wpis zegara (wygaśnięcie) nazwiska nie ma - zrobił to czas,
 * nie człowiek. Najnowsze na górze.
 *
 * Rodzaj wpisu nieznany temu wydaniu dostaje ogólne „Zmiana" zamiast zniknąć: historia
 * jest zapisem i ma się przeczytać w całości.
 */

import { plural } from '@ninerdeck/format';

import type { RemoteOrderHistoryEntry, RemoteSeat } from '../../../application';

import type { ClubDayBounds } from './clubClock';
import { capitalized, changesParts, type ChangePart } from './orderChanges';
import { HISTORY, instant, momentLabel, personLabel, seatLower } from './orderFormat';

export interface HistoryRowVm {
  id: string;
  /** „dziś 07:10", „wcz. 21:05". */
  when: string;
  /** „Plan lotu 2:00 → 3:00", „Utworzone · …" - nazwa pogrubiona. */
  what: ChangePart[];
  /** Powód jako cytat (odwołanie, rezygnacja, cofnięcie); `null` = bez powodu. */
  reason: string | null;
  /** „Ty", nazwisko; `null` = zegar. */
  who: string | null;
}

export interface HistoryInput {
  history: readonly RemoteOrderHistoryEntry[];
  day: ClubDayBounds;
  now: number;
  pilotId: string;
  nameOf: (pilotId: string) => string | null;
  regOf: (aircraftId: string) => string | null;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value != null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const seatOf = (value: unknown): RemoteSeat | null => (value === 'pic' || value === 'dual' ? value : null);

export function orderHistoryRows(input: HistoryInput): HistoryRowVm[] {
  const rows: HistoryRowVm[] = [];
  for (const entry of input.history) {
    const at = instant(entry.at);
    if (at == null) continue;
    rows.push({
      id: entry.id,
      when: momentLabel(at, input.day, input.now, HISTORY),
      what: whatOf(entry, input),
      reason: reasonOf(entry),
      who: entry.actorId == null ? null : personLabel(entry.actorId, input.pilotId, input.nameOf),
    });
  }
  return rows.reverse();
}

const title = (name: string, detail: string | null): ChangePart[] =>
  detail == null ? [{ text: name, strong: true }] : [{ text: name, strong: true }, { text: ` · ${detail}` }];

/** „Jan Nowak, Ewa Sowa" - przy dwóch osobach nazwiska, przy więcej liczba. */
function people(pilotIds: readonly string[], input: HistoryInput): string | null {
  if (pilotIds.length === 0) return null;
  if (pilotIds.length > 2) return `${pilotIds.length} ${plural(pilotIds.length, 'osoba', 'osoby', 'osób')}`;
  return pilotIds.map((id) => personLabel(id, input.pilotId, input.nameOf)).join(', ');
}

/** „drugi pilot: Anna Kowal". */
function seatPerson(payload: Json, input: HistoryInput): string | null {
  const seat = seatOf(payload.seat);
  const pilotId = text(payload.pilotId);
  if (seat == null) return null;
  return pilotId == null ? seatLower(seat) : `${seatLower(seat)}: ${personLabel(pilotId, input.pilotId, input.nameOf)}`;
}

function whatOf(entry: RemoteOrderHistoryEntry, input: HistoryInput): ChangePart[] {
  const p = isObject(entry.payload) ? entry.payload : {};
  switch (entry.kind) {
    case 'created':
      // Etykieta adresowania złożona przez serwer przy wysłaniu (decyzja właściciela
      // 2026-10-06): mówi KOGO zapytano, nie tylko jak.
      return title('Utworzone', text(p.audience));
    case 'edited': {
      const parts = isObject(p.changes) ? changesParts(p.changes, { day: input.day, regOf: input.regOf }) : [];
      return parts.length === 0 ? title('Zmiana', null) : capitalized(parts);
    }
    case 'recipients_added':
      return title('Nowi adresaci', people(ids(p.pilotIds), input));
    case 'recipients_removed':
      return title('Zlecenie cofnięte', people(ids(p.pilotIds), input));
    case 'resent':
      return title('Wysłano ponownie', resentDetail(ids(p.added).length, ids(p.reminded).length));
    case 'assigned': {
      const seat = seatOf(p.seat);
      // „Przyjęcie" pisze osoba z fotela imiennego, „Przydział" - prowadzący (32B).
      if (p.via === 'answer') return title('Przyjęcie', seat == null ? null : seatLower(seat));
      return title('Przydział', seatPerson(p, input));
    }
    case 'unassigned':
      return title('Cofnięty przydział', seatPerson(p, input));
    case 'withdrawn': {
      const seat = seatOf(p.seat);
      return title('Rezygnacja', seat == null ? null : seatLower(seat));
    }
    case 'cancelled':
      return title('Odwołanie', null);
    case 'expired':
      return title('Wygasło', null);
    default:
      return title('Zmiana', null);
  }
}

/** „2 nowe osoby, przypomnienie dla 4 osób". */
function resentDetail(added: number, reminded: number): string | null {
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} ${plural(added, 'nowa osoba', 'nowe osoby', 'nowych osób')}`);
  if (reminded > 0) parts.push(`przypomnienie dla ${reminded} ${plural(reminded, 'osoby', 'osób', 'osób')}`);
  return parts.length === 0 ? null : parts.join(', ');
}

function reasonOf(entry: RemoteOrderHistoryEntry): string | null {
  if (!isObject(entry.payload)) return null;
  switch (entry.kind) {
    case 'cancelled':
    case 'withdrawn':
    case 'unassigned':
    case 'recipients_removed':
      return text(entry.payload.reason);
    default:
      return null;
  }
}
