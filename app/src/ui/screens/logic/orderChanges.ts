/**
 * Ninerdeck - CO ZMIENIŁA EDYCJA ZLECENIA, po polsku (4.0.0, epik Z-C #247;
 * `docs/zlecenia.md` §5.1, §5.2, §10.3).
 *
 * Serwer oddaje zmiany jako SUROWE klucze z wartością przed i po (`term`, `aircraft`,
 * `plannedAirMin`…) - nazwanie ich jest sprawą ekranu. Ten sam przekład czyta linijka
 * „Edytowane 07:10 · plan lotu 2:00 → 3:00" na karcie adresata (28, bez nazwiska -
 * pkt 31) i historia zmian u prowadzącego (32, z nazwiskiem), więc słownik jest jeden.
 *
 * Klucz nieznany temu wydaniu nie dostaje zdania: nowszy serwer dokłada pola, a napis
 * z wnętrza bazy pokazany pilotowi mówiłby mniej niż milczenie.
 */

import { duration, litres } from '@ninerdeck/format';

import type { RemoteSeat } from '../../../application';

import type { ClubDayBounds } from './clubClock';
import { operationLabelOf } from './operations';
import { instant, NONE, orderSpan, seatLower } from './orderFormat';

/** Kawałek zdania - pogrubiona nazwa pola, zwykłe wartości. */
export interface ChangePart {
  text: string;
  strong?: boolean;
}

export interface ChangeContext {
  /** Doba terminu - godziny starego i nowego terminu liczą się odejmowaniem od jej granic. */
  day: ClubDayBounds;
  /** Znak maszyny z pamięci floty; `null` = poza nią. */
  regOf: (aircraftId: string) => string | null;
}

/** Kolejność kluczy - ta sama, w której serwer je składa (`fieldChanges`). */
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

/** „09:00-11:00" z `{ startsAt, endsAt }`; `null`, gdy wartość nie jest terminem. */
export function termSpan(value: unknown, day: ClubDayBounds): string | null {
  if (!isObject(value)) return null;
  const startsAt = instant(text(value.startsAt));
  const endsAt = instant(text(value.endsAt));
  return startsAt == null || endsAt == null ? null : orderSpan(startsAt, endsAt, day);
}

/** „EPKK-EPRJ" / „EPKP" - trasa jako WARTOŚĆ po obu stronach strzałki „→". */
function routeValue(value: unknown): string {
  if (!isObject(value)) return NONE;
  const from = text(value.fromIcao);
  const to = text(value.toIcao);
  if (from == null && to == null) return NONE;
  if (from == null || to == null || from === to) return (from ?? to)!;
  return `${from}-${to}`;
}

const arrow = (from: string, to: string): ChangePart => ({ text: ` ${from} → ${to}` });

/** Jedna zmiana pola: nazwa i „przed → po"; `null` dla klucza nieznanego albo zepsutego. */
function partsOf(key: string, change: Json, ctx: ChangeContext): ChangePart[] | null {
  const { from, to } = change;
  switch (key) {
    case 'term': {
      const before = termSpan(from, ctx.day);
      const after = termSpan(to, ctx.day);
      return before == null || after == null ? null : [{ text: 'termin', strong: true }, arrow(before, after)];
    }
    case 'aircraft': {
      const reg = (value: unknown): string => {
        const id = text(value);
        return id == null ? NONE : (ctx.regOf(id) ?? NONE);
      };
      return [{ text: 'maszyna', strong: true }, arrow(reg(from), reg(to))];
    }
    case 'operation':
      return [
        { text: 'zadanie', strong: true },
        arrow(operationLabelOf(text(from)) ?? NONE, operationLabelOf(text(to)) ?? NONE),
      ];
    case 'route':
      return [{ text: 'trasa', strong: true }, arrow(routeValue(from), routeValue(to))];
    case 'plannedAirMin': {
      const plan = (value: unknown): string => {
        const minutes = num(value);
        return minutes == null ? NONE : duration(minutes * 60_000);
      };
      return [{ text: 'plan lotu', strong: true }, arrow(plan(from), plan(to))];
    }
    case 'plannedFuelL': {
      const fuel = (value: unknown): string => {
        const l = num(value);
        return l == null ? NONE : litres(l);
      };
      return [{ text: 'paliwo', strong: true }, arrow(fuel(from), fuel(to))];
    }
    case 'note':
      // Opis bywa długi - zdanie mówi, ŻE się zmienił, a nowy jest na karcie wyżej.
      return [{ text: 'opis', strong: true }];
    case 'seats':
      return seatParts(from, to);
    default:
      return null;
  }
}

/** „drugi pilot szukany → brak" - po jednym kawałku na zmieniony fotel. */
function seatParts(from: unknown, to: unknown): ChangePart[] | null {
  if (!isObject(from) || !isObject(to)) return null;
  const parts: ChangePart[] = [];
  for (const seat of ['pic', 'dual'] as RemoteSeat[]) {
    const before = text(from[seat]);
    const after = text(to[seat]);
    if (before == null || after == null || before === after) continue;
    if (parts.length > 0) parts.push({ text: ' · ' });
    parts.push({ text: seatLower(seat), strong: true }, arrow(SEAT_STATE[before] ?? before, SEAT_STATE[after] ?? after));
  }
  return parts.length === 0 ? null : parts;
}

/**
 * Zmiany jednej edycji w stałej kolejności, połączone „ · ". `skip` pomija klucze, które
 * ekran mówi osobno - karta adresata pisze termin własną linijką („Termin zmieniony"),
 * a „Edytowane" mówi o reszcie (§5.2).
 */
export function changesParts(changes: Json, ctx: ChangeContext, skip: readonly string[] = []): ChangePart[] {
  const out: ChangePart[] = [];
  for (const key of ORDER) {
    if (skip.includes(key)) continue;
    const change = changes[key];
    if (!isObject(change)) continue;
    const parts = partsOf(key, change, ctx);
    if (parts == null) continue;
    if (out.length > 0) out.push({ text: ' · ' });
    out.push(...parts);
  }
  return out;
}

/** Pierwsza litera zdania wielka - „Plan lotu 2:00 → 3:00" jako tytuł wpisu historii. */
export function capitalized(parts: readonly ChangePart[]): ChangePart[] {
  if (parts.length === 0) return [];
  const [first, ...rest] = parts;
  return [{ ...first!, text: first!.text.charAt(0).toUpperCase() + first!.text.slice(1) }, ...rest];
}
