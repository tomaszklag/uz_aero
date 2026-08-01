/**
 * UZ Aero — panel: ZAPIS korekty administratora (`A02b`) — druga mutacja panelu.
 *
 * **Mutacja deklaruje swoje unieważnienia TUTAJ, nie na ekranie**
 * (`docs/architektura-panelu-frontend.md` §4.3).
 *
 * ══ CO PRZESTAJE BYĆ PRAWDĄ PO KOREKCIE ══
 *  • **karta dnia** — zmieniły się liczby projekcji, oś zdarzeń dostała nowy wpis,
 *    a `exportRevision` skoczył o jeden;
 *  • **listy dni** — kolumny „Blok", „Czas lotu" i „Arkusz" opisują od tej chwili
 *    inny stan świata;
 *  • **eksporty** — doszła rewizja karty (ekran dopiero powstaje, patrz `keys.ts`);
 *  • **pulpit** — unieważnia go KAŻDA mutacja panelu.
 *
 * ══ CZEGO ŚWIADOMIE NIE UNIEWAŻNIAMY ══
 * **Flag.** Mockup `A02b` mówi to wprost: „Flaga CLOCK_DRIFT zostaje otwarta — zamyka
 * ją człowiek na A03". Korekta nie rozstrzyga rozbieżności, tylko poprawia liczbę;
 * odświeżanie skrzynki sugerowałoby, że coś się w niej zmieniło, a nie zmieniło się nic.
 *
 * **Podglądu.** Po zapisie ekran pokazuje SKUTEK z odpowiedzi serwera, a nie kolejny
 * dry-run — pytanie „co się stanie" przestało być aktualne, bo już się stało.
 *
 * Bez aktualizacji optymistycznych: korekta może zostać odrzucona przez domenę (422),
 * a wycofywanie się z pokazanych liczb dnia byłoby gorsze niż chwila czekania.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CorrectionDraftDto, CorrectionResultDto } from '../api/dto';
import { postCorrection } from '../api/corrections';
import { keys } from './keys';

export interface CorrectionInput {
  sessionUuid: string;
  draft: CorrectionDraftDto;
  reason: string;
}

export function useCorrection() {
  const qc = useQueryClient();

  return useMutation<CorrectionResultDto, unknown, CorrectionInput>({
    mutationFn: ({ sessionUuid, draft, reason }) => postCorrection(sessionUuid, draft, reason),
    onSuccess: () => {
      // Prefiks `['sessions']` obejmuje i listy, i kartę dnia — osobne unieważnienie
      // detalu byłoby powtórzeniem, a nie precyzją. `setQueryData` NIE wchodzi w grę:
      // odpowiedź niesie `state`, ale nie oś zdarzeń ani wiersza listy, więc sklejenie
      // karty z połowy danych byłoby zgadywaniem reszty.
      void qc.invalidateQueries({ queryKey: keys.sessions.all });
      void qc.invalidateQueries({ queryKey: keys.exports.all });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}
