/**
 * Ninerdeck - 00H „ZAŁÓŻ KONTO" (makieta `design/00h-zaloz-konto.html`;
 * `docs/logowanie-haslem.md` §5.4a; D9 odwrócone 2026-09-17).
 *
 * Rejestracja e-mailem to TEN SAM mechanizm, co zapomniane hasło: imię, nazwisko i adres
 * → list z linkiem → hasło ustawia się na stronie, i DOPIERO WTEDY powstaje osoba. Adres
 * jest przez to potwierdzony samym kliknięciem, jak `email_verified` u Google.
 *
 * Czego tu NIE MA: pola hasła (ustawia je strona z linku) ani kodu klubu - dołączanie
 * jest osobnym krokiem (00E) i osobną decyzją administratora. Bramką zostaje BRAK
 * CZŁONKOSTWA, nie sposób założenia konta: rejestracja niczego w klubie nie omija.
 *
 * Osoba z kontem Google nie zakłada tu drugiego konta - loguje się Googlem (00A),
 * a hasło ustawia potem w ustawieniach (13B) albo linkiem z 00G.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton, AppText, Brand, LinkSent, Screen, StatusCard, TextField } from '../components';
import { useAuthStore } from '../store/authStore';
import {
  SIGNUP_INTRO_TEXT,
  SIGNUP_INTRO_TITLE,
  SIGNUP_SENT_TEXT,
  SIGNUP_SENT_TITLE,
  canSignUp,
  normalizeName,
} from './logic/signUp';

export interface SignUpScreenProps {
  /** Adres z pola 00F - podstawiony, gdy pilot wpisał tam ADRES, a nie kod pilota. */
  initialEmail: string;
  /** „Mam już konto - zaloguj się" → 00F. */
  onBack: () => void;
  /** „Masz konto Google? Zaloguj się nim" → 00A. */
  onGoogle: () => void;
}

export function SignUpScreen({ initialEmail, onBack, onGoogle }: SignUpScreenProps) {
  const busy = useAuthStore((s) => s.busy);
  const signUp = useAuthStore((s) => s.signUp);

  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const send = async (): Promise<void> => {
    setBlocked(null);
    if (await signUp(normalizeName(name), email.trim())) setSent(true);
    else setBlocked('Wymaga internetu');
  };

  return (
    <Screen>
      <View style={styles.wrap}>
        <Brand tagline={false} style={styles.brand} />

        {sent ? (
          <LinkSent
            title={SIGNUP_SENT_TITLE}
            text={SIGNUP_SENT_TEXT}
            email={email.trim()}
            onBack={onBack}
          />
        ) : (
          <>
            {/* Karta NIEBIESKA - instrukcja: gdzie trafi link, co z nim zrobić i że klub
                przychodzi potem. Nic o tokenach ani o tym, kto wysyła (issue #72). */}
            <StatusCard
              icon="signup"
              title={SIGNUP_INTRO_TITLE}
              body={SIGNUP_INTRO_TEXT}
              tone="blue"
              style={styles.card}
            />

            {/* Imię i nazwisko - jedyna rzecz, której serwer nie ma skąd wziąć.
                U osoby z Google przychodzi z profilu; tutaj nie ma innego źródła. */}
            <TextField
              label="Imię i nazwisko"
              value={name}
              onChangeText={setName}
              placeholder="imię i nazwisko"
              autoCapitalize="words"
              autoComplete="name"
              style={styles.field}
            />

            <TextField
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              placeholder="adres e-mail"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              spellCheck={false}
              style={styles.field}
            />

            <ActionButton
              label="WYŚLIJ LINK"
              tone="green"
              variant="solid"
              busy={busy}
              // Puste pole blokuje BEZ zdania - widać je nad przyciskiem (issue #55).
              disabled={!canSignUp(name, email)}
              disabledReason={blocked ?? undefined}
              onPress={() => void send()}
            />

            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              hitSlop={12}
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
            >
              <AppText variant="body" tone="muted" style={styles.linkText}>
                Mam już konto - zaloguj się
              </AppText>
            </Pressable>
          </>
        )}
      </View>

      {!sent && (
        <View style={styles.foot}>
          <Pressable
            accessibilityRole="button"
            onPress={onGoogle}
            hitSlop={12}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <AppText variant="body" tone="muted" style={styles.linkText}>
              Masz konto Google? Zaloguj się nim
            </AppText>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center' },
  brand: { marginBottom: 26 },
  card: { marginBottom: 14 },
  field: { marginBottom: 12 },
  link: { alignSelf: 'center', marginTop: 16 },
  linkText: { fontSize: 12.5 },
  foot: { alignItems: 'center', paddingBottom: 10 },
});
