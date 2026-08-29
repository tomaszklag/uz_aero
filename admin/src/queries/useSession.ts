/**
 * UZ Aero - panel: hooki sesji (kto jestem, zaloguj, wyloguj).
 *
 * Mutacje deklarują SWOJE unieważnienia tutaj, a nie na ekranie
 * (`docs/architektura-panelu-frontend.md` §4.3): dwa ekrany wołające tę samą mutację
 * nie mogą pamiętać dwóch różnych list. Logowanie i wylogowanie zmieniają wszystko,
 * co panel wie o świecie, więc czyszczą cały cache - nie wybrane klucze.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PanelSessionDto } from '../api/dto';
import { isHttpError } from '../api/httpClient';
import { login, logout, me, type LoginInput } from '../api/session';
import { keys } from './keys';

/**
 * Sesja jako zapytanie, nie jako stan.
 *
 * Brak sesji jest POPRAWNĄ odpowiedzią (`null`), a nie błędem: 401 i 403 z `/me`
 * znaczą „nie jesteś zalogowany" i „to konto nie ma panelu" - oba prowadzą na ekran
 * logowania, żaden nie jest awarią. Zostawienie ich jako wyjątków dawałoby czerwony
 * baner błędu przy najzwyklejszym pierwszym wejściu na adres panelu.
 */
export function useSession() {
  return useQuery<PanelSessionDto | null>({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await me();
      } catch (error) {
        if (isHttpError(error) && (error.status === 401 || error.status === 403)) return null;
        throw error;
      }
    },
    // Tożsamość nie zmienia się w trakcie sesji; zmiany ogłaszają mutacje niżej.
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (session) => {
      // Odpowiedź logowania JEST sesją - wpisujemy ją wprost, zamiast dokładać
      // drugie żądanie `/me` i migotanie ekranu tuż po wejściu.
      qc.setQueryData(keys.me, session);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      // KOLEJNOŚĆ JEST ISTOTNA. Najpierw ogłaszamy koniec sesji - to ta zmiana
      // przenosi człowieka na ekran logowania.
      qc.setQueryData(keys.me, null);

      // Potem reszta cache'u do kosza: żadna wcześniej pobrana lista nie ma prawa
      // mignąć następnemu użytkownikowi tej przeglądarki.
      //
      // `removeQueries` z predykatem, a NIE `queryClient.clear()`: `clear()` usuwa
      // z cache'u także zapytanie `['me']`, na które patrzy zamontowany komponent -
      // a obserwator zostaje przy USUNIĘTYM obiekcie zapytania i nigdy nie dostaje
      // powiadomienia o nowej wartości. Skutek jest cichy i mylący: żądanie
      // wylogowania leci, ciasteczko znika, a panel dalej pokazuje ramę i nazwisko
      // wylogowanego. Wyłapane przy smoke teście w przeglądarce, nie przez typy.
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.me[0] });
    },
  });
}
