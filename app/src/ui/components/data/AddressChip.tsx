/**
 * Ninerdeck - AddressChip (`.rcp-chip` z makiety 31B; zlecenia 4.0.0).
 *
 * Wybrany adresat szukanego fotela: osoba z kodem w kwadracie (jak lista Duali na 02)
 * albo grupa z ikoną dwóch sylwetek i liczbą osób, do których zlecenie naprawdę trafi.
 *
 * Rezygnacja z wartości to „×" PRZY NIEJ, w stałej kolumnie - nie czerwony kosz: kosz
 * odejmuje coś z rejestru, a tu niczego jeszcze nie ma (reguła issue #62).
 *
 * W EDYCJI zlecenia (ramka 4 makiety 31B) adresat bywa:
 *  - `sent` - zlecenie już poszło: w miejscu „×" kłódka, bo odebranie zlecenia to osobna
 *    czynność z wiadomością i powodem, w menu ⋯ na karcie prowadzącego (32D);
 *  - `new` - dopisany w tej edycji: zielona obwódka i podpis „nowy" - jeszcze go nikt nie
 *    dostał, więc „×" jest zwykłym cofnięciem wyboru.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { IconAction } from './IconAction';

export interface AddressChipProps {
  /** Grupa rysuje ikonę zamiast kodu. */
  kind: 'person' | 'group';
  /** Kod pilota w kwadracie; przy grupie pomijany. */
  code?: string | null;
  name: string;
  /** „5 osób" przy grupie. */
  sub?: string | null;
  /** `draft` - wybór w formularzu; `sent` - wysłany (kłódka); `new` - dopisany w edycji. */
  status?: 'draft' | 'sent' | 'new';
  /** Wymagane wszędzie poza `sent`. */
  onClear?: () => void;
}

export function AddressChip({ kind, code, name, sub, status = 'draft', onClear }: AddressChipProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={[s.chip, status === 'new' && s.chipNew]}>
      <View style={s.avatar}>
        {kind === 'group' ? (
          <Icon name="group" size={15} color={theme.colors.textSecondary} />
        ) : (
          <AppText variant="mono" style={s.code}>
            {code ?? ''}
          </AppText>
        )}
      </View>
      <View style={s.body}>
        <AppText variant="body" style={s.name}>
          {name}
        </AppText>
        {sub != null && (
          <AppText variant="mono" style={[s.sub, status === 'new' && s.subNew]}>
            {sub}
          </AppText>
        )}
      </View>
      {status === 'sent' || onClear == null ? (
        <View style={s.lock} accessible accessibilityLabel={`${name}: wysłane - odebrać można w menu przy adresacie`}>
          <Icon name="lock" size={13} color={theme.colors.textMuted} />
        </View>
      ) : (
        <IconAction name="clear" accessibilityLabel={`Usuń: ${name}`} onPress={onClear} />
      )}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
      paddingLeft: 8,
      paddingRight: 6,
      borderRadius: 12,
      borderWidth: t.borderWidth,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.surfaceRaised,
    },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    code: { fontFamily: t.fontFamily.monoBold, fontSize: 10, letterSpacing: 0.5, color: t.colors.textSecondary },
    body: { flex: 1, minWidth: 0, gap: 1 },
    name: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 13, lineHeight: 17, color: t.colors.textPrimary },
    sub: { fontSize: 9, lineHeight: 12, letterSpacing: 0.3, color: t.colors.textMuted },
    chipNew: { borderColor: t.colors.greenBorder },
    subNew: { color: t.colors.green },
    // Kłódka zajmuje kolumnę „×" - wiersz ma tę samą geometrię co wybór w formularzu.
    lock: { width: 44, height: 32, alignItems: 'center', justifyContent: 'center', opacity: 0.7 },
  });
