/**
 * Ninerdeck - ChoiceCards (`.state-opt` i `.addr-opt` z makiety 31B; zlecenia 4.0.0).
 *
 * Rząd kart wyboru jednej wartości - stan fotela („Ja / Szukam / Brak") i sposób
 * adresowania („Osoba · imiennie" / „Grupa · lub kilka osób"). Lista kart, nigdy natywny
 * select (reguła design systemu); zaznaczona = zielona obramówka.
 *
 * Karta z podpisem (`sub`) układa się do lewej, z ikoną przed tytułem - podpis rozstrzyga
 * niejednoznaczność słowa („Grupa" obejmuje też kilka osób wybranych po nazwisku); bez
 * podpisu karta jest wyśrodkowana, jak przełącznik stanu.
 *
 * NIEDOSTĘPNA karta (`disabled`) jest przygaszona i NIE ŁAPIE DOTYKU - to brak akcji,
 * a nie przycisk z powodem (zasada z 22 i 02G). Powód stoi tam, gdzie mówi o właściwości
 * maszyny: w plakietce przy nagłówku karty fotela.
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';

export interface ChoiceCard<T extends string> {
  value: T;
  label: string;
  /** „imiennie", „lub kilka osób" - właściwość karty, monospacingiem pod tytułem. */
  sub?: string;
  icon: IconName;
  disabled?: boolean;
}

export interface ChoiceCardsProps<T extends string> {
  options: readonly ChoiceCard<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ChoiceCards<T extends string>({ options, value, onChange }: ChoiceCardsProps<T>) {
  const { theme } = useTheme();
  const s = styles(theme);
  const withSub = options.some((o) => o.sub != null);

  return (
    <View style={s.row}>
      {options.map((option) => {
        const on = option.value === value;
        const disabled = option.disabled === true;
        const tint = on ? theme.colors.green : theme.colors.textMuted;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            accessibilityLabel={option.sub == null ? option.label : `${option.label}, ${option.sub}`}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              withSub ? s.cardStart : s.cardCenter,
              on && s.on,
              disabled && s.off,
              pressed && !disabled && s.pressed,
            ]}
          >
            <Icon name={option.icon} size={withSub ? 15 : 14} color={tint} />
            {withSub ? (
              <View style={s.body}>
                <AppText variant="body" style={[s.label, on && s.labelOn]}>
                  {option.label}
                </AppText>
                {option.sub != null && (
                  <AppText variant="mono" style={s.sub}>
                    {option.sub}
                  </AppText>
                )}
              </View>
            ) : (
              <AppText variant="body" style={[s.label, on && s.labelOn]}>
                {option.label}
              </AppText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 6 },
    cardCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      minHeight: 38,
      paddingVertical: 7,
      paddingHorizontal: 8,
      borderRadius: 11,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceRaised,
    },
    cardStart: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 11,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceRaised,
    },
    on: { borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenMuted },
    off: { opacity: 0.4 },
    pressed: { opacity: 0.75 },
    body: { flex: 1, minWidth: 0, gap: 1 },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    label: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 12.5, lineHeight: 16, color: t.colors.textSecondary },
    labelOn: { color: t.colors.green },
    sub: { fontSize: 8.5, lineHeight: 12, letterSpacing: 0.3, color: t.colors.textMuted },
  });
