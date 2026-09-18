/**
 * Ninerdeck - 00A LOGOWANIE (pierwsze logowanie / provisioning urządzenia).
 *
 * Odwzorowanie mockupu `design/00a-login-full.html`: znak marki → JEDEN przycisk
 * „Kontynuuj z Google". Pól loginu i hasła nie ma - hasła zniknęły z produktu
 * 2026-09-04 (`docs/logowanie-google.md`), a tożsamości dowodzi konto Google.
 *
 * To JEDYNA czynność w aplikacji, która wymaga internetu (§3.0 - świadomy wyjątek od
 * offline-first): weryfikacja tożsamości na serwerze tworzy lokalny profil (tokeny
 * w Keystore). Brak sieci pokazujemy jako POWÓD przy próbie, nie jako blokadę ekranu -
 * pilot ma wiedzieć, co zrobić („zaloguj się przed wylotem w teren"), a nie zgadywać.
 * Wariant 00B (offline) jest więc STANEM tego ekranu po nieudanej próbie, nie osobnym
 * widokiem.
 *
 * Ekran nie tłumaczy, że pierwsze logowanie zakłada zgłoszenie czekające na
 * administratora - to prawda dla garstki pierwszych wejść, a dla wszystkich pozostałych
 * szum (reguła SyncChipa z issue #12). Mówi o tym ekran `00c`, gdy staje się faktem.
 *
 * Trzy wyniki logowania (profil / zgłoszenie / odmowa) rozstrzyga store: ten ekran
 * przekazuje mu wyłącznie token z Google albo powód, dla którego tokenu nie ma.
 *
 * ══ OD 2.1.0 DRUGI PRZYCISK: „ZALOGUJ SIĘ HASŁEM" (00F) ══
 * Napis powtarza tytuł ekranu, na który prowadzi - pilot ma widzieć, że trafił tam,
 * gdzie tapnął. „Nie pamiętam hasła" TU NIE STOI: ten link należy do formularza hasła,
 * bo tam pada pytanie.
 *
 * Gdy wdrożenie NIE MA klienta Google (`methods.google == null`), przycisk Google znika
 * W CAŁOŚCI, a hasło wchodzi na jego miejsce jako droga PIERWSZA - wyszarzonego przycisku
 * do konta, którego nie da się użyć, nie zostawiamy (zasada z 02G i 10B). Dopóki
 * odpowiedzi nie ma, stoją OBA: hasło jest znane lokalnie, a niedostępny odczyt nie ma
 * prawa odebrać drogi, która działa.
 */

import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton, Banner, Brand, GoogleButton, Screen } from '../components';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { useAuthStore } from '../store/authStore';
import type { GoogleSignInError } from './logic/googleSignInError';

export interface LoginScreenProps {
  /** „ZALOGUJ SIĘ HASŁEM" → 00F. */
  onPasswordLogin: () => void;
}

export function LoginScreen({ onPasswordLogin }: LoginScreenProps) {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const reportLoginFailure = useAuthStore((s) => s.reportLoginFailure);
  const busy = useAuthStore((s) => s.busy);
  const loginError = useAuthStore((s) => s.loginError);
  const methods = useAuthStore((s) => s.methods);
  const hasGoogle = methods == null || methods.google != null;

  const google = useGoogleSignIn(
    useCallback((idToken: string) => void loginWithGoogle(idToken), [loginWithGoogle]),
    useCallback((error: GoogleSignInError) => reportLoginFailure(error), [reportLoginFailure]),
  );

  return (
    <Screen>
      <View style={styles.wrap}>
        <Brand />

        {/* Przycisk gaśnie tylko na czas ładowania żądania (ułamek sekundy po
            starcie). Build BEZ identyfikatora klienta zostawia go czynnym - powód
            pada po tapnięciu jako zdanie, a nie jako wyszarzony przycisk bez słowa. */}
        {hasGoogle && (
          <GoogleButton
            onPress={() => void google.signIn()}
            busy={busy}
            disabled={google.available && !google.ready}
          />
        )}

        <ActionButton
          label="ZALOGUJ SIĘ HASŁEM"
          // Bez Google hasło JEST drogą główną, więc dostaje pełny zielony `solid`;
          // obok Google zostaje `.btn-secondary` z makiety - sam kontur, mniejszy napis.
          tone="green"
          variant={hasGoogle ? 'secondary' : 'solid'}
          size={hasGoogle ? 'md' : 'lg'}
          onPress={onPasswordLogin}
        />

        {loginError != null && (
          <Banner
            kind="warning"
            icon="warning"
            title="Nie zalogowano"
            text={loginError}
            style={styles.error}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: 24, paddingBottom: 40 },
  error: { marginTop: -8 },
});
