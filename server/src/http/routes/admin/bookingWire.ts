/**
 * Ninerdeck (serwer) - ZAJĘTOŚĆ NA DRUCIE dla PANELU (milestone 3.0.0, issue #158 B6;
 * od 3.1.0 wspólna dla kalendarza, kolejki decyzji i karty rezerwacji - issue #165).
 *
 * ══ KSZTAŁT PYTA, KTO PATRZY - TAK SAMO JAK NA TELEFONIE (issue #216, „panel dla wszystkich") ══
 * Do 3.1.0 panel wysyłał KOMPLET każdemu, kto do niego wszedł, bo wchodził wyłącznie
 * ktoś ze zdolnością `panel.access`. Odkąd kalendarz w panelu otwiera się każdemu
 * członkowi klubu, komplet cudzej rezerwacji - zadanie, trasa, drugi pilot, plan
 * i NOTATKA (wolny tekst pilota) - jechałby na ekran każdego pilota z przeglądarką,
 * czyli dokładnie tam, gdzie R-F (§17 `docs/rezerwacje.md`) zabroniło go wysyłać
 * telefonom. Reguła jest więc jedna dla obu powierzchni: własna rezerwacja w komplecie,
 * cudza wąsko - godziny, maszyna, właściciel, rodzaj i powód wyłączenia z użytku.
 *
 * ══ KTO WIDZI KOMPLET W PANELU ══
 * Trzy zdolności, każda z własnego powodu: `reservations.approve` (zgoda bez kontekstu
 * jest podpisem w ciemno - jak na telefonie), `reservations.manage` (władza nad cudzym
 * planem wymaga jego treści) i `panel.access` - „Podgląd klubu", czyli to, co panel
 * dawał każdemu przed #216: technik albo koordynator, który dziś widzi komplet, ma go
 * widzieć dalej. Zwykły członek nie zyskuje ani jednego pola.
 *
 * Kształt PEŁNY niesie też ślad zamknięcia i autora - inaczej niż na telefonie, bo
 * panel pyta „kto to założył" i „dlaczego odwołano". Jedna funkcja, bo trzy trasy
 * niosące tę samą zajętość w trzech kształtach rozjechałyby się przy pierwszym nowym polu.
 */

import type { Actor } from '../../../application/admin/ports.ts';
import type { BookingRecord } from '../../../application/common/ports.ts';
import { can } from '../../../domain/roles.ts';

export interface PanelBookingViewer {
  pilotId: string;
  /** Czy widzi komplet CUDZYCH rezerwacji - patrz nagłówek pliku. */
  full: boolean;
}

/** Widz z działającego trasy panelu - jedno miejsce, w którym trzy zdolności stają się jednym bitem. */
export function viewerOf(actor: Pick<Actor, 'pilotId' | 'capabilities'>): PanelBookingViewer {
  return {
    pilotId: actor.pilotId,
    full:
      can(actor.capabilities, 'panel.access') ||
      can(actor.capabilities, 'reservations.approve') ||
      can(actor.capabilities, 'reservations.manage'),
  };
}

/** Widz, który widzi KOMPLET - dla odpowiedzi mutacji na zdolnościach zapisu. */
export const FULL_VIEWER: PanelBookingViewer = { pilotId: '', full: true };

/** Czy ten widz czyta zajętość w komplecie (własną albo z prawem do cudzych). */
export function seesFull(row: BookingRecord, viewer: PanelBookingViewer): boolean {
  return viewer.full || (row.pilotId != null && row.pilotId === viewer.pilotId);
}

export function bookingWire(row: BookingRecord, viewer: PanelBookingViewer): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    id: row.id,
    aircraftId: row.aircraftId,
    kind: row.kind,
    status: row.status,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: new Date(row.endsAt).toISOString(),
    pilotId: row.pilotId,
    blockReason: row.blockReason,
  };

  if (!seesFull(row, viewer)) return wire;

  return {
    ...wire,
    dualId: row.dualId,
    operation: row.operation,
    fromIcao: row.fromIcao,
    toIcao: row.toIcao,
    plannedAirMin: row.plannedAirMin,
    plannedFuelL: row.plannedFuelL,
    sessionUuid: row.sessionUuid,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    closedAt: row.closedAt == null ? null : new Date(row.closedAt).toISOString(),
    closeReason: row.closeReason,
  };
}
