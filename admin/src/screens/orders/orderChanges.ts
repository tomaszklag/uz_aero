/**
 * Ninerdeck - panel: ZMIANY ZLECENIA jako pary „było → jest" (4.0.0, epik Z-D #248;
 * `docs/zlecenia.md` §5.2, §10.3, pkt 31).
 *
 * Jeden słownik pól dla historii zmian prowadzącego („plan lotu 2:00 → 3:00" z nazwiskiem)
 * i dla adresata („Edytowane · plan lotu 2:00 → 3:00" bez nazwiska) - te same słowa, co
 * w telefonie (`orderChanges.ts` w aplikacji), w tej samej kolejności pól. Serwer zapisuje
 * zmianę jako `{ pole: { from, to } }` z identyfikatorami i chwilami ISO; nazwy i godziny
 * składa ekran.
 *
 * Pole nieznane temu wydaniu nie wywraca wpisu - po prostu nie ma wiersza (historia czyta
 * się dalej). Moduł czysty - test obok.
 */

import { duration } from '@ninerdeck/format';

import type { SeatDto } from '../../api/dto';
import { clubDayIndex, operationLabel } from '../calendar/bookingLabels';
import { NONE } from '../common/values';
import { hoursSpan, SEAT_LOWER, termDayLabel } from './orderLabels';

/** Jedna zmieniona wartość. `from`/`to` = `null` przy polu, które mówi samo o sobie (opis). */
export interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface ChangeContext {
  timezone: string;
  /** Znak maszyny ze słownika klubu; `null` = poza nim. */
  regOf: (aircraftId: string) => string | null;
  /** Bieżący początek terminu - stary termin z innej doby dostaje przy sobie datę. */
  termAt: number;
}

const ORDER = ['term', 'aircraft', 'operation', 'route', 'plannedAirMin', 'plannedFuelL', 'note', 'seats'] as const;

const SEAT_STATE: Readonly<Record<string, string>> = {
  self: 'osoba zlecająca',
  sought: 'szukany',
  none: 'brak',
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value != null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Termin w zdaniu: „09:00-11:00"; z innej doby niż bieżący termin - z datą przed godzinami. */
function termValue(value: unknown, ctx: ChangeContext): string | null {
  if (!isObject(value)) return null;
  const startsAt = Date.parse(text(value.startsAt) ?? '');
  const endsAt = Date.parse(text(value.endsAt) ?? '');
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;
  const span = hoursSpan(startsAt, endsAt, ctx.timezone);
  return clubDayIndex(startsAt, ctx.timezone) === clubDayIndex(ctx.termAt, ctx.timezone)
    ? span
    : `${termDayLabel(startsAt, ctx.timezone)} ${span}`;
}

function routeValue(value: unknown): string {
  if (!isObject(value)) return NONE;
  const from = text(value.fromIcao);
  const to = text(value.toIcao);
  if (from == null && to == null) return NONE;
  if (from == null || to == null || from === to) return (from ?? to)!;
  return `${from} → ${to}`;
}

function fieldsOf(key: (typeof ORDER)[number], change: Json, ctx: ChangeContext): FieldChange[] {
  const { from, to } = change;
  switch (key) {
    case 'term': {
      const before = termValue(from, ctx);
      const after = termValue(to, ctx);
      return before == null || after == null ? [] : [{ field: 'termin', from: before, to: after }];
    }
    case 'aircraft': {
      const reg = (value: unknown): string => {
        const id = text(value);
        return id == null ? NONE : (ctx.regOf(id) ?? NONE);
      };
      return [{ field: 'maszyna', from: reg(from), to: reg(to) }];
    }
    case 'operation':
      return [{ field: 'zadanie', from: operationLabel(text(from)), to: operationLabel(text(to)) }];
    case 'route':
      return [{ field: 'trasa', from: routeValue(from), to: routeValue(to) }];
    case 'plannedAirMin': {
      const plan = (value: unknown): string => {
        const minutes = num(value);
        return minutes == null ? NONE : duration(minutes * 60_000);
      };
      return [{ field: 'plan lotu', from: plan(from), to: plan(to) }];
    }
    case 'plannedFuelL': {
      const fuel = (value: unknown): string => {
        const l = num(value);
        return l == null ? NONE : `${l} L`;
      };
      return [{ field: 'paliwo', from: fuel(from), to: fuel(to) }];
    }
    case 'note':
      // Opis bywa długi - zapis mówi, ŻE się zmienił, a nowy stoi w karcie „Zlecenie" wyżej.
      return [{ field: 'opis', from: null, to: null }];
    case 'seats':
      return seatFields(from, to);
  }
}

function seatFields(from: unknown, to: unknown): FieldChange[] {
  if (!isObject(from) || !isObject(to)) return [];
  const out: FieldChange[] = [];
  for (const seat of ['pic', 'dual'] as SeatDto[]) {
    const before = text(from[seat]);
    const after = text(to[seat]);
    if (before == null || after == null || before === after) continue;
    out.push({ field: SEAT_LOWER[seat], from: SEAT_STATE[before] ?? before, to: SEAT_STATE[after] ?? after });
  }
  return out;
}

/** Zmiany z wpisu edycji w stałej kolejności pól; `skip` pomija pola (adresat - termin). */
export function fieldChanges(changes: Json, ctx: ChangeContext, skip: readonly string[] = []): FieldChange[] {
  const out: FieldChange[] = [];
  for (const key of ORDER) {
    if (skip.includes(key)) continue;
    const change = changes[key];
    if (!isObject(change)) continue;
    out.push(...fieldsOf(key, change, ctx));
  }
  return out;
}
