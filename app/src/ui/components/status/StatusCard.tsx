/**
 * Ninerdeck - `.status-card` z makiet ekranów logowania (00C, 00D, 00E, 00G, 00H).
 *
 * Karta odpowiada na pytanie „co się właśnie dzieje i co z tym zrobić" na ekranie, na
 * którym pilot NIE MOŻE dalej: czeka na zatwierdzenie, został odrzucony, nie ma klubu,
 * dostał link na pocztę. To jedyna kategoria z issue #72, która ma prawo tłumaczyć -
 * BLOKADA Z POWODEM albo INSTRUKCJA DO WYKONANIA. Nigdy opis budowy aplikacji.
 *
 * Komponent, a nie kopia stylów w każdym ekranie: pięć ekranów rysuje tę samą kartę,
 * a szósty (00I) świadomie jej nie ma. Do 2.1.0 składał ją `ClubGateScreen` u siebie
 * i dlatego zgubił ikonę, którą makiety 00C/00D/00E rysują od początku.
 *
 * ══ TON NIESIE ZNACZENIE, NIE OZDOBĘ ══
 * Bursztyn - czekaj; czerwień - decyzja zapadła i jest odmowna; błękit - instrukcja;
 * zieleń - udało się. Odmowa jest przy tym WYCISZONA (`muted={false}`): czerwień
 * zostaje w ramce i tytule, a nie zalewa karty - to decyzja administratora, a nie
 * awaria aplikacji.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors, type Tone } from '../tone';

export interface StatusCardProps {
  icon: IconName;
  /** Tytuł display, wersalikami - pisze go wołający, bo to zdanie, nie etykieta stanu. */
  title: string;
  body: string;
  /** Dodatkowa linijka mono pod treścią (np. kiedy złożono zgłoszenie). */
  meta?: string | null;
  tone: Tone;
  /**
   * Czy tło karty niesie ton.
   *
   * `false` wycisza: ramka i tytuł w tonie, tło jak reszta ekranu. Tak wygląda ODMOWA -
   * pełna czerwona karta czytałaby się jak awaria aplikacji, a jest decyzją człowieka.
   */
  tinted?: boolean;
  style?: ViewStyle;
}

export function StatusCard({ icon, title, body, meta, tone, tinted = true, style }: StatusCardProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      style={[
        styles.card,
        {
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          borderRadius: 18,
          backgroundColor: tinted ? c.muted : theme.colors.surface,
        },
        style,
      ]}
    >
      <View style={styles.head}>
        <Icon name={icon} size={17} color={c.accent} />
        <AppText variant="display" style={[styles.title, { color: c.accent }]}>
          {title}
        </AppText>
      </View>
      <AppText variant="body" style={styles.body}>
        {body}
      </AppText>
      {meta != null && (
        <AppText variant="micro" tone="muted" style={styles.meta}>
          {meta}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, paddingBottom: 16, gap: 9 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  // `flexShrink`, bo tytuł bywa długi („LINK DO USTAWIENIA HASŁA") i ma się złamać,
  // a nie wypchnąć ikony poza kartę.
  title: { flexShrink: 1, fontSize: 21, letterSpacing: 2.4, lineHeight: 24 },
  body: { fontSize: 13, lineHeight: 20 },
  meta: { letterSpacing: 1.4 },
});
