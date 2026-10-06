/**
 * Ninerdeck - panel: SKUTEK ODWOŁANIA powiedziany PRZED kliknięciem (szuflada zajętości,
 * K2 i K2b; `docs/rezerwacje.md` §12.9, decyzje właściciela 2026-10-06).
 *
 * Odwołanie rezerwacji lotu zawiadamia osoby w fotelach POZA odwołującym: przy cudzej -
 * dowódcę i drugiego pilota (z powodem, który panel tu wymaga), przy własnej - drugiego
 * pilota. Czekająca sprawa budzi do tego osoby kroku bieżącego („prośba wycofana").
 * Zdanie liczy się tutaj, bo zależy od czterech rzeczy naraz, a warunek w JSX przy takiej
 * liczbie gałęzi już raz w tym projekcie kłamał.
 */

export interface CancelNoteInput {
  kind: 'flight' | 'block';
  status: string;
  pilotId: string | null;
  dualId: string | null;
  /** Kto odwołuje - jego fotel wiadomości nie dostaje. */
  viewerId: string | null;
}

const FREES = 'Termin zwolni się natychmiast.';

export function cancelNote(input: CancelNoteInput): string {
  if (input.kind === 'block') return 'Termin zwolni się natychmiast i maszyna wróci do kalendarza.';

  const own = input.viewerId != null && input.pilotId === input.viewerId;
  const pilot = !own && input.pilotId != null;
  const dual = input.dualId != null && input.dualId !== input.viewerId;
  const pending = input.status === 'pending';

  // Kto dostaje wiadomość o odwołaniu. Powód obiecujemy wyłącznie przy CUDZEJ: tam panel
  // go wymaga, a przy własnej pola powodu nie ma.
  const reason = own ? '' : ' z powodem';
  const who =
    pilot && dual
      ? `Pilot i drugi pilot dostaną wiadomość${reason}`
      : pilot
        ? `Pilot dostanie wiadomość${reason}`
        : dual
          ? `Drugi pilot dostanie wiadomość${reason}`
          : null;

  if (pending) {
    return who == null
      ? 'Osoby z kroku dostaną wiadomość, że prośba została wycofana.'
      : `${who}, a osoby z kroku - że prośba została wycofana.`;
  }
  return who == null ? FREES : `${who}. ${FREES}`;
}
