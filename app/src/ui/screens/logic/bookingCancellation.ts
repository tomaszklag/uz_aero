/**
 * Ninerdeck - ODWOŁANIE CUDZĄ RĘKĄ na karcie rezerwacji (`design/23g`; `docs/rezerwacje.md`
 * §12.9, decyzje właściciela 2026-10-06).
 *
 * ══ BANER STOI, GDY ODWOŁAŁ KTOŚ INNY NIŻ PATRZĄCY ══
 * Klub odwołał rezerwację pilota (panel, powód wymagany) albo dowódca odwołał własną, a na
 * kartę patrzy drugi pilot. Kto odwołał sam, banera nie dostaje: wie, co zrobił, a jego
 * powód był zdaniem dla innych. Dlatego rozstrzyga `closedBy`, nie sam powód - pilot podaje
 * go także przy odwołaniu własnej.
 *
 * ══ TEN SAM UKŁAD, CO ODMOWA (23C) ══
 * Termin przepadł decyzją człowieka, a powód jest jej treścią. Tytuł RZECZOWNIKIEM
 * z nazwiskiem za separatorem („Rezerwacja odwołana · Jan Bąk"): czasownika nie da się
 * odmienić bez znajomości płci. Bez powodu baner mówi skutek, a nie zmyśla zdania.
 *
 * Niezależny od ścieżki akceptacji, więc osobno od `bookingApproval.ts`: odwołać da się
 * rezerwację z klubu bez ścieżki i rezerwację, która ścieżkę dawno przeszła.
 */

import type { ApprovalBanner } from './bookingApproval';

export interface CancellationInput {
  /** Stan wiersza - baner dotyczy wyłącznie `cancelled`. */
  status: string;
  /** Kto zamknął wiersz; `null`/`undefined` = czas, serwer sprzed §12.9 albo cudzy kształt. */
  closedBy: string | null | undefined;
  closeReason: string | null | undefined;
  /** Kto patrzy na kartę. */
  viewerId: string;
  /** Imię i nazwisko z cache członków klubu; `null` = poza cache'em. */
  nameOf: (pilotId: string) => string | null;
}

export function cancellationBanner(input: CancellationInput): ApprovalBanner | null {
  if (input.status !== 'cancelled') return null;
  if (input.closedBy == null || input.closedBy === input.viewerId) return null;

  const name = input.nameOf(input.closedBy);
  const reason = input.closeReason?.trim();
  return {
    tone: 'red',
    title: name == null ? 'Rezerwacja odwołana' : `Rezerwacja odwołana · ${name}`,
    text: reason ? reason : 'Termin wrócił do puli.',
  };
}
