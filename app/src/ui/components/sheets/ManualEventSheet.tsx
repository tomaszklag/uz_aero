/**
 * UZ Aero — ManualEventSheet (mockup 05f „Zapisz ręcznie")
 *
 * Arkusz ręcznego zapisu startu albo lądowania: wybór typu, czas z krokiem minutowym
 * i informacja, że wpis zostanie oznaczony jako ręczny.
 *
 * To jest **ratunek na fałszywą detekcję**, a nie droga na skróty. §8 klasyfikuje
 * pomyłki GPS klasy konsumenckiej jako ryzyko czerwone: przelot nad pasem bywa uznany
 * za lądowanie, ciasny zakręt gubi start, a przy braku wysokości automat świadomie nie
 * zgaduje lądowania. Bez tego arkusza taka pomyłka kończyłaby się błędnym wpisem
 * w rejestrze — a jego korekta jest trudniejsza niż zapis od razu.
 *
 * Dwie rzeczy są tu celowe:
 *  • **Czas da się cofnąć**, i to jest domyślny kierunek — pilot orientuje się po fakcie,
 *    więc krok „−1 min" jest równie ważny jak „+1 min". Podpis mówi wprost, ile czasu
 *    minęło od wskazanej chwili.
 *  • **Metoda `manual` trafia do zdarzenia** i jest widoczna w statystykach oraz arkuszu.
 *    Dane z pomiaru i dane z pamięci pilota muszą się dać odróżnić po fakcie.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { sheetBottomPad } from '../hooks/keyboardGeometry';
import { useEduBanner } from '../store/eduBanners';
import { AppText } from './AppText';
import { ActionButton } from './ActionButton';
import { Banner } from './Banner';
import { Icon, type IconName } from './Icon';
import { InlineNote } from './InlineNote';
import { toneColors } from './tone';

export type ManualEventType = 'takeoff' | 'landing';

export interface ManualEventSheetProps {
  visible: boolean;
  /** Typ podpowiadany na wejściu — wynika z tego, czy samolot jest w powietrzu. */
  initialType: ManualEventType;
  /** „Teraz" w milisekundach — punkt odniesienia dla kroków czasu. */
  now: number;
  /** Sformatowanie czasu zdarzenia do wyświetlenia (UTC). */
  formatTime: (t: number) => string;
  busy?: boolean;
  onConfirm: (type: ManualEventType, at: number) => void;
  onCancel: () => void;
}

const TYPES: { value: ManualEventType; label: string; icon: IconName }[] = [
  { value: 'takeoff', label: 'TAKEOFF', icon: 'takeoff' },
  { value: 'landing', label: 'LANDING', icon: 'landing' },
];

/** Ile minut wstecz wolno cofnąć wpis — dalej niż godzina to już nie „po fakcie". */
const MAX_BACK_MIN = 60;

export function ManualEventSheet({
  visible,
  initialType,
  now,
  formatTime,
  busy = false,
  onConfirm,
  onCancel,
}: ManualEventSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const amber = toneColors(theme, 'amber');

  const [type, setType] = useState<ManualEventType>(initialType);
  /** Przesunięcie w minutach względem „teraz"; ujemne = w przeszłość. */
  const [offsetMin, setOffsetMin] = useState(0);
  // Trwale per pilot — inaczej wyjaśnienie wracałoby przy każdym otwarciu arkusza.
  const [eduDismissed, setEduDismissed] = useEduBanner('manual-entry');

  // Każde otwarcie zaczyna od „teraz" i typu wynikającego ze stanu lotu.
  useEffect(() => {
    if (!visible) return;
    setType(initialType);
    setOffsetMin(0);
  }, [visible, initialType]);

  const at = now + offsetMin * 60_000;
  const minutesAgo = Math.max(0, -offsetMin);

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
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            // Zapas z mockupu jako podłoga; nad paskiem nawigacji arkusz ustępuje więcej
            // (`sheetBottomPad`). Arkusz nie ma pól tekstowych — klawiatura go nie dotyczy.
            paddingBottom: sheetBottomPad(theme.spacing.xxl + 2, insets.bottom, 0, theme.spacing.lg),
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            borderTopWidth: theme.borderWidthStrong,
            borderTopColor: amber.border,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />

          <AppText variant="display" style={[styles.title, { color: amber.accent }]}>
            ZAPISZ RĘCZNIE
          </AppText>
          <AppText variant="body" tone="secondary" style={styles.lead}>
            GPS nie wykrył zdarzenia albo wykrył je za późno. Zapisz je sam — czas możesz
            cofnąć, jeśli orientujesz się po fakcie.
          </AppText>

          {/* Wybór typu — duże karty, bo to decyzja podejmowana jednym spojrzeniem. */}
          <View style={styles.typeGrid}>
            {TYPES.map((option) => {
              const selected = option.value === type;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setType(option.value)}
                  style={({ pressed }) => [
                    styles.typeCard,
                    {
                      borderRadius: theme.radius.btn,
                      borderWidth: theme.borderWidth,
                      borderColor: selected ? amber.border : theme.colors.border,
                      backgroundColor: selected ? amber.muted : theme.colors.surface,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Icon
                    name={option.icon}
                    size={20}
                    color={selected ? amber.accent : theme.colors.textSecondary}
                  />
                  <AppText
                    variant="display"
                    style={[
                      styles.typeLabel,
                      { color: selected ? amber.accent : theme.colors.textSecondary },
                    ]}
                  >
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Czas — kroki minutowe, cel 46 px (rękawice). */}
          <View
            style={[
              styles.timeBlock,
              {
                borderRadius: theme.radius.btn,
                borderWidth: theme.borderWidth,
                borderColor: amber.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <AppText variant="mono" tone="muted" style={styles.timeLabel}>
              Czas zdarzenia (UTC)
            </AppText>

            <View style={styles.timeRow}>
              <MinuteButton
                label="−1 min"
                onPress={() => setOffsetMin((o) => Math.max(-MAX_BACK_MIN, o - 1))}
                disabled={offsetMin <= -MAX_BACK_MIN}
              />
              <AppText
                variant="mono"
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontFamily: theme.fontFamily.monoBold,
                  fontSize: 32,
                  lineHeight: 36,
                  letterSpacing: 2,
                  color: theme.colors.textPrimary,
                }}
              >
                {formatTime(at)}
              </AppText>
              <MinuteButton
                label="+1 min"
                onPress={() => setOffsetMin((o) => Math.min(0, o + 1))}
                // W przyszłość nie da się zapisać zdarzenia, które jeszcze nie zaszło.
                disabled={offsetMin >= 0}
              />
            </View>

            <AppText variant="mono" style={[styles.delta, { color: amber.accent }]}>
              {minutesAgo === 0
                ? 'teraz'
                : `${minutesAgo} min temu — tyle trwało, zanim zauważyłeś`}
            </AppText>
          </View>

          <Banner
            kind="edu"
            tone="blue"
            icon="info"
            text={
              'Wpis zostanie oznaczony jako ręczny — w statystykach i arkuszu widać, ' +
              'które zdarzenia pochodzą z GPS, a które od pilota.'
            }
            collapsedLabel="Wpis ręczny — co to znaczy?"
            dismissed={eduDismissed}
            onDismiss={setEduDismissed}
          />

          <View style={{ flexDirection: 'row', gap: 9 }}>
            <ActionButton
              label="ANULUJ"
              tone="neutral"
              variant="secondary"
              size="md"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <ActionButton
              label="ZAPISZ"
              tone="amber"
              variant="solid"
              size="md"
              busy={busy}
              icon="check"
              onPress={() => onConfirm(type, at)}
              style={{ flex: 2 }}
            />
          </View>

          <InlineNote icon="offline" tone="amber" text="Zapis lokalny — działa bez zasięgu" />
        </View>
      </View>
    </Modal>
  );
}

function MinuteButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');

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
          // Mockup 05f daje `.step-btn` promień 13 — znormalizowany do kanonu
          // `radius.btn`; dryf 13/14 ubity celowo, wzorem `colors.overlay`.
          borderRadius: theme.radius.btn,
          borderWidth: theme.borderWidth,
          borderColor: pressed ? amber.border : theme.colors.borderStrong,
          backgroundColor: pressed ? amber.muted : theme.colors.surfaceRaised,
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
  title: { fontSize: 23, lineHeight: 25, letterSpacing: 2 },
  lead: { fontSize: 12, lineHeight: 18 },
  typeGrid: { flexDirection: 'row', gap: 9 },
  typeCard: {
    flex: 1,
    minHeight: 74,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 15,
  },
  typeLabel: { fontSize: 19, lineHeight: 21, letterSpacing: 2 },
  timeBlock: { gap: 9, paddingHorizontal: 14, paddingVertical: 12 },
  timeLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // 46 px — ten sam próg dla rękawic co w `CounterRow` i `Stepper`.
  minuteButton: { width: 66, height: 46, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  delta: { fontSize: 10, letterSpacing: 0.5, textAlign: 'center', minHeight: 14 },
});
