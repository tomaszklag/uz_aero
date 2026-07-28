/**
 * UZ Aero — CardPicker (`.aircraft-option` / `.crew-option` z mockupu 02)
 *
 * Wybór z listy **kart**, nigdy natywnego selecta — twarda reguła projektu (`CLAUDE.md`):
 * na telefonie karty pokazują wszystkie opcje naraz wraz z kontekstem (typ samolotu,
 * blokada PIC, kod pilota), a select ukrywa je za jednym tapnięciem.
 *
 * Układ jest **jednowierszowy**, dokładnie jak w designie:
 *
 *   [awatar]  ETYKIETA ────────────  detal   [tagi]  [akcja]  (✓)
 *
 * Etykieta rozpycha wiersz, detal i tagi trzymają się prawej. Dwie linie tekstu na pozycję
 * rozciągnęłyby listę czterech samolotów na pół ekranu — a to pierwsza rzecz, którą pilot
 * widzi rano.
 *
 * Pozycja niedostępna ma **podany powód** (`disabledReason`) — nigdy wyszarzenie bez
 * wyjaśnienia (§6 pkt 3). Gdy powód mieści się w tagu (mockup: czerwone „Wyłączony"),
 * renderujemy tag; dłuższy powód idzie osobną linią. Cel dotykowy ≥ 56 px — rękawice.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { CheckIcon } from './CheckIcon';
import { Icon, type IconName } from './Icon';
import { Tag } from './Tag';
import { toneColors, type Tone } from './tone';

export interface PickerTag {
  label: string;
  tone?: Tone;
}

export interface PickerOption<T extends string> {
  value: T;
  /** Główna etykieta (np. „SP-AXA", „Anna Kowalska"). */
  label: string;
  /** Wartość po prawej: typ samolotu, kod pilota. Mono, przygaszona. */
  detail?: string;
  /** Awatar z inicjałami przed etykietą — lista pilotów. */
  avatarName?: string;
  /** Małe etykiety: blokada PIC, „wyłączony", „wymagany". */
  tags?: PickerTag[];
  /** Blokada wyboru z powodem; powód jest widoczny na karcie. */
  disabledReason?: string;
  /**
   * Czy pozycja ma akcję poboczną (mockup 02: „oko" tylko przy samolocie z cudzym
   * claimem). Bez tego pola przycisk pojawiałby się przy każdej pozycji listy —
   * podgląd read-only ma sens wyłącznie tam, gdzie jest co podglądać.
   */
  hasSecondary?: boolean;
  /** Gdy powód mieści się w tagu (np. „Wyłączony") — nie dublujemy go osobną linią. */
  disabledTagged?: boolean;
}

export interface CardPickerProps<T extends string> {
  options: PickerOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Akcja poboczna na karcie (mockup: „oko" → podgląd read-only zajętego samolotu). */
  onSecondary?: (value: T) => void;
  secondaryIcon?: IconName;
  secondaryLabel?: string;
  /** Etykieta mono nad listą, gdy lista stoi samodzielnie (bez `Card`). */
  style?: ViewStyle;
}

export function CardPicker<T extends string>({
  options,
  value,
  onChange,
  onSecondary,
  secondaryIcon = 'peek',
  secondaryLabel = 'Podgląd',
  style,
}: CardPickerProps<T>) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');

  return (
    <View style={[{ gap: 6 }, style]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const disabled = opt.disabledReason != null;
        const showReasonLine = disabled && opt.disabledTagged !== true;

        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityHint={opt.disabledReason}
            disabled={disabled}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.card,
              {
                minHeight: 56,
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: theme.radius.md,
                borderWidth: theme.borderWidth,
                borderColor: selected ? green.border : theme.colors.border,
                backgroundColor: selected ? green.muted : theme.colors.surfaceRaised,
                opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={styles.row}>
              {opt.avatarName != null && (
                <Avatar name={opt.avatarName} size="sm" tone={selected ? 'green' : 'neutral'} />
              )}

              <AppText
                variant="mono"
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: selected ? green.accent : theme.colors.textSecondary },
                ]}
              >
                {opt.label}
              </AppText>

              {opt.detail != null && (
                <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.detail}>
                  {opt.detail}
                </AppText>
              )}

              {opt.tags?.map((t) => (
                <Tag key={t.label} label={t.label} tone={t.tone ?? 'neutral'} />
              ))}

              {onSecondary != null && opt.hasSecondary === true && !disabled && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={secondaryLabel}
                  onPress={() => onSecondary(opt.value)}
                  hitSlop={8}
                  style={[
                    styles.secondary,
                    { borderColor: theme.colors.border, borderWidth: theme.borderWidth },
                  ]}
                >
                  <Icon name={secondaryIcon} size={13} color={theme.colors.textMuted} />
                </Pressable>
              )}

              {/* Znacznik wyboru — kółko z ptaszkiem (.aircraft-check). Sam zielony krążek
                  byłby sygnałem wyłącznie kolorystycznym; kształt działa też w słońcu,
                  w motywach jasnych i przy daltonizmie. Pozycja zablokowana go nie ma —
                  nie da się jej wybrać, więc puste kółko tylko myliłoby. */}
              {!disabled && (
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
              )}
            </View>

            {showReasonLine && (
              <AppText variant="mono" tone="amber" style={styles.reason}>
                {opt.disabledReason}
              </AppText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { justifyContent: 'center', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { flex: 1, fontSize: 15, letterSpacing: 2 },
  detail: { flexShrink: 1, fontSize: 10, letterSpacing: 0.5 },
  secondary: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reason: { fontSize: 9, letterSpacing: 0.5 },
});
