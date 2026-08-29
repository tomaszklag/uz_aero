/**
 * UZ Aero - panel: PONOWIENIE eksportu karty dnia (`A05`).
 *
 * **Mutacja deklaruje swoje unieważnienia TUTAJ, nie na ekranie**
 * (`docs/architektura-panelu-frontend.md` §4.3).
 *
 * Co przestaje być prawdą po udanym ponowieniu:
 *  • **monitor eksportu** - doszła rewizja, zmienił się stan i treść karty (`exports.all`
 *    obejmuje listę, historię i podgląd, bo wszystkie starzeją się od tej samej rzeczy);
 *  • **listy dni** - kolumna „Arkusz" na `A02` niesie `exportRevision`;
 *  • **karta dnia** - ten sam numer stoi w nagłówku `A02a`;
 *  • **dziennik audytu** - `AuditedWrite` dopisał wpis TĄ SAMĄ transakcją;
 *  • **pulpit** - unieważnia go każda mutacja panelu.
 *
 * ══ UNIEWAŻNIAMY TAKŻE PO ODMOWIE - I TO NIE JEST NADMIAROWE ══
 * Odmowa („flaga trzyma kartę", „dzień jeszcze otwarty") wraca jako 200, więc `onSuccess`
 * dostaje ją tak samo jak sukces. Wygląda to na unieważnianie bez powodu, ale powód jest:
 * odmowa oznacza, że wiersz, który administrator widział, opisywał NIEAKTUALNY stan
 * świata - dzień zdążył zostać zamknięty, flaga rozstrzygnięta, karta wysłana przez
 * automat. Odświeżenie jest wtedy dokładnie tym, czego trzeba, a rozróżnianie „kiedy
 * warto" byłoby zgadywaniem po stronie klienta.
 *
 * Czego tu NIE MA: **aktualizacji optymistycznych.** Wynik ponowienia zależy od bramek,
 * których panel nie umie przewidzieć (otwarta flaga, dzień bez `day_close`, awaria
 * arkuszy), więc optymistyczny UI musiałby się z tego wycofywać i tłumaczyć. Przycisk
 * pokazuje stan zajęty, UI przyjmuje odpowiedź serwera.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { ExportRetryResultDto } from '../api/dto';
import { retryExport } from '../api/exports';
import { keys } from './keys';

/**
 * Eksportowana, żeby dało się ją sprawdzić na PRAWDZIWYM `QueryClient` bez renderu -
 * „co ta mutacja unieważnia" jest własnością kluczy, nie ekranu, więc test na atrapie
 * sieci byłby testem atrapy, a test przez UI testowałby Reacta.
 */
export function invalidateAfterRetry(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: keys.exports.all });
  void qc.invalidateQueries({ queryKey: keys.sessions.all });
  void qc.invalidateQueries({ queryKey: keys.audit.all });
  void qc.invalidateQueries({ queryKey: keys.dashboard });
}

export function useRetryExport() {
  const qc = useQueryClient();
  return useMutation<ExportRetryResultDto, unknown, string>({
    mutationFn: (sessionUuid) => retryExport(sessionUuid),
    onSuccess: () => invalidateAfterRetry(qc),
  });
}
