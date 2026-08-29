/**
 * UZ Aero - panel: MUTACJE kont pilotów (`A06`, `A06a`).
 *
 * **Mutacja deklaruje swoje unieważnienia TUTAJ, nie na ekranie**
 * (`docs/architektura-panelu-frontend.md` §4.3). Cztery operacje z tego pliku zmieniają
 * różne rzeczy, ale unieważniają ten sam zestaw - i lepiej, żeby ten zestaw miał jedno
 * miejsce, niż żeby cztery hooki pamiętały cztery listy.
 *
 * Co się zmienia po KAŻDEJ z nich:
 *  • **lista kont** - skład (nowe konto, zmiana statusu) i liczniki kafli; składu nie
 *    symulujemy na kliencie, bo wymagałoby to powtórzenia serwerowego filtrowania
 *    i sortowania, a po pierwszym filtrze różnica jest gwarantowana;
 *  • **dziennik audytu** - `AuditedWrite` dopisał wpis TĄ SAMĄ transakcją, więc ekran
 *    `A09` otwarty obok jest nieaktualny dokładnie od tej chwili;
 *  • **pulpit** - unieważnia go każda mutacja panelu, bo alternatywą jest plakietka
 *    kłamiąca zaraz po zmianie.
 *
 * Czego tu NIE MA:
 *  • **aktualizacji optymistycznych.** Serwer odmawia zmian, których panel nie umie
 *    przewidzieć („ostatni administrator", zajęty kod), więc optymistyczny UI musiałby
 *    się z tego wycofywać i tłumaczyć. Przycisk pokazuje stan zajęty, UI przyjmuje
 *    odpowiedź serwera.
 *  • **`setQueryData` z hasłem.** Hasło z odpowiedzi żyje w stanie SZUFLADY i ginie
 *    razem z nią. Wpisane do cache'u przeżyłoby nawigację, a to jest dokładnie to,
 *    czego „pokazane raz" ma nie robić.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { PilotChangeDto, PilotSecretDto } from '../api/dto';
import {
  createPilot,
  resetPilotPassword,
  setPilotActive,
  updatePilot,
  type CreatePilotBody,
  type UpdatePilotBody,
} from '../api/pilots';
import { keys } from './keys';

function invalidateAccounts(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: keys.pilots.all });
  void qc.invalidateQueries({ queryKey: keys.audit.all });
  void qc.invalidateQueries({ queryKey: keys.dashboard });
}

export function useCreatePilot() {
  const qc = useQueryClient();
  return useMutation<PilotSecretDto, unknown, CreatePilotBody>({
    mutationFn: (body) => createPilot(body),
    onSuccess: () => invalidateAccounts(qc),
  });
}

export interface UpdatePilotInput {
  id: string;
  body: UpdatePilotBody;
}

export function useUpdatePilot() {
  const qc = useQueryClient();
  return useMutation<PilotChangeDto, unknown, UpdatePilotInput>({
    mutationFn: ({ id, body }) => updatePilot(id, body),
    onSuccess: () => invalidateAccounts(qc),
  });
}

export interface SetActiveInput {
  id: string;
  active: boolean;
}

export function useSetPilotActive() {
  const qc = useQueryClient();
  return useMutation<PilotChangeDto, unknown, SetActiveInput>({
    mutationFn: ({ id, active }) => setPilotActive(id, active),
    onSuccess: () => {
      invalidateAccounts(qc);
      // Deaktywacja zrywa WSZYSTKIE sesje pilota - także tę, z której właśnie patrzysz,
      // jeśli deaktywowano konto, którym jesteś zalogowany. Serwer tego nie dopuszcza
      // (`self_deactivate`), ale drugi administrator już tak: wtedy `['me']` musi
      // dostać 401 i zaprowadzić na ekran logowania, zamiast zostawić martwy panel.
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useResetPilotPassword() {
  const qc = useQueryClient();
  return useMutation<PilotSecretDto, unknown, string>({
    mutationFn: (id) => resetPilotPassword(id),
    onSuccess: () => {
      invalidateAccounts(qc);
      // Reset zrywa sesje tak samo jak deaktywacja - łącznie z własną, gdy administrator
      // resetuje hasło sobie (ścieżka ratunkowa z A06a). Sesja PANELU jedzie osobnym
      // ciasteczkiem i przeżywa, ale `['me']` i tak warto sprawdzić.
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}
