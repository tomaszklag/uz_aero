/**
 * UZ Aero — EventLog
 *
 * Log dnia / cyklu z mockupów (04, 04b, 05x). Pełni podwójną rolę: pokazuje przebieg
 * dnia **i jest potwierdzeniem zapisu** — zdarzenie pojawia się natychmiast po komendzie,
 * więc pilot nie potrzebuje osobnego komunikatu „zapisano".
 *
 * Czasy w UTC (domyślna strefa aplikacji). Wiersz niewysłany dostaje znacznik ↑ —
 * to jedyne miejsce, gdzie stan outboxa schodzi do poziomu pojedynczego zdarzenia.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tone';

export interface EventLogRow {
  id: string;
  /** Czas w UTC, sformatowany („08:25"). */
  time: string;
  /** Etykieta zdarzenia („Start engine", „Takeoff"). */
  label: string;
  tone?: Tone;
  /** Dodatkowe informacje po prawej (np. „MH 1 234:30", „150 L", „0:53"). */
  chips?: string[];
  /** Zdarzenie czeka na wysyłkę. */
  pending?: boolean;
  /** Separator sekcji nad wierszem (np. „Lot 1"). */
  section?: string;
}

export interface EventLogProps {
  rows: EventLogRow[];
  /** Otwiera korektę zdarzenia (04c). Bez tego wiersze nie są klikalne. */
  onCorrect?: (id: string) => void;
  emptyText?: string;
  style?: ViewStyle;
}

export function EventLog({ rows, onCorrect, emptyText = 'Brak zdarzeń.', style }: EventLogProps) {
  const { theme } = useTheme();

  if (rows.length === 0) {
    return (
      <View style={[{ padding: theme.spacing.md, alignItems: 'center' }, style]}>
        <AppText variant="body" tone="muted">
          {emptyText}
        </AppText>
      </View>
    );
  }

  return (
    <View style={style}>
      {rows.map((row) => (
        <React.Fragment key={row.id}>
          {row.section != null && (
            <View
              style={[
                styles.section,
                {
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.xs,
                  backgroundColor: theme.colors.surfaceRaised,
                  borderTopWidth: theme.borderWidth,
                  borderTopColor: theme.colors.border,
                },
              ]}
            >
              <AppText variant="label" tone="muted">
                {row.section}
              </AppText>
            </View>
          )}
          <LogRow row={row} onCorrect={onCorrect} />
        </React.Fragment>
      ))}
    </View>
  );
}

function LogRow({ row, onCorrect }: { row: EventLogRow; onCorrect?: (id: string) => void }) {
  const { theme } = useTheme();
  const c = toneColors(theme, row.tone ?? 'neutral');
  const interactive = onCorrect != null;

  const content = (
    <View
      style={[
        styles.row,
        {
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          // Cel dotykowy ≥ 44 px — korekta błędu nie może być trudniejsza niż jego
          // popełnienie (wniosek z audytu użyteczności).
          minHeight: 44,
          borderTopWidth: theme.borderWidth,
          borderTopColor: theme.colors.border,
        },
      ]}
    >
      <AppText variant="mono" style={styles.time}>
        {row.time}
      </AppText>
      <AppText
        variant="label"
        style={[styles.label, { color: row.tone ? c.accent : theme.colors.textSecondary }]}
      >
        {row.label}
      </AppText>

      {row.chips?.map((chip) => (
        <AppText key={chip} variant="label" tone="muted">
          {chip}
        </AppText>
      ))}

      {row.pending && (
        <AppText variant="label" tone="amber" accessibilityLabel="Czeka na wysyłkę">
          ↑
        </AppText>
      )}
    </View>
  );

  if (!interactive) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Korekta: ${row.label} o ${row.time}`}
      onPress={() => onCorrect?.(row.id)}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  section: {},
  time: { width: 52 },
  label: { flex: 1, textTransform: 'uppercase' },
});
