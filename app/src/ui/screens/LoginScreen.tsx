/**
 * UZ Aero - 00A LOGOWANIE (pierwsze logowanie / provisioning urządzenia).
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
 */

import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Brand, GoogleButton, Screen } from '../components';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { useAuthStore } from '../store/authStore';
import type { GoogleSignInError } from './logic/googleSignInError';

export function LoginScreen() {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const reportLoginFailure = useAuthStore((s) => s.reportLoginFailure);
  const busy = useAuthStore((s) => s.busy);
  const loginError = useAuthStore((s) => s.loginError);

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
        <GoogleButton
          onPress={() => void google.signIn()}
          busy={busy}
          disabled={google.available && !google.ready}
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
