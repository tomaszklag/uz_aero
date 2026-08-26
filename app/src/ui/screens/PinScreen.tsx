/**
 * UZ Aero — 00 ODBLOKOWANIE PIN (+ krok „Ustaw PIN" po logowaniu).
 *
 * Odwzorowanie mockupu `design/00-login.html`: znak marki → karta profilu → etykieta
 * i kropki → klawiatura → linki. Działa w 100% OFFLINE (§3.0: codzienne wejście nie
 * dotyka sieci) — weryfikacja to porównanie skrótów w magazynie.
 *
 * Ten sam ekran obsługuje USTAWIENIE PIN-u (status `pin_setup`): mockupy nie mają
 * osobnego widoku, a spec §3.0 mówi, że provisioning kończy się PIN-em — używamy więc
 * dokładnie tego samego układu z etykietami „Ustaw PIN" → „Powtórz PIN". Rozjazd
 * powtórki = odmowa jak przy złym PIN-ie i powrót do pierwszego kroku.
 *
 * Klawisz biometrii z mockupu (odcisk palca) jest ODŁOŻONY: wymaga natywnego
 * `expo-local-authentication` (przebudowa dev clienta) i decyzji produktowej —
 * slot w klawiaturze celowo stoi pusty, żeby układ się nie rozjechał.
 *
 * „Nie pamiętam PIN" = pełne ponowne logowanie (online). Przy niepustym outboxie
 * ścieżka jest ZABLOKOWANA (`.outbox-guard` z mockupu) — nowe logowanie mogłoby
 * podmienić pilota i osierocić niewysłane zdarzenia (§3.0).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  Brand,
  Icon,
  Numpad,
  OutboxGuard,
  PinDots,
  ProfileChip,
  Screen,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';

const PIN_LENGTH = 4;
/** Chwila, w której pilot widzi komplet kropek/odmowę, zanim ekran zareaguje. */
const FEEDBACK_MS = 250;

export function PinScreen() {
  const { theme } = useTheme();
  const status = useAuthStore((s) => s.status);
  const pilot = useAuthStore((s) => s.pilot);
  const unlock = useAuthStore((s) => s.unlock);
  const setPin = useAuthStore((s) => s.setPin);
  const requestRelogin = useAuthStore((s) => s.requestRelogin);
  const outboxCount = useSessionStore((s) => s.outboxCount);

  const setup = status === 'pin_setup';
  const [entry, setEntry] = useState('');
  const [firstPass, setFirstPass] = useState<string | null>(null);
  const [error, setError] = useState(0); // licznik, nie flaga — każda odmowa potrząsa od nowa
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const reject = useCallback(() => {
    setError((n) => n + 1);
    timer.current = setTimeout(() => {
      setEntry('');
      setError(0);
      setChecking(false);
    }, 600);
  }, []);

  const complete = useCallback(
    async (pin: string) => {
      setChecking(true);
      if (setup) {
        if (firstPass == null) {
          // Krok 1/2 zapamiętany — czyścimy kropki pod powtórkę.
          timer.current = setTimeout(() => {
            setFirstPass(pin);
            setEntry('');
            setChecking(false);
          }, FEEDBACK_MS);
          return;
        }
        if (firstPass === pin) {
          await setPin(pin); // bramka przechodzi na signed_in
          return;
        }
        setFirstPass(null);
        reject();
        return;
      }

      if (await unlock(pin)) return; // bramka przechodzi na signed_in
      reject();
    },
    [firstPass, reject, setPin, setup, unlock],
  );

  const onDigit = useCallback(
    (digit: string) => {
      if (checking || error > 0) return;
      setEntry((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === PIN_LENGTH) void complete(next);
        return next;
      });
    },
    [checking, complete, error],
  );

  const onBackspace = useCallback(() => {
    if (checking || error > 0) return;
    setEntry((prev) => prev.slice(0, -1));
  }, [checking, error]);

  const label = setup ? (firstPass == null ? 'Ustaw PIN' : 'Powtórz PIN') : 'Wpisz PIN';
  const reloginBlocked = outboxCount > 0;

  return (
    <Screen>
      <View style={styles.wrap}>
        <Brand tagline={false} style={styles.brand} />

        {pilot != null && <ProfileChip name={pilot.name} code={pilot.code} style={styles.profile} />}

        <AppText variant="micro" tone="muted" style={styles.label}>
          {label}
        </AppText>
        <PinDots filled={entry.length} length={PIN_LENGTH} error={error > 0} style={styles.dots} />

        <Numpad onDigit={onDigit} onBackspace={onBackspace} disabled={checking && error === 0} />

        {/* ── linki (`.links-row`) — tylko przy odblokowaniu ──────────────── */}
        {!setup && (
          <View style={styles.links}>
            <Pressable
              accessibilityRole="button"
              disabled={reloginBlocked}
              onPress={requestRelogin}
              // Mały `.link-item` jest z mockupu — hitSlop dociąga cel do progu rękawic
              // bez zmiany wyglądu.
              hitSlop={12}
              style={({ pressed }) => ({ opacity: reloginBlocked ? 0.5 : pressed ? 0.6 : 1 })}
            >
              <AppText
                variant="body"
                tone={reloginBlocked ? 'muted' : 'secondary'}
                style={styles.link}
              >
                Nie pamiętam PIN
              </AppText>
            </Pressable>

            {reloginBlocked ? (
              <OutboxGuard
                count={outboxCount}
                tail=" czeka na wysyłkę. Odblokuj PIN-em i poczekaj na synchronizację — inaczej dane dnia zostałyby bez właściciela."
                style={styles.guard}
              />
            ) : (
              <View style={styles.noteRow}>
                <Icon name="offline" size={10} color={theme.colors.textMuted} />
                <AppText variant="micro" tone="muted" style={styles.note}>
                  Pełne logowanie wymaga internetu
                </AppText>
              </View>
            )}
          </View>
        )}

        {/* Przypis „PIN odblokowuje aplikację bez sieci — zapamiętaj go" USUNIĘTY
            (issue #55 pkt 1): opisywał budowę aplikacji komuś, kto właśnie ustawia PIN —
            a mockup 00 takiego tekstu nigdy nie miał. */}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 24 },
  brand: { marginBottom: 26 },
  profile: { marginBottom: 26 },
  // `.pin-label` wyraźnie chce szersze światło niż token micro (2.5 vs 1.5) — override.
  label: { letterSpacing: 2.5, marginBottom: 14 },
  dots: { marginBottom: 30 },
  links: { marginTop: 26, alignItems: 'center', gap: 8 },
  link: { fontSize: 12 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  // `.links-note` jest o oczko mniejsza od mikro-etykiety (8 px) — reszta z `micro`.
  note: { fontSize: 8 },
  guard: { maxWidth: 290, marginTop: 4 },
});
