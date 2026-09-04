/**
 * UZ Aero - „Kontynuuj z Google" na telefonie (`docs/logowanie-google.md` §9).
 *
 * JEDYNE miejsce aplikacji, które zna `expo-auth-session` i `expo-web-browser`.
 * Ekran logowania dostaje trzy rzeczy: czy przepływ jest w ogóle skonfigurowany, czy
 * jest gotowy, i funkcję startu - a token tożsamości ORAZ niepowodzenia wracają
 * callbackami, bo tak wracają z dostawcy (patrz niżej).
 *
 * ══ PRZEZ PRZEGLĄDARKĘ SYSTEMOWĄ, BEZ NATYWNEGO SDK GOOGLE ══
 * `expo-auth-session` otwiera Custom Tab i wraca własnym schematem adresu. Dla klienta
 * Google typu ANDROID ten schemat MUSI być pakietem aplikacji
 * (`com.tomekklag.uzaero:/oauthredirect` - dostawca składa go z `Application.applicationId`),
 * dlatego `scheme` w `app.json` niesie pakiet. Kontrakt serwera jest ten sam, co przy
 * natywnym SDK (token tożsamości Google), więc podmiana to później decyzja o UX.
 *
 * ══ KOD + PKCE, NIE `id_token` WPROST ══
 * Na Androidzie dostawca żąda KODU i wymienia go sam (PKCE, bez sekretu klienta) -
 * token tożsamości jest w wyniku wymiany. Wynik ten przychodzi STANEM (`response`),
 * nie z obietnicy `promptAsync` (ta rozwiązuje się wcześniej, jeszcze z kodem). Stąd
 * efekt nad `response` i strażnik czasu: nieudanej wymiany dostawca nie zgłasza nigdzie
 * (odrzucona obietnica w jego efekcie), więc bez strażnika pilot patrzyłby na „Logowanie…"
 * bez końca.
 *
 * ══ `nonce` SPRAWDZA TEN KOD, NIE SERWER ══
 * Dostawca dokłada nonce do żądania i weryfikuje go po powrocie - to jest właściwa
 * strona tej kontroli (§7 dokumentu decyzji: serwer nie zna wartości, którą wygenerował
 * telefon).
 */

import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef } from 'react';

import { GoogleSignInError } from '../screens/logic/googleSignInError';

// Domyka okno przeglądarki po powrocie schematem - musi zostać wywołane przy imporcie
// modułu, zanim jakikolwiek ekran się zamontuje (wymóg `expo-web-browser`).
WebBrowser.maybeCompleteAuthSession();

/**
 * Identyfikator klienta Google typu ANDROID (`app/.env.example`; do builda EAS -
 * `eas.json` → `build.production.env`). Wklejany przez Expo w chwili bundlowania,
 * więc jest STAŁĄ tej wersji aplikacji - stąd `available` jako własność buildu.
 */
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';

/** Tyle czekamy na wymianę kodu, zanim uznamy ją za nieudaną. */
const EXCHANGE_TIMEOUT_MS = 20_000;

export interface GoogleSignIn {
  /** `false` = build bez identyfikatora klienta; `signIn` zgłosi wtedy `unavailable`. */
  available: boolean;
  /** Żądanie autoryzacji przygotowane (PKCE, discovery) - przycisk może działać. */
  ready: boolean;
  signIn: () => Promise<void>;
}

export function useGoogleSignIn(
  onIdToken: (idToken: string) => void,
  onFailure: (error: GoogleSignInError) => void,
): GoogleSignIn {
  const available = ANDROID_CLIENT_ID !== '';

  // Dostawca rzuca przy BRAKU identyfikatora - podstawiamy zaślepkę, żeby ekran się
  // zamontował, a brak konfiguracji był ZDANIEM po tapnięciu (§6 pkt 3), nie crashem.
  const clientId = available ? ANDROID_CLIENT_ID : 'brak-konfiguracji';
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: clientId,
    clientId,
    scopes: ['openid', 'email', 'profile'],
  });

  // Callbacki przez ref: efekt nad `response` ma reagować na NOWY wynik, a nie na
  // nową tożsamość funkcji z kolejnego renderu ekranu.
  const callbacks = useRef({ onIdToken, onFailure });
  callbacks.current = { onIdToken, onFailure };

  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWatchdog = (): void => {
    if (watchdog.current != null) clearTimeout(watchdog.current);
    watchdog.current = null;
  };
  useEffect(() => clearWatchdog, []);

  // Ten sam obiekt wyniku nie ma prawa zostać obsłużony dwa razy (StrictMode w dev
  // montuje efekty podwójnie) - a KAŻDE tapnięcie daje nowy obiekt, więc porównanie
  // tożsamości wystarcza.
  const handled = useRef<unknown>(null);
  useEffect(() => {
    if (response == null || handled.current === response) return;

    if (response.type === 'success') {
      const idToken =
        response.authentication?.idToken ??
        (response.params as { id_token?: string }).id_token ??
        '';
      if (idToken !== '') {
        handled.current = response;
        clearWatchdog();
        callbacks.current.onIdToken(idToken);
      } else if (response.authentication != null) {
        // Wymiana przeszła, ale bez tokenu tożsamości - zakres `openid` nie zadziałał.
        handled.current = response;
        clearWatchdog();
        callbacks.current.onFailure(new GoogleSignInError('failed'));
      }
      // Bez `authentication`: wynik SPRZED wymiany - czekamy na następny (strażnik pilnuje).
      return;
    }

    handled.current = response;
    clearWatchdog();
    callbacks.current.onFailure(
      new GoogleSignInError(
        response.type === 'cancel' || response.type === 'dismiss' ? 'cancelled' : 'failed',
      ),
    );
  }, [response]);

  const signIn = useCallback(async (): Promise<void> => {
    if (!available) {
      callbacks.current.onFailure(new GoogleSignInError('unavailable'));
      return;
    }
    if (request == null) return; // jeszcze się ładuje - przycisk jest wtedy wygaszony

    const result = await promptAsync();
    if (result.type === 'success') {
      clearWatchdog();
      watchdog.current = setTimeout(() => {
        watchdog.current = null;
        callbacks.current.onFailure(new GoogleSignInError('failed'));
      }, EXCHANGE_TIMEOUT_MS);
    }
    // Pozostałe wyniki (anulowanie, błąd) obsłuży efekt nad `response` - dostawca
    // ustawia go tym samym obiektem, więc nie ma jak zgłosić ich dwa razy.
  }, [available, request, promptAsync]);

  return { available, ready: request != null, signIn };
}
