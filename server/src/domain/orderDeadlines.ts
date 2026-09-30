/**
 * Ninerdeck (serwer) - TERMINY ZEGARA ZLECEŃ: kiedy ostrzec zlecającego o niepełnej
 * załodze (4.0.0, issue #245; `docs/zlecenia.md` §5.5, pkt 45).
 *
 * ══ GODZINA KLUBU W PRZEDDZIEŃ, NIE WYPRZEDZENIE ══
 * Ostrzeżenie pada o `ORDER_UNFILLED_WARN_HOUR` czasu KLUBU w przeddzień doby, w której
 * zaczyna się termin. Doba liczy się granicami dób klubu, tak jak w kalendarzu
 * (`clubTime.ts`) - lot o 00:30 należy do NASTĘPNEJ doby, więc ostrzeżenie o nim pada
 * wieczorem dnia, który właśnie trwa.
 *
 * ══ OD PÓŁNOCY WSTECZ ══
 * Chwila liczy się od północy doby terminu wstecz, a nie od północy przeddnia do przodu:
 * zmiana czasu wypada nad ranem, więc wieczór przeddnia ma zawsze tę samą długość do
 * północy, a doba przeddnia - nie zawsze (23 albo 25 godzin). Test przybija oba dni
 * zmiany czasu.
 *
 * ══ ROZSTRZYGNIĘCIE RAZ, O 18:00 (decyzja właściciela 2026-09-29) ══
 * Zegar pyta o każde żywe zlecenie RAZ, przy pierwszym przebiegu po tej chwili: brakuje
 * załogi - ostrzeżenie; komplet - nic, także gdy ktoś zrezygnuje później (o rezygnacji
 * zlecający dostaje „Rezygnacja z lotu", więc drugie zdanie o tym samym byłoby szumem).
 * Zlecenie wysłane po tej chwili rozstrzyga się bez wiadomości - powstało z wiedzą, ile
 * zostało czasu (pkt 45).
 */

import { ORDER_UNFILLED_WARN_HOUR } from '@ninerdeck/domain';

import { clubDays } from './clubTime.ts';

const HOUR_MS = 3_600_000;

/** Chwila ostrzeżenia dla terminu zaczynającego się w `startsAt` (ms UTC). */
export function unfilledWarnAt(zone: string, startsAt: number): number {
  const day = clubDays(zone, startsAt, startsAt + 1, 1)[0];
  if (day == null) throw new Error('doba klubu nie wyszła z niezerowego okna');
  return day.startsAt - (24 - ORDER_UNFILLED_WARN_HOUR) * HOUR_MS;
}

/**
 * Co zegar ma TERAZ zrobić z ostrzeżeniem o tym zleceniu:
 *  - `warn` - ostrzec zlecającego i zapisać rozstrzygnięcie;
 *  - `quiet` - zapisać rozstrzygnięcie bez wiadomości (komplet załogi albo zlecenie
 *    wysłane po chwili ostrzeżenia);
 *  - `null` - nic: jeszcze nie pora, już rozstrzygnięte albo termin się zaczął (ten wygasa).
 */
export type WarnDecision = 'warn' | 'quiet';

export function warnDecision(
  order: { createdAt: number; startsAt: number; decidedAt: number | null; complete: boolean },
  zone: string,
  now: number,
): WarnDecision | null {
  if (order.decidedAt != null || now >= order.startsAt) return null;
  const warnAt = unfilledWarnAt(zone, order.startsAt);
  if (now < warnAt) return null;
  return order.complete || order.createdAt >= warnAt ? 'quiet' : 'warn';
}
