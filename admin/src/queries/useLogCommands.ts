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

import { voidSession } from '../api/log';
import { keys } from './keys';

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
