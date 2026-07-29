/**
 * UZ Aero — CorrectionSheet (mockup 04c „Korekta zdarzenia")
 *
 * Arkusz korekty nad logiem dnia: karta korygowanego zdarzenia, czas z krokiem
 * minutowym, wiersze odniesienia (metoda wykrycia, wpływ na czasy), wyjaśnienie modelu
 * append-only i — pod separatorem — akcja destrukcyjna „TEGO … NIE BYŁO".
 *
 * Dwie decyzje wprost z architektury:
 *  • Korekta NICZEGO nie kasuje — zapisuje osobne zdarzenie, oryginał zostaje. Baner
 *    pouczający mówi to pilotowi raz (potem zwija się do „Jak to działa?" przy tytule).
 *  • Unieważnienie stoi POD separatorem i w konturze czerwieni: to inna decyzja niż
 *    poprawka czasu i nie może być o jeden nieuważny kciuk od „Zapisz".
 *
 * Czas edytujemy krokami ±1 min (wzorzec z 05f), nie polem tekstowym z mockupu —
 * ta sama czynność ma w aplikacji jedną formę, a stepper wygrał tam audyt rękawic.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { useEduBanner } from '../store/eduBanners';
import { AppText } from './AppText';
import { ActionButton } from './ActionButton';
import { Banner } from './Banner';
import { Icon, type IconName } from './Icon';
import { Tag } from './Tag';
import { toneColors } from './tone';

export interface CorrectionRef {
  label: string;
  value: string;
}

export interface CorrectionSheetProps {
  visible: boolean;
  /** Nazwa zdarzenia z kontekstem („Landing · Lot 1"). */
  eventLabel: string;
  eventIcon?: IconName;
  /** Pierwotny czas zdarzenia (ms) — punkt odniesienia delty. */
  originalTime: number;
  /** Badge pochodzenia („auto · GPS" / „ręcznie"); null = bez badge'a. */
  methodBadge?: string | null;
  /** Wiersze odniesienia dla bieżąco ustawionego czasu — w tym wpływ na czasy. */
  refsFor: (newTime: number) => CorrectionRef[];
  formatTime: (t: number) => string;
  /** Górna granica czasu (zwykle „teraz") — korekta w przyszłość to przepowiednia. */
  maxTime: number;
  /** Napis akcji destrukcyjnej („TEGO LĄDOWANIA NIE BYŁO"). */
  voidLabel: string;
  voidHint: string;
  busy?: boolean;
  onSave: (newTime: number) => void;
  onVoid: () => void;
  onCancel: () => void;
}

/** Zakres korekty czasu (min) — dalej niż godzina to nie korekta, tylko inne zdarzenie. */
const MAX_SHIFT_MIN = 60;

export function CorrectionSheet({
  visible,
  eventLabel,
  eventIcon = 'landing',
  originalTime,
  methodBadge,
  refsFor,
  formatTime,
  maxTime,
  voidLabel,
  voidHint,
  busy = false,
  onSave,
  onVoid,
  onCancel,
}: CorrectionSheetProps) {
  const { theme } = useTheme();
  const blue = toneColors(theme, 'blue');
  const green = toneColors(theme, 'green');

  const [offsetMin, setOffsetMin] = useState(0);
  const [eduDismissed, setEduDismissed] = useEduBanner('correction-append');

  // Każde otwarcie startuje od czasu pierwotnego — arkusz nie pamięta porzuconej edycji.
  useEffect(() => {
    if (visible) setOffsetMin(0);
  }, [visible, originalTime]);

  const newTime = originalTime + offsetMin * 60_000;
  const source = methodBadge != null && methodBadge.startsWith('auto') ? 'odczytu GPS' : 'wpisu';

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
            gap: 13,
            paddingHorizontal: theme.spacing.lg + 2,
            paddingTop: theme.spacing.lg + 2,
            paddingBottom: 30,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            borderTopWidth: theme.borderWidth,
            borderTopColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />

          {/* Tytuł + zwinięte „Jak to działa?" (mockup: `.help-reopen` przy tytule). */}
          <View style={styles.titleRow}>
            <AppText variant="display" style={styles.title}>
              KOREKTA ZDARZENIA
            </AppText>
            {eduDismissed && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pokaż wyjaśnienie, jak działa korekta"
                onPress={() => setEduDismissed(false)}
                hitSlop={8}
                style={[
                  styles.helpChip,
                  {
                    borderRadius: theme.radius.pill,
                    borderWidth: theme.borderWidth,
                    borderColor: blue.border,
                    backgroundColor: blue.muted,
                  },
                ]}
              >
                <Icon name="info" size={11} color={blue.accent} />
                <AppText variant="mono" style={[styles.helpLabel, { color: blue.accent }]}>
                  Jak to działa?
                </AppText>
              </Pressable>
            )}
          </View>

          {/* Karta korygowanego zdarzenia (`.evt-card`). */}
          <View
            style={[
              styles.eventCard,
              {
                borderRadius: 14,
                borderWidth: theme.borderWidth,
                borderColor: blue.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Icon name={eventIcon} size={18} color={blue.accent} />
            <View style={styles.eventBody}>
              <AppText variant="label">{eventLabel}</AppText>
              <AppText variant="mono" tone="muted" style={styles.eventMeta}>
                {`zapisano ${formatTime(originalTime)} UTC`}
              </AppText>
            </View>
            {methodBadge != null && <Tag label={methodBadge} tone="blue" />}
          </View>

          {/* Czas zdarzenia — kroki minutowe, wzorzec z 05f. */}
          <View style={{ gap: 5 }}>
            <AppText variant="mono" tone="muted" style={styles.fieldLabel}>
              Czas zdarzenia (UTC)
            </AppText>
            <View
              style={[
                styles.timeRow,
                {
                  borderRadius: 14,
                  borderWidth: theme.borderWidth,
                  borderColor: green.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <MinuteButton
                label="−1 min"
                disabled={offsetMin <= -MAX_SHIFT_MIN}
                onPress={() => setOffsetMin((o) => o - 1)}
              />
              <AppText
                variant="mono"
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontFamily: theme.fontFamily.monoBold,
                  fontSize: 30,
                  lineHeight: 34,
                  letterSpacing: 2,
                  color: theme.colors.textPrimary,
                }}
              >
                {formatTime(newTime)}
              </AppText>
              <MinuteButton
                label="+1 min"
                disabled={offsetMin >= MAX_SHIFT_MIN || newTime + 60_000 > maxTime}
                onPress={() => setOffsetMin((o) => o + 1)}
              />
            </View>
            <AppText variant="mono" tone="amber" style={styles.delta}>
              {offsetMin === 0
                ? `Bez zmiany względem ${source} (${formatTime(originalTime)})`
                : `Zmiana o ${offsetMin > 0 ? '+' : '−'}${Math.abs(offsetMin)} min względem ${source} (${formatTime(originalTime)})`}
            </AppText>
          </View>

          {/* Wiersze odniesienia — w tym wpływ na czasy, przeliczany na bieżąco. */}
          {refsFor(newTime).map((ref) => (
            <View key={ref.label} style={styles.refRow}>
              <AppText variant="mono" tone="muted" style={styles.refText}>
                {ref.label}
              </AppText>
              <AppText variant="mono" tone="secondary" style={styles.refText}>
                {ref.value}
              </AppText>
            </View>
          ))}

          <Banner
            kind="edu"
            tone="blue"
            icon="info"
            text={
              'Korekta nie kasuje historii — zapisujemy osobne zdarzenie korygujące, oryginalny ' +
              'odczyt zostaje w rejestrze. Serwer scali obie wersje i pokaże poprawkę w arkuszu.'
            }
            collapsedLabel="Jak to działa?"
            dismissed={eduDismissed}
            // Mini-chip renderujemy przy tytule, nie w miejscu banera — stąd pusty render
            // po zwinięciu: dwa „Jak to działa?" na jednym arkuszu by się dublowały.
            onDismiss={setEduDismissed}
            style={eduDismissed ? styles.hidden : undefined}
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <ActionButton
              label="ANULUJ"
              tone="neutral"
              variant="secondary"
              size="md"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <ActionButton
              label="ZAPISZ KOREKTĘ"
              tone="green"
              variant="solid"
              size="md"
              busy={busy}
              disabledReason={offsetMin === 0 ? 'Zmień czas albo użyj akcji poniżej' : null}
              onPress={() => onSave(newTime)}
              style={{ flex: 2 }}
            />
          </View>

          {/* Strefa destrukcyjna — oddzielona, w konturze czerwieni (`.btn-void`). */}
          <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
          <ActionButton
            label={voidLabel}
            tone="red"
            variant="secondary"
            size="md"
            busy={busy}
            icon="warning"
            onPress={onVoid}
          />
          <AppText variant="mono" tone="muted" style={styles.voidHint}>
            {voidHint}
          </AppText>
        </View>
      </View>
    </Modal>
  );
}

function MinuteButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.minuteButton,
        {
          borderRadius: 13,
          borderWidth: theme.borderWidth,
          borderColor: pressed ? green.border : theme.colors.borderStrong,
          backgroundColor: pressed ? green.muted : theme.colors.surfaceRaised,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <AppText variant="mono" style={{ fontSize: 13, color: theme.colors.textPrimary }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 22, lineHeight: 24, letterSpacing: 2 },
  helpChip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 11 },
  helpLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  eventCard: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 12 },
  eventBody: { flex: 1, gap: 2 },
  eventMeta: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  fieldLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  // 46 px — próg rękawic, wspólny z 05e/05f.
  minuteButton: { width: 66, height: 46, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  delta: { fontSize: 9, letterSpacing: 0.5, marginTop: 5, minHeight: 13 },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  refText: { fontSize: 10, letterSpacing: 0.5 },
  separator: { height: 1, marginTop: 3, marginBottom: 1 },
  voidHint: { fontSize: 8.5, letterSpacing: 0.8, lineHeight: 14, textAlign: 'center' },
  hidden: { display: 'none' },
});
