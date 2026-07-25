/**
 * UZ Aero — ActionButton
 *
 * Jeden przycisk na wszystkie akcje z mockupów, z trzema rzeczami, które w kokpicie
 * nie są ozdobnikiem:
 *
 *  1. **Przytrzymanie zamiast tapnięcia** (`holdMs`) — START/STOP ENGINE wymagają 2 s
 *     (§3.2). W wibracjach i rękawicach przypadkowe dotknięcie jest realne, a te dwie
 *     akcje wyznaczają czasy blokowe. Pasek postępu pokazuje, ile jeszcze trzymać.
 *  2. **Blokada z podanym powodem** (`disabledReason`) — zasada „nigdy cichy błąd"
 *     (§6 pkt 3). Powód renderujemy jako WIDOCZNY tekst, nie tooltip: `title` w RN
 *     nie istnieje, a pilot i tak nie ma czym najechać.
 *  3. **Cel dotykowy ≥ 44 px** — próg dla rękawic; wymuszony `minHeight`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tone';

export type ActionVariant = 'primary' | 'secondary';

export interface ActionButtonProps {
  label: string;
  onPress: () => void;
  tone?: Tone;
  variant?: ActionVariant;
  /** Podpis pod etykietą (np. „przytrzymaj 2 s", „zapisze odczyt MH"). */
  hint?: string;
  /** Ikona/element przed etykietą. */
  icon?: React.ReactNode;
  /** Czas przytrzymania (ms). 0 = zwykłe tapnięcie. */
  holdMs?: number;
  /** Blokada — wymaga podania powodu; powód jest pokazywany pod przyciskiem. */
  disabledReason?: string | null;
  /** Zajętość (trwa zapis) — blokuje bez komunikatu o błędzie. */
  busy?: boolean;
  style?: ViewStyle;
}

export function ActionButton({
  label,
  onPress,
  tone = 'green',
  variant = 'primary',
  hint,
  icon,
  holdMs = 0,
  disabledReason = null,
  busy = false,
  style,
}: ActionButtonProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const disabled = disabledReason != null || busy;

  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 120, useNativeDriver: false }).start();
  }, [progress]);

  useEffect(() => () => cancelHold(), [cancelHold]);

  const startHold = useCallback(() => {
    if (disabled) return;
    if (holdMs <= 0) {
      onPress();
      return;
    }
    setHolding(true);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      useNativeDriver: false,
    }).start();
    timer.current = setTimeout(() => {
      cancelHold();
      onPress();
    }, holdMs);
  }, [cancelHold, disabled, holdMs, onPress, progress]);

  const filled = variant === 'primary';

  return (
    <View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityHint={holdMs > 0 ? `Przytrzymaj ${Math.round(holdMs / 1000)} sekundy` : undefined}
        disabled={disabled}
        onPressIn={holdMs > 0 ? startHold : undefined}
        onPressOut={holdMs > 0 ? cancelHold : undefined}
        onPress={holdMs > 0 ? undefined : startHold}
        style={({ pressed }) => [
          styles.button,
          {
            minHeight: 56,
            gap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderRadius: theme.radius.lg,
            borderWidth: theme.borderWidth,
            borderColor: disabled ? theme.colors.border : c.border,
            backgroundColor: disabled
              ? theme.colors.surfaceHover
              : filled
                ? c.muted
                : 'transparent',
            opacity: disabled ? 0.45 : pressed && holdMs === 0 ? 0.7 : 1,
          },
        ]}
      >
        {/* Pasek postępu przytrzymania — wypełnia przycisk od lewej. */}
        {holding && (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: c.muted,
                width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              },
            ]}
          />
        )}

        <View style={styles.row}>
          {icon}
          <AppText
            variant="display"
            style={{ color: disabled ? theme.colors.textMuted : c.accent }}
          >
            {label}
          </AppText>
        </View>

        {hint != null && (
          <AppText variant="label" tone="muted">
            {hint}
          </AppText>
        )}
      </Pressable>

      {/* Powód blokady — widoczny tekst, nigdy cichy błąd (§6 pkt 3). */}
      {disabledReason != null && (
        <AppText variant="label" tone="amber" style={styles.reason}>
          {disabledReason}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { textAlign: 'center', marginTop: 6 },
});
