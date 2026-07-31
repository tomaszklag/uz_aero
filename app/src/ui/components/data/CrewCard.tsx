/**
 * UZ Aero — CrewCard i CrewGrid (`.crew-card` / `.crew-grid` z mockupu 10)
 *
 * Kto latał i z jakim wynikiem — jedna karta na rolę, dwie obok siebie.
 *
 * Karty stoją w siatce, a nie w liście, bo to jedyne miejsce w aplikacji, gdzie dwie
 * osoby są porównywane wprost: pilot przepisuje te liczby do własnej książki lotów
 * i musi jednym spojrzeniem zobaczyć, co przypada jemu, a co drugiemu pilotowi.
 * Karta zalogowanego jest wyróżniona (`active`) — nie dla ozdoby, tylko dlatego że
 * kody trzyliterowe (TMK/AKO) mylą się przy przepisywaniu.
 *
 * Kod pilota, nie nazwisko: tak jest w mockupie i tak wygląda wpis w dokumentach —
 * `shortName` byłby tu tłumaczeniem na język, którego formularze nie używają.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Tag } from './Tag';
import { toneColors } from './tone';

export interface CrewStat {
  key: string;
  value: string;
}

export interface CrewCardProps {
  /** Rola i kontekst („PIC · zalogowany (Ty)"). */
  role: string;
  /** Kod pilota („TMK"). */
  code: string;
  stats?: CrewStat[];
  /** Przypis pod statystykami („Pełny dzień"). */
  tag?: string | null;
  /** Karta zalogowanego pilota — zielona obramówka i zielony kod. */
  active?: boolean;
  /** Miejsce nieobsadzone — zamiast kodu i statystyk pokazujemy adnotację. */
  emptyText?: string | null;
  style?: ViewStyle;
}

export function CrewCard({
  role,
  code,
  stats = [],
  tag = null,
  active = false,
  emptyText = null,
  style,
}: CrewCardProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');
  const empty = emptyText != null;

  return (
    <View
      style={[
        styles.card,
        {
          gap: 6,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 10,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: active ? green.border : theme.colors.border,
          backgroundColor: active ? green.muted : theme.colors.surface,
        },
        style,
      ]}
    >
      <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.role}>
        {role}
      </AppText>

      {empty ? (
        <AppText variant="mono" tone="muted" style={styles.empty}>
          {emptyText}
        </AppText>
      ) : (
        <>
          <AppText
            variant="display"
            style={[styles.code, active ? { color: green.accent } : null]}
          >
            {code}
          </AppText>

          {stats.length > 0 && (
            <View style={styles.stats}>
              {stats.map((stat) => (
                <View key={stat.key} style={styles.statRow}>
                  <AppText variant="mono" tone="muted" style={styles.statKey}>
                    {stat.key}
                  </AppText>
                  <AppText variant="mono" tone="secondary" style={styles.statValue}>
                    {stat.value}
                  </AppText>
                </View>
              ))}
            </View>
          )}

          {tag != null && <Tag label={tag} tone="green" />}
        </>
      )}
    </View>
  );
}

/** Siatka dwóch kart załogi — sztywne dwie kolumny, tak jak `.crew-grid`. */
export function CrewGrid({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  return <View style={[styles.grid, { gap: theme.spacing.sm }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', alignItems: 'stretch' },
  card: { flex: 1 },
  role: { fontSize: 8, lineHeight: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  code: { fontSize: 16, lineHeight: 18, letterSpacing: 1 },
  stats: { gap: 2, marginTop: 2 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  statKey: { fontSize: 8, lineHeight: 12, letterSpacing: 0.5 },
  statValue: { fontSize: 11, lineHeight: 14, letterSpacing: 0.5 },
  // Mockup ma tu kursywę. Na Androidzie `fontStyle: 'italic'` przy własnym kroju bez
  // wariantu italic (a takiego JetBrains Mono nie ładujemy) podmienia font na systemowy —
  // czyli psuje więcej, niż daje. Odrębność niesie ton `muted` i sam brak kodu.
  empty: { fontSize: 11, lineHeight: 16, marginTop: 4 },
});
