/**
 * Ninerdeck - 00G „NIE PAMIĘTAM HASŁA" (makieta `design/00g-link-hasla.html`;
 * `docs/logowanie-haslem.md` D5, §5.4).
 *
 * DWA STANY JEDNEGO EKRANU: adres → potwierdzenie. Wariant nie jest osobnym ekranem,
 * bo to ta sama czynność przed i po.
 *
 * ══ NA TYM EKRANIE NIE MA ŻADNEGO POLA HASŁA ══
 * Nowe hasło ustawia się NA STRONIE z linku (§3.3): pilot na wspólnym tablecie czyta
 * pocztę na WŁASNYM telefonie, więc link musi działać wszędzie, gdzie działa poczta -
 * a nie otwierać aplikację na niewłaściwym urządzeniu. Kodu jednorazowego do przepisania
 * nie ma i nie będzie (decyzja właściciela 2026-09-16); administrator w panelu wysyła
 * TEN SAM list, więc ekran nie ma trzeciego stanu ani pola na kod.
 *
 * ══ POTWIERDZENIE PADA ZAWSZE, TAKŻE PO ODMOWIE SERWERA ══
 * Serwer odpowiada `202` dla adresu znanego i obcego, a `429` po wyczerpaniu limitu -
 * i jedno, i drugie kończy się tym samym zdaniem. Wyjątkiem jest wyłącznie BRAK SIECI:
 * „nie wiem, czy wysłano" to inna wiadomość niż „wysłano", więc wtedy zostajemy w polu
 * z powodem w przycisku.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton, AppText, Brand, LinkSent, Screen, StatusCard, TextField } from '../components';
import { useAuthStore } from '../store/authStore';
import {
  LINK_INTRO_TEXT,
  LINK_INTRO_TITLE,
  LINK_SENT_TEXT,
  LINK_SENT_TITLE,
  canSendLink,
} from './logic/forgotPassword';

export interface ForgotPasswordScreenProps {
  /** Adres z pola 00F - podstawiony, gdy pilot wpisał tam ADRES, a nie kod pilota. */
  initialEmail: string;
  onBack: () => void;
}

export function ForgotPasswordScreen({ initialEmail, onBack }: ForgotPasswordScreenProps) {
  const busy = useAuthStore((s) => s.busy);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);

  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const send = async (): Promise<void> => {
    setBlocked(null);
    if (await forgotPassword(email.trim())) setSent(true);
    else setBlocked('Wymaga internetu');
  };

  return (
    <Screen>
      <View style={styles.wrap}>
        <Brand tagline={false} style={styles.brand} />

        {sent ? (
          <LinkSent
            title={LINK_SENT_TITLE}
            text={LINK_SENT_TEXT}
            email={email.trim()}
            onBack={onBack}
          />
        ) : (
          <>
            {/* Karta NIEBIESKA - instrukcja, co się stanie, nie ostrzeżenie. Ekran ma
                prawo tłumaczyć tyle: gdzie trafi link i co z nim zrobić (issue #72). */}
            <StatusCard
              icon="link"
              title={LINK_INTRO_TITLE}
              body={LINK_INTRO_TEXT}
              tone="blue"
              style={styles.card}
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
              // Pusty adres blokuje BEZ zdania - widać go z pola nad przyciskiem.
              disabled={!canSendLink(email)}
              disabledReason={blocked ?? undefined}
              onPress={() => void send()}
            />

            {/* Wyjście MUSI być: kto tapnął tu przez pomyłkę, wraca bez wysyłania. */}
            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              hitSlop={12}
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
            >
              <AppText variant="body" tone="muted" style={styles.linkText}>
                Wróć do logowania
              </AppText>
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingBottom: 40 },
  brand: { marginBottom: 26 },
  card: { marginBottom: 14 },
  field: { marginBottom: 12 },
  link: { alignSelf: 'center', marginTop: 16 },
  linkText: { fontSize: 12.5 },
});
