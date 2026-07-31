/**
 * UZ Aero — ExportedBox (`.success-box` z mockupu 11-eksport)
 *
 * Pudełko „Serwer zaktualizował arkusz": potwierdzenie eksportu §4.7 z linkiem do
 * karty. Ekran 11 niczego nie eksportuje — pudełko pojawia się, gdy `exportUrl`
 * z sync-status przestaje być `null`, czyli gdy serwer faktycznie przegenerował kartę.
 *
 * Niepowodzenie otwarcia linku (brak przeglądarki, zablokowany intent) NIE może
 * być cichym `catch` — §6 pkt 3. Powód pokazujemy w miejscu linku.
 */

import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { fontFamily } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface ExportedBoxProps {
  /** Link do karty arkusza (`sync-status.exportUrl`). */
  url: string;
  /** Podpis pod tytułem: nazwa karty · liczba lotów · dzień. */
  detail: string;
  style?: ViewStyle;
}

export function ExportedBox({ url, detail, style }: ExportedBoxProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [openError, setOpenError] = useState<string | null>(null);

  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: colors.greenMuted,
          borderColor: colors.greenBorder,
          borderWidth: theme.borderWidth,
          borderRadius: theme.radius.md,
        },
        style,
      ]}
    >
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: colors.green }]}>
          <Icon name="check" size={11} color={colors.bg} />
        </View>
        <AppText variant="mono" style={[styles.title, { color: colors.green }]}>
          Serwer zaktualizował arkusz
        </AppText>
      </View>
      <AppText variant="mono" tone="secondary" style={styles.sub}>
        {detail}
      </AppText>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Otwórz arkusz w przeglądarce"
        onPress={() =>
          void Linking.openURL(url).catch(() =>
            setOpenError('Nie udało się otworzyć przeglądarki — link skopiujesz z ekranu administratora.'),
          )
        }
        style={styles.link}
      >
        <AppText variant="mono" style={[styles.linkText, { color: colors.green }]}>
          Otwórz arkusz
        </AppText>
        <Icon name="next" size={11} color={colors.green} />
      </Pressable>
      {openError != null && (
        <AppText variant="mono" tone="amber" style={styles.sub}>
          {openError}
        </AppText>
      )}
      <AppText variant="mono" tone="muted" style={styles.sub}>
        Eksport wykonuje serwer po odebraniu danych · kopia lokalna zostaje na urządzeniu
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 11, fontFamily: fontFamily.monoBold, letterSpacing: 0.5 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    minHeight: 44,
  },
  linkText: { fontSize: 11, textDecorationLine: 'underline', letterSpacing: 0.5 },
  // Odpowiednik `footSub` z ekranu 11 (8.5/13) — stopki pudełka idą tym samym
  // krojem co stopka podglądu arkusza, z którą pudełko sąsiaduje.
  sub: { fontSize: 8.5, lineHeight: 13 },
});
