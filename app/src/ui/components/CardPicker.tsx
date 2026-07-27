/**
 * UZ Aero — CardPicker
 *
 * Wybór z listy **kart**, nigdy natywnego selecta — to twarda reguła projektu
 * (`CLAUDE.md`): na telefonie karty pokazują wszystkie opcje naraz wraz z kontekstem
 * (typ samolotu, kod pilota, tag „wyłączony"), a select ukrywa je za jednym tapnięciem.
 *
 * Używany do wyboru samolotu, drugiego pilota i rodzaju operacji.
 *
 * Opcja niedostępna ma **podany powód** (`disabledReason`) — nigdy wyszarzenie bez
 * wyjaśnienia (§6 pkt 3). Cel dotykowy ≥ 56 px, bo pilot wybiera w rękawicach.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { CheckIcon } from './CheckIcon';
import { toneColors, type Tone } from './tone';

export interface PickerOption<T extends string> {
  value: T;
  /** Główna etykieta (np. „SP-AXA", „Anna Kowalska"). */
  label: string;
  /** Druga linia: kontekst (np. „Cessna 182 · 2019"). */
  detail?: string;
  /** Znacznik po prawej (np. kod pilota, „PIC: KRZ od 07:10"). */
  badge?: string;
  /** Ton znacznika — amber dla zajętych, red dla wyłączonych. */
  badgeTone?: Tone;
  /** Blokada wyboru z powodem; powód jest pokazywany na karcie. */
  disabledReason?: string;
}

export interface CardPickerProps<T extends string> {
  options: PickerOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Dodatkowa akcja na karcie (np. „Podgląd" dla zajętego samolotu). */
  onSecondary?: (value: T) => void;
  secondaryLabel?: string;
  style?: ViewStyle;
}

export function CardPicker<T extends string>({
  options,
  value,
  onChange,
  onSecondary,
  secondaryLabel,
  style,
}: CardPickerProps<T>) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');

  return (
    <View style={[{ gap: theme.spacing.sm }, style]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const disabled = opt.disabledReason != null;
        const badge = opt.badge != null ? toneColors(theme, opt.badgeTone ?? 'neutral') : null;

        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.card,
              {
                minHeight: 56,
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: theme.borderWidth,
                borderColor: selected ? green.border : theme.colors.border,
                backgroundColor: selected ? green.muted : theme.colors.surfaceRaised,
                opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={styles.main}>
              <View style={styles.texts}>
                <AppText variant="mono" style={{ color: selected ? green.accent : theme.colors.textPrimary }}>
                  {opt.label}
                </AppText>
                {opt.detail != null && (
                  <AppText variant="label" tone="muted">
                    {opt.detail}
                  </AppText>
                )}
                {opt.disabledReason != null && (
                  <AppText variant="label" tone="amber">
                    {opt.disabledReason}
                  </AppText>
                )}
              </View>

              {badge != null && (
                <View
                  style={{
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: 4,
                    borderRadius: theme.radius.sm,
                    borderWidth: theme.borderWidth,
                    borderColor: badge.border,
                    backgroundColor: badge.muted,
                  }}
                >
                  <AppText variant="label" style={{ color: badge.accent }}>
                    {opt.badge}
                  </AppText>
                </View>
              )}

              {/* Znacznik wyboru — kółko z ptaszkiem, jak w mockupach (.aircraft-check).
                  Sam zielony krążek nie wystarcza: kolor jest sygnałem słabym (rękawice,
                  słońce, motywy jasne, daltonizm), ptaszek jest jednoznaczny kształtem. */}
              <View
                style={[
                  styles.check,
                  {
                    borderColor: selected ? green.accent : theme.colors.border,
                    backgroundColor: selected ? green.accent : 'transparent',
                  },
                ]}
              >
                {selected && <CheckIcon size={12} color={theme.colors.bg} />}
              </View>
            </View>

            {onSecondary != null && secondaryLabel != null && opt.disabledReason == null && (
              <Pressable
                accessibilityRole="button"
                onPress={() => onSecondary(opt.value)}
                hitSlop={8}
                style={{ alignSelf: 'flex-start' }}
              >
                <AppText variant="label" tone="blue">
                  {secondaryLabel}
                </AppText>
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { justifyContent: 'center' },
  main: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  texts: { flex: 1, gap: 2 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
