/**
 * UZ Aero — 00A LOGOWANIE (pierwsze logowanie / provisioning urządzenia).
 *
 * Odwzorowanie mockupu `design/00a-login-full.html`: znak marki → karta formularza
 * (login, hasło, przycisk) → informacja o wymogu sieci.
 *
 * To JEDYNA czynność w aplikacji, która wymaga internetu (§3.0 — świadomy wyjątek od
 * offline-first): weryfikacja tożsamości na serwerze tworzy lokalny profil (tokeny
 * w Keystore). Brak sieci pokazujemy jako POWÓD przy próbie, nie jako blokadę ekranu —
 * pilot ma wiedzieć, co zrobić („zaloguj się przed wylotem w teren"), a nie zgadywać.
 *
 * Konta zakłada administrator — nie ma rejestracji ani „przypomnij hasło" (decyzja
 * 2026-07-22); mówi o tym stała podpowiedź pod hasłem, słowami z mockupu.
 *
 * Wariant 00 (odblokowanie PIN-em przy istniejącym profilu) przyjdzie razem z ekranem
 * 01-splash — do tego czasu zalogowany profil wchodzi do aplikacji bezpośrednio.
 */

import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Brand,
  Screen,
  TextField,
} from '../components';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/authStore';

export function LoginScreen() {
  const { theme } = useTheme();

  const login = useAuthStore((s) => s.login);
  const busy = useAuthStore((s) => s.busy);
  const loginError = useAuthStore((s) => s.loginError);

  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');

  const submit = useCallback(() => {
    // Wynik ustawia store (`status` przełącza bramkę nawigacji); błąd ląduje
    // w `loginError` i baner niżej go pokaże — nigdy cicha odmowa (§6 pkt 3).
    void login(user.trim(), password);
  }, [login, user, password]);

  return (
    <Screen>
      <View style={styles.wrap}>
        {/* ── znak marki (`.brand`) ───────────────────────────────────── */}
        <Brand />

        {/* ── karta formularza (`.form-card`) ─────────────────────────── */}
        <View
          style={[
            styles.card,
            {
              borderWidth: theme.borderWidth,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <TextField
            label="Login"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="kod pilota albo e-mail"
            value={user}
            onChangeText={setUser}
          />

          <TextField
            label="Hasło"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            hint="Konto i reset hasła — u administratora"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />

          <ActionButton
            label="ZALOGUJ SIĘ"
            tone="green"
            variant="solid"
            busy={busy}
            disabledReason={
              user.trim().length === 0 || password.length === 0
                ? 'Wpisz login i hasło'
                : null
            }
            onPress={submit}
          />
        </View>

        {loginError != null && (
          <Banner
            kind="warning"
            icon="warning"
            title="Nie zalogowano"
            text={loginError}
            style={styles.error}
          />
        )}

        {/* Wymóg sieci — stała informacja, nie chowamy jej za błędem (§3.0). */}
        <AppText variant="mono" tone="muted" style={styles.netNote}>
          Pierwsze logowanie wymaga internetu — tworzy profil do pracy offline
        </AppText>
      </View>
    </Screen>
  );
}

const styles = {
  wrap: { flex: 1, justifyContent: 'center' as const, gap: 24, paddingBottom: 40 },
  card: { borderRadius: 20, padding: 20, gap: 14 },
  error: { marginTop: -8 },
  netNote: {
    fontSize: 9,
    letterSpacing: 1,
    textAlign: 'center' as const,
    textTransform: 'uppercase' as const,
    lineHeight: 14,
  },
};
