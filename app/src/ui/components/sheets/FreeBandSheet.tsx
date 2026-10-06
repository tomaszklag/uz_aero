/**
 * Ninerdeck - ARKUSZ WOLNEGO PASMA: „dla siebie" albo „zleć" (`design/21e`, druga ramka;
 * zlecenia 4.0.0, `docs/zlecenia.md` §14.1).
 *
 * Istnieje WYŁĄCZNIE dla osoby, która może zlecać (bit `viewer.order` w oknie kalendarza -
 * telefon zdolności nie zna). Bez tej zdolności tapnięcie w wolne pasmo prowadzi wprost
 * do rezerwacji (22), jak dotąd: pytanie z jedną odpowiedzią byłoby krokiem o niczym.
 *
 * ══ TYTUŁEM JEST WSKAZANE PASMO ══
 * Maszyna, doba i wolne godziny to jedyne, co oba wybory mają wspólne. Godziny stoją tym
 * samym krojem, co termin w hero karty rezerwacji i zlecenia, bo za chwilę staną się
 * terminem. Wskazana godzina dalej jest PREFEROWANĄ PORĄ, nie terminem (reguła z 21) -
 * termin wybiera się w formularzu.
 *
 * Dwie karty, nie przyciski: to dwie DROGI do dwóch formularzy, a szewron mówi „to
 * prowadzi dalej". Kolor ikony powtarza kolor paska, który za chwilę stanie na osi:
 * zieleń własnej rezerwacji, błękit zlecenia. Żadna nie jest wyróżniona. Bez „ANULUJ":
 * arkusz niczego nie zapisuje, a tapnięcie w tło wraca do kalendarza (jak filtr 21D).
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { BugButton } from '../bug/BugButton';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { SheetSurface } from './SheetSurface';

export interface FreeBandSheetProps {
  visible: boolean;
  /** „SP-BKL · PA-28 · sobota 3 października". */
  kicker: string;
  /** „09:00 → 15:00". */
  hours: string;
  onSelf: () => void;
  onOrder: () => void;
  onCancel: () => void;
}

export function FreeBandSheet({ visible, kicker, hours, onSelf, onOrder, onCancel }: FreeBandSheetProps) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <SheetSurface
      visible={visible}
      onCancel={onCancel}
      topRight={<BugButton sheet="WOLNE PASMO" />}
      gap={12}
      designPad={30}
    >
      <View style={s.head}>
        <AppText variant="mono" style={s.kicker}>
          {kicker.toUpperCase()}
        </AppText>
        <View style={s.hoursRow}>
          <AppText variant="mono" style={s.hours}>
            {hours}
          </AppText>
          <AppText variant="mono" style={s.zone}>
            WOLNE · CZAS KLUBU
          </AppText>
        </View>
      </View>

      <Choice
        icon="book-self"
        tone="green"
        title="Zarezerwuj dla siebie"
        sub="Lecisz Ty - rezerwacja na Twoje nazwisko."
        onPress={onSelf}
      />
      <Choice
        icon="order-new"
        tone="blue"
        title="Zleć lot"
        sub="Szukasz załogi - termin jest zajęty od wysłania."
        onPress={onOrder}
      />
    </SheetSurface>
  );
}

function Choice({
  icon,
  tone,
  title,
  sub,
  onPress,
}: {
  icon: IconName;
  tone: 'green' | 'blue';
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const s = styles(theme);
  const accent = tone === 'green' ? theme.colors.green : theme.colors.blue;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [s.choice, pressed && s.pressed]}
    >
      <View style={[s.icon, tone === 'green' ? s.iconGreen : s.iconBlue]}>
        <Icon name={icon} size={18} color={accent} />
      </View>
      <View style={s.body}>
        <AppText variant="body" style={s.title}>
          {title}
        </AppText>
        <AppText variant="body" style={s.sub}>
          {sub}
        </AppText>
      </View>
      <Icon name="more" size={16} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    head: { gap: 6, paddingTop: 2, paddingHorizontal: 2, paddingBottom: 4 },
    kicker: { fontSize: 9, lineHeight: 12, letterSpacing: 1.5, color: t.colors.textMuted },
    hoursRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    hours: { fontFamily: t.fontFamily.monoBold, fontSize: 22, lineHeight: 24, letterSpacing: 1.5, color: t.colors.textPrimary },
    zone: { fontSize: 8, lineHeight: 11, letterSpacing: 1.5, color: t.colors.textMuted },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 66,
      paddingVertical: 12,
      paddingHorizontal: 13,
      borderRadius: 14,
      borderWidth: t.borderWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    pressed: { backgroundColor: t.colors.surfaceHover, borderColor: t.colors.borderStrong },
    icon: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
    },
    iconGreen: { borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenMuted },
    iconBlue: { borderColor: t.colors.blueBorder, backgroundColor: t.colors.blueMuted },
    body: { flex: 1, minWidth: 0, gap: 3 },
    title: { fontFamily: t.fontFamily.bodySemiBold, fontSize: 14, lineHeight: 18, color: t.colors.textPrimary },
    sub: { fontSize: 11, lineHeight: 15.5, color: t.colors.textSecondary },
  });
