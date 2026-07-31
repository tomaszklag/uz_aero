/**
 * UZ Aero — ScreenHeader (`.app-header` z mockupów formularzy)
 *
 * Nagłówek ekranu **poza obszarem przewijania**: tytuł display, podtytuł mono, a po prawej
 * badge kroku i wskaźnik łączności. W mockupach ten pasek jest przyklejony u góry — i to
 * jest celowe: numer kroku („1 / 3") i stan sieci muszą być widoczne również wtedy, gdy
 * pilot jest w połowie długiego formularza.
 *
 * Różnica wobec `AppBar`: AppBar to pasek **dnia lotnego** (samolot, trasa) na ekranach
 * kokpitu. ScreenHeader to nagłówek **formularza** — nie ma jeszcze samolotu, którym można
 * by się przedstawić.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Tag } from '../status/Tag';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Numer kroku, np. „1 / 3". */
  step?: string;
  /**
   * Rozmiar tytułu. `lg` (26 px) to domyślny nagłówek ekranu; `md` (20 px) stosujemy
   * przy dłuższych tytułach w układzie wyśrodkowanym („POTWIERDŹ DANE" w mockupie 03),
   * gdzie pełny rozmiar wchodziłby na przycisk wstecz i badge kroku.
   */
  size?: 'lg' | 'md';
  /**
   * Powrót do poprzedniego kroku. Obecność powrotu przełącza układ na wyśrodkowany —
   * tak jak w mockupach kroków 2 i 3, gdzie tytuł stoi między „Wróć" a numerem kroku.
   */
  onBack?: () => void;
  /** Napis przy strzałce powrotu; domyślnie „Wróć", ale bywa nazwą celu („Kokpit"). */
  backLabel?: string;
  /**
   * Wyśrodkowanie tytułu BEZ powrotu (mockup 10 `.app-header`).
   *
   * Pusty slot po lewej nie jest niedoróbką designu, tylko treścią: statystyki otwierają
   * się po zamknięciu dnia, a „wstecz" prowadziłoby do formularza, którego nie da się
   * powtórzyć. Zamiast martwej strzałki zostaje 56 px, które trzyma tytuł na środku.
   */
  centered?: boolean;
  /** Prawa strona pod badgem kroku — zwykle `SyncChip`. */
  right?: React.ReactNode;
  style?: ViewStyle;
}

export function ScreenHeader({
  title,
  subtitle,
  step,
  size = 'lg',
  onBack,
  backLabel = 'Wróć',
  centered = false,
  right,
  style,
}: ScreenHeaderProps) {
  const { theme } = useTheme();
  const titleSize = size === 'lg' ? styles.title : styles.titleMd;

  if (onBack != null || centered) {
    return (
      <View
        style={[
          styles.header,
          styles.centered,
          {
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderBottomWidth: theme.borderWidth,
            borderBottomColor: theme.colors.border,
          },
          style,
        ]}
      >
        {/* `.back-btn`: chevron + słowo „Wróć". Sama ikona bywa nieczytelna w rękawicach
            i w słońcu — podpis kosztuje 30 px, a usuwa wątpliwość.
            Bez powrotu zostaje sam slot tej samej szerokości — inaczej tytuł uciekłby
            w lewo o szerokość prawej kolumny. */}
        {onBack != null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Wróć do poprzedniego kroku"
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.back, styles.sideSlot, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon name="back" size={14} color={theme.colors.textMuted} />
            <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.backLabel}>
              {backLabel}
            </AppText>
          </Pressable>
        ) : (
          <View style={styles.sideSlot} />
        )}

        <View style={styles.titleCentered}>
          <AppText variant="display" numberOfLines={1} style={[titleSize, styles.centerText]}>
            {title}
          </AppText>
          {subtitle != null && (
            <AppText variant="mono" tone="muted" numberOfLines={1} style={[styles.subtitle, styles.centerText]}>
              {subtitle}
            </AppText>
          )}
        </View>

        <View style={[styles.right, styles.sideSlot]}>
          {step != null && <Tag label={step} size="md" />}
          {right}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.header,
        {
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.md,
          borderBottomWidth: theme.borderWidth,
          borderBottomColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View style={styles.left}>
        <AppText variant="display" style={titleSize}>
          {title}
        </AppText>
        {subtitle != null && (
          <AppText variant="mono" tone="muted" style={styles.subtitle}>
            {subtitle}
          </AppText>
        )}
      </View>

      <View style={styles.right}>
        {step != null && <Tag label={step} size="md" />}
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  centered: { alignItems: 'center' },
  left: { flexShrink: 1, gap: 3 },
  title: { fontSize: 26, lineHeight: 28, letterSpacing: 3 },
  titleMd: { fontSize: 20, lineHeight: 22, letterSpacing: 2 },
  titleCentered: { flex: 1, gap: 2 },
  centerText: { textAlign: 'center' },
  subtitle: { fontSize: 10, letterSpacing: 1, lineHeight: 14 },
  right: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backLabel: { fontSize: 11, letterSpacing: 0.5 },
  // Równe sloty po obu stronach trzymają tytuł naprawdę na środku (mockup: min-width 56).
  sideSlot: { minWidth: 56 },
});
