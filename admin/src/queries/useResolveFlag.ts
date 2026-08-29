/**
 * UZ Aero - panel: rozstrzygnięcie flagi (`A03a`) - PIERWSZA MUTACJA panelu.
 *
 * **Mutacja deklaruje swoje unieważnienia TUTAJ, nie na ekranie**
 * (`docs/architektura-panelu-frontend.md` §4.3). Dwa ekrany wołające tę samą mutację
 * nie mogą pamiętać dwóch różnych list - to ta sama zasada, co „ekran nie definiuje
 * własnych kart".
 *
 * Rozstrzygnięcie zmienia DWA widoki naraz i to jest cały powód, dla którego lista
 * unieważnień jest dłuższa niż jedna pozycja: skrzynka traci sprawę ze składu,
 * a karta dnia - o ile flagą była nakładka sesji - właśnie się wyeksportowała
 * z nową rewizją. Panel, który odświeżyłby tylko skrzynkę, pokazywałby dzień
 * „bez arkusza" minutę po tym, jak arkusz powstał.
 *
 * **Bez aktualizacji optymistycznych.** Serwer używa optymistycznej współbieżności:
 * `resolve` na fladze już rozwiązanej wraca `409` ze stanem i komentarzem zwycięzcy.
 * Optymistyczny UI musiałby się z tego wycofywać i tłumaczyć - przycisk pokazuje
 * stan zajęty, a UI przyjmuje odpowiedź serwera.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ResolveFlagResultDto } from '../api/dto';
import { resolveFlag } from '../api/flags';
import { keys } from './keys';

export interface ResolveFlagInput {
  id: number;
  note: string;
}

export function useResolveFlag() {
  const qc = useQueryClient();

  return useMutation<ResolveFlagResultDto, unknown, ResolveFlagInput>({
    mutationFn: ({ id, note }) => resolveFlag(id, note),
    onSuccess: () => {
      // Skrzynka: zmienił się SKŁAD listy (sprawa wypada spod filtra „Otwarte")
      // i licznik w nawigacji. Składu nie symulujemy na kliencie - wymagałoby to
      // powtórzenia serwerowego filtrowania i sortowania, a po pierwszym filtrze
      // różnica jest gwarantowana.
      void qc.invalidateQueries({ queryKey: keys.flags.all });

      // Eksport i dni lotne: rozwiązanie nakładki sesji uruchamia re-eksport karty
      // dnia, więc kolumna „Arkusz" i monitor eksportu opisują od tej chwili inny
      // stan świata. Ekranów jeszcze nie ma - patrz komentarz przy kluczach.
      void qc.invalidateQueries({ queryKey: keys.exports.all });
      void qc.invalidateQueries({ queryKey: keys.sessions.all });

      // Dziennik audytu: `AuditedWrite` dopisał wpis TĄ SAMĄ transakcją, co zmianę -
      // więc ekran `A09` otwarty obok jest nieaktualny dokładnie od tej chwili.
      // Unieważnia go KAŻDA mutacja panelu, bo każda przechodzi tą samą bramą.
      void qc.invalidateQueries({ queryKey: keys.audit.all });

      // Pulpit unieważnia KAŻDA mutacja panelu: alternatywą jest plakietka „7 flag"
      // kłamiąca zaraz po zamknięciu sprawy, czyli dokładnie ten rodzaj cichego
      // rozjazdu, który panel ma wykrywać, a nie produkować.
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}
