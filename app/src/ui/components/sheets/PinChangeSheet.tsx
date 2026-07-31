/**
 * UZ Aero — PinChangeSheet (arkusz „Zmień PIN" z mockupu 13)
 *
 * Trzy kroki w jednym arkuszu: obecny PIN → nowy → powtórz. W pełni OFFLINE (§3.0:
 * PIN sprawdzany lokalnie). Odmowa (zły obecny PIN albo rozjazd powtórki) mówi tym
 * samym językiem co zamek 00: czerwone kropki + potrząśnięcie, i cofa do właściwego
 * kroku — bez tekstów błędów, które zdradzałyby więcej, niż trzeba.
 *
 * Auto-zatwierdzanie po 4. cyfrze — jak na zamku; osobny przycisk „Zatwierdź" byłby
 * drugim ruchem kciuka bez żadnej dodatkowej informacji.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { sheetBottomPad } from '../hooks/keyboardGeometry';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Numpad } from './Numpad';
import { PinDots } from './PinDots';

const PIN_LENGTH = 4;
/** Chwila na zobaczenie kompletu kropek, zanim arkusz przejdzie do następnego kroku. */
const FEEDBACK_MS = 250;

type Step = 'current' | 'next' | 'repeat';

const STEP_LABEL: Record<Step, string> = {
  current: 'Wpisz obecny PIN',
  next: 'Ustaw nowy PIN',
  repeat: 'Powtórz nowy PIN',
};

export interface PinChangeSheetProps {
  visible: boolean;
  /** Weryfikacja obecnego PIN-u (krok 1) — offline, bez zapisu. */
  verifyCurrent: (pin: string) => Promise<boolean>;
  /** Zapis pary obecny→nowy po zgodnej powtórce (krok 3). */
  save: (current: string, next: string) => Promise<void>;
  /** Wołane po udanym zapisie — ekran pokazuje potwierdzenie i chowa arkusz. */
  onDone: () => void;
  onCancel: () => void;
}

export function PinChangeSheet({
  visible,
  verifyCurrent,
  save,
  onDone,
  onCancel,
}: PinChangeSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('current');
  const [entry, setEntry] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [firstPass, setFirstPass] = useState<string | null>(null);
  const [error, setError] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Każde otwarcie zaczyna od czystego kroku 1 — arkusz nie pamięta porzuconej próby.
  useEffect(() => {
    if (!visible) return;
    setStep('current');
    setEntry('');
    setCurrent(null);
    setFirstPass(null);
    setError(0);
    setBusy(false);
  }, [visible]);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const advance = useCallback((to: Step) => {
    timer.current = setTimeout(() => {
      setStep(to);
      setEntry('');
      setBusy(false);
    }, FEEDBACK_MS);
  }, []);

  const reject = useCallback((backTo: Step) => {
    setError((n) => n + 1);
    timer.current = setTimeout(() => {
      setStep(backTo);
      setEntry('');
      setFirstPass((prev) => (backTo === 'next' ? null : prev));
      setError(0);
      setBusy(false);
    }, 600);
  }, []);

  const complete = useCallback(
    async (pin: string) => {
      setBusy(true);
      if (step === 'current') {
        if (await verifyCurrent(pin)) {
          setCurrent(pin);
          advance('next');
        } else {
          reject('current');
        }
        return;
      }
      if (step === 'next') {
        setFirstPass(pin);
        advance('repeat');
        return;
      }
      if (firstPass === pin && current != null) {
        await save(current, pin);
        onDone();
        return;
      }
      // Rozjazd powtórki — nowy PIN ustawiamy od początku.
      reject('next');
    },
    [advance, current, firstPass, onDone, reject, save, step, verifyCurrent],
  );

  const onDigit = useCallback(
    (digit: string) => {
      if (busy || error > 0) return;
      setEntry((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === PIN_LENGTH) void complete(next);
        return next;
      });
    },
    [busy, complete, error],
  );

  const onBackspace = useCallback(() => {
    if (busy || error > 0) return;
    setEntry((prev) => prev.slice(0, -1));
  }, [busy, error]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={[styles.overlay, { backgroundColor: theme.colors.overlay }]} onPress={onCancel} accessibilityLabel="Zamknij" />

      <View style={styles.bottom}>
        <View
          style={{
            alignItems: 'center',
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            // 26 dp z mockupu jako podłoga; nad paskiem nawigacji arkusz ustępuje więcej
            // (`sheetBottomPad`). PIN wpisuje się własnym numpadem, nie klawiaturą systemu.
            paddingBottom: sheetBottomPad(26, insets.bottom, 0, theme.spacing.lg),
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            borderTopWidth: theme.borderWidthStrong,
            borderTopColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />

          <AppText variant="display" style={styles.title}>
            ZMIEŃ PIN
          </AppText>

          <AppText variant="mono" tone="muted" style={styles.step}>
            {STEP_LABEL[step]}
          </AppText>
          <PinDots filled={entry.length} length={PIN_LENGTH} error={error > 0} />

          <Numpad onDigit={onDigit} onBackspace={onBackspace} disabled={busy && error === 0} />

          {/* `.sheet-offline-note` — zmiana PIN-u nie dotyka sieci, mówimy to wprost. */}
          <View style={styles.noteRow}>
            <Icon name="check" size={10} color={theme.colors.green} />
            <AppText variant="mono" style={[styles.note, { color: theme.colors.green }]}>
              Działa w 100% offline
            </AppText>
          </View>

          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
            <AppText variant="mono" tone="secondary" style={styles.cancelLabel}>
              ANULUJ
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  bottom: { justifyContent: 'flex-end' },
  handle: { width: 36, height: 4, borderRadius: 2 },
  title: { fontSize: 23, letterSpacing: 2, alignSelf: 'flex-start' },
  step: { fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase' },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  note: { fontSize: 8.5, letterSpacing: 0.8 },
  cancel: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  cancelLabel: { fontSize: 11, letterSpacing: 1 },
});
