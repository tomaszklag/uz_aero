/**
 * Ninerdeck - PRZEŁĄCZNIK SEGMENTOWY (`.seg`; makieta 30 „Do mnie / Zlecone").
 *
 * Segment, a nie para chipów: chip ZAWĘŻA listę (można nie zapalić żadnego), a segment
 * ROZSTRZYGA, o co pyta ekran - dokładnie jedna połowa jest zawsze włączona. Zaznaczenie
 * jest ODWRÓCONE (jasne tło, ciemny napis), jak wybrany dzień w kalendarzu - mówi
 * „tu jesteś", a nie „to jest w normie".
 *
 * Liczba przy pozycji stoi wyłącznie wtedy, gdy wołający ją poda - kiedy (przy pozycji
 * niewłączonej, wyłącznie dodatnia) rozstrzyga logika ekranu, nie ten komponent.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
  /** Liczba przy pozycji; `null` = nie stoi. */
  count?: number | null;
  /** Błękit przy tym, co pyta CIEBIE; neutralny przy stanie cudzej decyzji. */
  countTone?: 'blue' | 'neutral';
}

export interface SegmentedControlProps<K extends string> {
  options: readonly SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
}

export function SegmentedControl<K extends string>({ options, value, onChange }: SegmentedControlProps<K>) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.seg} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option.key === value;
        const blue = option.countTone === 'blue';
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.count != null ? `${option.label}, ${option.count}` : option.label}
            onPress={() => {
              if (!on) onChange(option.key);
            }}
            style={[s.btn, on && s.btnOn]}
          >
            <AppText variant="mono" style={[s.label, on && s.labelOn]}>
              {option.label.toUpperCase()}
            </AppText>
            {option.count != null && (
              <View style={[s.count, blue && s.countBlue]}>
                <AppText variant="mono" style={[s.countText, blue && s.countTextBlue]}>
                  {option.count}
                </AppText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    seg: {
      flexDirection: 'row',
      gap: 4,
      padding: 3,
      borderRadius: 13,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    btn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      minHeight: 40,
      borderRadius: 10,
    },
    btnOn: { backgroundColor: t.colors.textPrimary },
    label: { fontSize: 9.5, letterSpacing: 1.5, color: t.colors.textSecondary },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    labelOn: { color: t.colors.bg, fontFamily: t.fontFamily.monoBold },
    count: {
      minWidth: 17,
      height: 17,
      paddingHorizontal: 5,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      borderColor: t.colors.borderStrong,
    },
    countBlue: { backgroundColor: t.colors.blueMuted, borderColor: t.colors.blueBorder },
    countText: { fontFamily: t.fontFamily.monoBold, fontSize: 9, letterSpacing: 0, color: t.colors.textSecondary },
    countTextBlue: { color: t.colors.blue },
  });
