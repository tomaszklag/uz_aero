/**
 * Ninerdeck - panel: hooki sesji (kto jestem, zaloguj, wyloguj).
 *
 * Mutacje deklarują SWOJE unieważnienia tutaj, a nie na ekranie
 * (`docs/architektura-panelu-frontend.md` §4.3): dwa ekrany wołające tę samą mutację
 * nie mogą pamiętać dwóch różnych list. Logowanie i wylogowanie zmieniają wszystko,
 * co panel wie o świecie, więc czyszczą cały cache - nie wybrane klucze.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PanelSessionDto } from '../api/dto';
import { isHttpError } from '../api/httpClient';
import {
  changePassword,
  forgotPassword,
  login,
  loginWithPassword,
  logout,
  me,
  methods,
  myAccount,
  mySessions,
  revokeMySession,
  signUp,
  switchScope,
  type ChangePasswordInput,
  type LoginInput,
  type PasswordLoginInput,
  type SignUpInput,
} from '../api/session';
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

/**
 * Metody logowania tego wdrożenia (2.1.0) - pytanie zadawane PRZED sesją.
 *
 * `staleTime: Infinity`, jak przy identyfikatorze klienta: to konfiguracja serwera,
 * a nie dane, więc w trakcie życia strony nie ma jak się zmienić.
 */
export function useAuthMethods() {
  return useQuery({
    queryKey: keys.authMethods,
    queryFn: () => methods(),
    staleTime: Infinity,
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

/**
 * Logowanie hasłem - kończy się dokładnie tam, gdzie Google, więc i tutaj odpowiedź
 * JEST sesją. Dwie mutacje zamiast jednej z wariantem, bo mają różne ciała i różne
 * odmowy; wspólne jest wyłącznie to, co dzieje się PO sukcesie.
 */
export function usePasswordLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PasswordLoginInput) => loginWithPassword(input),
    onSuccess: (session) => {
      qc.setQueryData(keys.me, session);
    },
  });
}

/**
 * „Nie pamiętam hasła". Bez unieważnień: ta mutacja niczego w panelu nie zmienia -
 * wysyła list i tyle. Powodzenie znaczy WYŁĄCZNIE „serwer przyjął prośbę", bo
 * odpowiedź jest ta sama dla adresu znanego i nieznanego.
 */
export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => forgotPassword(email) });
}

/**
 * „Załóż konto" (issue #180) - ta sama natura, co wyżej: list i tyle, niczego w panelu
 * nie zmienia, więc bez unieważnień. Osoba powstaje dopiero na stronie z linku.
 */
export function useSignUp() {
  return useMutation({ mutationFn: (input: SignUpInput) => signUp(input) });
}

/** Moje konto: adres i metody logowania (`#/konto`, karta „Logowanie"). */
export function useMyAccount() {
  return useQuery({ queryKey: keys.account.profile, queryFn: () => myAccount() });
}

/** Moje urządzenia - wszystkie powierzchnie i kluby tej osoby. */
export function useMySessions() {
  return useQuery({ queryKey: keys.account.sessions, queryFn: () => mySessions() });
}

/**
 * Ustawienie albo zmiana hasła.
 *
 * Unieważnia CAŁY korzeń konta, bo zapis zmienia OBIE jego części naraz: dokłada
 * metodę („hasło") i gasi pozostałe sesje. Lista urządzeń skróci się dzięki temu sama -
 * a to jest właśnie ta rzecz, którą ekran obiecuje pod przyciskiem.
 */
export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => changePassword(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.account.all });
    },
  });
}

/** „Wyloguj" przy wierszu własnego urządzenia. */
export function useRevokeMySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => revokeMySession(sessionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.account.sessions });
    },
  });
}

/**
 * Przełączenie zakresu sesji (issue #101, E2): `orgId` = klub, `null` = platforma.
 *
 * Czyści cache DOKŁADNIE tak samo jak wylogowanie i z tego samego powodu: po zmianie
 * klubu każda pobrana lista opisuje inny świat, a wiersz cudzego dziennika, który
 * mignąłby przed odświeżeniem, byłby wyciekiem między klubami - tym samym, przed którym
 * broni cały epik C. Kolejność też jest ta sama: najpierw nowa sesja (to ona przestawia
 * ramę), potem reszta do kosza.
 */
export function useSwitchScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string | null) => switchScope(orgId),
    onSuccess: (session) => {
      qc.setQueryData(keys.me, session);
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.me[0] });
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
