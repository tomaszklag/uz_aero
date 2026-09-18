/**
 * Ninerdeck - 00F LOGOWANIE HASŁEM (makieta `design/00f-login-haslo.html`;
 * `docs/logowanie-haslem.md` §5.1, D2, D4, D10).
 *
 * DRUGA droga logowania TEJ SAMEJ osoby - dla WSPÓLNEGO TABLETU w samolocie. Ten, kto
 * leci, loguje się na swoje konto; Google na cudzym urządzeniu znaczyłoby dodanie
 * własnego konta do cudzej przeglądarki, więc na tablecie pierwszą drogą jest hasło.
 * Na telefonie osobistym Google zostaje pierwszym przyciskiem (00A), a tu wchodzi się
 * z drugiego.
 *
 * Ekran KOŃCZY SIĘ DOKŁADNIE TAM, GDZIE GOOGLE: aktywne członkostwo → aplikacja, brak
 * klubu → 00C/00D/00E. Decyduje o tym store, bo od chwili ustalenia osoby jedzie wspólny
 * rdzeń serwera - tu nie ma ani drugiego wyboru klubu, ani drugiej bramki.
 *
 * ══ JEDNO POLE NA DWA IDENTYFIKATORY ══
 * E-mail jest jedynym globalnym identyfikatorem osoby, a kod pilota działa wyłącznie
 * w klubie, który urządzenie zna - dwa osobne pola pytałyby o rzeczy, z których pilot
 * wpisuje jedną. Rozstrzyga sam napis (`logic/passwordLogin.ts`).
 *
 * ══ EKRAN NIE TŁUMACZY, JAK JEST ZBUDOWANY ══
 * Ani słowa o tokenach, sesjach czy o tym, że hasło sprawdza serwer (issue #72). Tytuł
 * powtarza napis przycisku, który tu prowadzi - pilot ma widzieć, że trafił tam, gdzie
 * tapnął. O klubie ekran mówi WYŁĄCZNIE wtedy, gdy urządzenie zna więcej niż jeden.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton, AppText, Brand, Icon, PasswordField, Screen, TextField } from '../components';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/authStore';
import { canChangeClub, deviceClubPill } from './logic/deviceClubs';
import { canSubmitLogin, normalizeLogin } from './logic/passwordLogin';

export interface PasswordLoginScreenProps {
  /** „Nie pamiętam hasła" → 00G; adres z pola jedzie tam jako wartość początkowa. */
  onForgotPassword: (email: string) => void;
  /** „Nie masz konta? Załóż konto" → 00H. */
  onSignUp: () => void;
  /** „Zmień klub" → 00I. Wołane wyłącznie wtedy, gdy wejście w ogóle stoi. */
  onChangeClub: () => void;
  /** „Zaloguj kontem Google" → 00A. */
  onGoogle: () => void;
}

export function PasswordLoginScreen({
  onForgotPassword,
  onSignUp,
  onChangeClub,
  onGoogle,
}: PasswordLoginScreenProps) {
  const { theme } = useTheme();
  const busy = useAuthStore((s) => s.busy);
  const device = useAuthStore((s) => s.device);
  const loginWithPassword = useAuthStore((s) => s.loginWithPassword);

  // Wpis i odpowiedź serwera to stan LOKALNY ekranu - nie przeżywa wyjścia i nie ma po co.
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const club = deviceClubPill(device);

  const submit = async (): Promise<void> => {
    setError(null);
    setBlocked(null);
    const notice = await loginWithPassword(normalizeLogin(login), password);
    // POLA NIE CZYŚCIMY i hasła NIE ODSŁANIAMY (makieta 00F): pilot poprawia literówkę,
    // a nie pisze od nowa; „pokaż" zostaje jego decyzją.
    setError(notice.fieldError);
    setBlocked(notice.blockReason);
  };

  return (
    <Screen>
      <View style={styles.wrap}>
        <Brand tagline={false} style={styles.brand} />

        {/* Pigułka klubu urządzenia - TYLKO gdy urządzenie zna więcej niż jeden klub.
            Nazwa mówi sama, w którym klubie zadziała kod pilota; zdania o tym nie ma. */}
        {club != null && (
          <View
            style={[
              styles.club,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Icon name="club" size={13} color={theme.colors.textMuted} />
            <AppText variant="body" tone="secondary" style={styles.clubName}>
              {club}
            </AppText>
          </View>
        )}

        <AppText variant="display" style={styles.heading}>
          ZALOGUJ SIĘ HASŁEM
        </AppText>

        {/* Klawiatura e-mail (ma „@" i kropkę), bez autokapitalizacji - kod pilota
            normalizuje się do wersalików dopiero przy wysyłce, a nie pod palcem. */}
        <TextField
          label="E-mail albo kod pilota"
          value={login}
          onChangeText={(raw) => {
            setLogin(raw);
            setError(null);
          }}
          error={error}
          placeholder="adres e-mail albo kod pilota"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          spellCheck={false}
          style={styles.field}
        />

        <PasswordField
          label="Hasło"
          value={password}
          onChangeText={(raw) => {
            setPassword(raw);
            setError(null);
          }}
          placeholder="hasło"
          autoComplete="current-password"
          textContentType="password"
          style={styles.field}
        />

        <ActionButton
          label="ZALOGUJ"
          tone="green"
          variant="solid"
          busy={busy}
          // Pusty formularz blokuje BEZ zdania (issue #55): blokadę widać z pól nad
          // przyciskiem. Zdanie zostaje dla braku sieci i limitu prób.
          disabled={!canSubmitLogin(login, password)}
          disabledReason={blocked ?? undefined}
          onPress={() => void submit()}
        />

        <LinkOut label="Nie pamiętam hasła" onPress={() => onForgotPassword(login.trim())} />
      </View>

      {/* Stopka = WYJŚCIA POZA FORMULARZ. Rejestracja mocniej, bo to jedyna droga osoby
          bez konta; „Zmień klub" wyłącznie przy więcej niż jednym znanym klubie. */}
      <View style={styles.foot}>
        <Pressable
          accessibilityRole="button"
          onPress={onSignUp}
          hitSlop={12}
          style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
        >
          <AppText variant="body" tone="muted" style={styles.linkText}>
            Nie masz konta?{' '}
            <AppText variant="body" style={styles.signUp}>
              Załóż konto
            </AppText>
          </AppText>
        </Pressable>

        <View style={styles.footRow}>
          {canChangeClub(device) && (
            <>
              <LinkOut label="Zmień klub" onPress={onChangeClub} inline />
              <AppText variant="body" tone="muted" style={styles.dot}>
                ·
              </AppText>
            </>
          )}
          <LinkOut label="Zaloguj kontem Google" onPress={onGoogle} inline />
        </View>
      </View>
    </Screen>
  );
}

/** `.link-out` z makiety - wyjście poza formularz; nigdy przycisk akcji. */
function LinkOut({
  label,
  onPress,
  inline = false,
}: {
  label: string;
  onPress: () => void;
  inline?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [
        inline ? undefined : styles.link,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <AppText variant="body" tone="muted" style={styles.linkText}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center' },
  brand: { marginBottom: 20 },
  club: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  clubName: { fontSize: 12, fontFamily: 'Archivo_600SemiBold' },
  heading: { fontSize: 22, letterSpacing: 2.5, lineHeight: 24, marginBottom: 14 },
  field: { marginBottom: 12 },
  link: { alignSelf: 'center', marginTop: 16 },
  linkText: { fontSize: 12.5 },
  signUp: { fontSize: 12.5, fontFamily: 'Archivo_600SemiBold' },
  foot: { alignItems: 'center', gap: 14, paddingBottom: 10 },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { fontSize: 12 },
});
