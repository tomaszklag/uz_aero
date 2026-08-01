/**
 * UZ Aero — panel: odczyt pulpitu (`A01`, `A01a`).
 *
 * Hook jest cienki z zasady — decyzja o treści ekranu mieszka w czystych modułach
 * `screens/pulpit/*.ts`. Tutaj zostaje wyłącznie to, co dotyczy cache'u.
 *
 * ══ `staleTime: 0` I TO JEST WYJĄTEK OD DOMYŚLNYCH 30 s ══
 * Domyślne 30 s w `queries/client.ts` istnieje po to, żeby seria wejść na tę samą listę
 * nie robiła burzy żądań. Pulpit odpowiada na pytanie „co się dzieje TERAZ", więc
 * powrót na niego z innego ekranu ma pokazać stan bieżący, a nie sprzed pół minuty —
 * inaczej administrator, który właśnie rozwiązał flagę i wrócił na pulpit, zobaczyłby
 * ten sam licznik co przed akcją i uznałby, że nic się nie stało.
 *
 * Klucz `keys.dashboard` jest bezparametrowy, bo pytanie jest jedno. Unieważnia go
 * KAŻDA mutacja panelu (§4.3) — deklarują to hooki mutacji, nie ekran.
 */

import { useQuery } from '@tanstack/react-query';

import { getDashboard } from '../api/dashboard';
import type { DashboardDto } from '../api/dto';
import { keys } from './keys';

export function useDashboard() {
  return useQuery<DashboardDto>({
    queryKey: keys.dashboard,
    queryFn: getDashboard,
    staleTime: 0,
  });
}
