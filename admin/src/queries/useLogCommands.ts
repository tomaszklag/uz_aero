/**
 * UZ Aero - panel 2.0: zapisy w dzienniku.
 *
 * Osobny plik od `useLog.ts`, którego nagłówek deklaruje „wszystkie są ODCZYTEM,
 * więc nie ma tu ani jednej mutacji" - i to zdanie zostaje prawdziwe. Dziennik dalej
 * się CZYTA; unieważnienie wpisu jest jedyną rzeczą, którą się w nim robi, więc
 * mieszka obok, a nie w środku.
 *
 * Mutacja deklaruje SWOJE unieważnienia tutaj, a nie na ekranie: dwa ekrany wołające
 * tę samą mutację nie mogą pamiętać dwóch różnych list.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { closeSession, voidSession } from '../api/log';
import { keys } from './keys';

/**
 * ZAKOŃCZENIE ADMINISTRACYJNE operacji osieroconej (issue #81), opcjonalnie z jej
 * unieważnieniem w tym samym ruchu.
 *
 * Unieważniamy DWA korzenie: dziennik (operacja zmienia status, wypada z „w toku")
 * i LISTĘ FLOTY - maszyna przestaje być zajęta, a to jest zwykle cały powód, dla
 * którego administrator tu przyszedł. Wynik mutacji do cache'u nie wchodzi, z tego
 * samego powodu, co przy unieważnieniu.
 */
export function useCloseSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uuid, reason, void: withVoid }: { uuid: string; reason: string; void: boolean }) =>
      closeSession(uuid, reason, withVoid),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.log.all });
      await qc.invalidateQueries({ queryKey: keys.fleet.lists });
    },
  });
}

/**
 * Unieważnienie CAŁEJ sesji.
 *
 * Czyścimy KORZEŃ dziennika, nie samą kartę sesji: wycofany wpis zmienia wszystkie trzy
 * poziomy modułu - znika z gridu maszyny i z sum floty w zakresie dat. Odpowiedź niesie
 * policzony stan sesji, ale do cache'u go NIE wpisujemy: karta czyta też oś zdarzeń
 * i plakietki, których odpowiedź mutacji nie ma - a wiersz złożony z połowy prawdy
 * wygląda dokładnie jak wiersz prawdziwy.
 */
export function useVoidSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uuid, reason }: { uuid: string; reason: string }) => voidSession(uuid, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.log.all }),
  });
}
