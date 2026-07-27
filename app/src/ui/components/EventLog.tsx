/**
 * UZ Aero — EventLog (`.day-log` z mockupu 04, `.cycle-log` z 05)
 *
 * Log dnia jako **oś czasu cykli silnika**, nie płaska lista. Wiersz to: szyna z ikoną
 * zdarzenia po lewej, czas, etykieta, adnotacja (długość lotu, blok) i chipy (MH, paliwo),
 * a na końcu cel korekty.
 *
 * Pełni podwójną rolę: pokazuje przebieg dnia **i jest potwierdzeniem zapisu** — zdarzenie
 * pojawia się natychmiast po komendzie, więc pilot nie potrzebuje osobnego „zapisano".
 *
 * Dwie rzeczy nie są ozdobnikiem:
 *  • **Szyna z ikonami** grupuje zdarzenia w cykle START → … → STOP. Bez niej przy sześciu
 *    lotach nie da się odczytać, który start należy do którego lądowania.
 *  • **Cel korekty ≥ 44 px z pełnym kontrastem.** GPS klasy konsumenckiej gwarantuje
 *    fałszywe detekcje (§8), więc naprawa błędu nie może być trudniejsza niż jego
 *    popełnienie — to wniosek z audytu, nie preferencja.
 *
 * Zdarzenia naziemne (tankowanie, zmiana załogi, wpis ręczny) idą pełną szerokością
 * w tonie amber: dzieją się MIĘDZY cyklami i nie należą do żadnego z nich.
 *
 * Czasy w UTC — domyślna strefa aplikacji. Wiersz niewysłany dostaje znacznik ↑; to
 * jedyne miejsce, gdzie stan outboxa schodzi do poziomu pojedynczego zdarzenia.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tone';

/** Rodzaj wiersza — steruje ikoną, kolorem i tym, czy wiersz stoi w szynie cyklu. */
export type LogKind = 'start' | 'stop' | 'takeoff' | 'landing' | 'event' | 'ground';

export interface LogChip {
  label: string;
  tone?: Tone;
}

export interface EventLogRow {
  id: string;
  /** Czas w UTC, sformatowany („08:25"). */
  time: string;
  /** Etykieta zdarzenia („Start engine", „Takeoff"). */
  label: string;
  kind: LogKind;
  /** Adnotacja po etykiecie: długość lotu („0:53"), czas bloku („blok 2:22"). */
  meta?: string;
  /** Chipy po prawej: stan licznika, paliwo. */
  chips?: LogChip[];
  /** Zdarzenie czeka na wysyłkę. */
  pending?: boolean;
}

export interface EventLogProps {
  rows: EventLogRow[];
  /** Otwiera korektę zdarzenia (04c). Bez tego wiersze nie mają celu korekty. */
  onCorrect?: (id: string) => void;
  emptyText?: string;
  style?: ViewStyle;
}

const KIND_ICON: Record<LogKind, IconName> = {
  start: 'start',
  stop: 'stop',
  takeoff: 'takeoff',
  landing: 'landing',
  event: 'info',
  ground: 'refuel',
};

const KIND_TONE: Record<LogKind, Tone> = {
  start: 'green',
  stop: 'red',
  takeoff: 'neutral',
  landing: 'neutral',
  event: 'neutral',
  ground: 'amber',
};

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
      {rows.map((row, index) => (
        <LogRow
          key={row.id}
          row={row}
          first={index === 0}
          last={index === rows.length - 1}
          onCorrect={onCorrect}
        />
      ))}
    </View>
  );
}

function LogRow({
  row,
  first,
  last,
  onCorrect,
}: {
  row: EventLogRow;
  first: boolean;
  last: boolean;
  onCorrect?: (id: string) => void;
}) {
  const { theme } = useTheme();
  const tone = KIND_TONE[row.kind];
  const c = toneColors(theme, tone);
  const ground = row.kind === 'ground';

  const correctButton =
    onCorrect == null ? null : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Korekta: ${row.label} o ${row.time}`}
        onPress={() => onCorrect(row.id)}
        style={({ pressed }) => [
          styles.correct,
          {
            borderLeftWidth: ground ? 0 : theme.borderWidth,
            borderLeftColor: theme.colors.border,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <Icon name="edit" size={15} color={ground ? c.accent : theme.colors.textSecondary} />
      </Pressable>
    );

  // Zdarzenie naziemne — pełna szerokość, wcięcie na szerokość szyny, tło amber.
  if (ground) {
    return (
      <View
        style={[
          styles.groundRow,
          {
            paddingLeft: 36,
            borderBottomWidth: last ? 0 : theme.borderWidth,
            borderBottomColor: c.border,
            backgroundColor: c.muted,
          },
        ]}
      >
        <Icon name={KIND_ICON[row.kind]} size={11} color={c.accent} />
        <AppText variant="mono" style={[styles.groundLabel, { color: c.accent }]}>
          {row.label}
        </AppText>
        <AppText variant="mono" style={[styles.groundMeta, { color: c.accent }]}>
          {[row.meta, row.time].filter(Boolean).join(' · ')}
        </AppText>
        {row.pending === true && <Pending />}
        {correctButton}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.row,
        { borderBottomWidth: last ? 0 : theme.borderWidth, borderBottomColor: theme.colors.border },
      ]}
    >
      {/* Szyna cyklu: pionowa kreska przez całą wysokość + plakietka zdarzenia. */}
      <View style={styles.rail}>
        <View
          style={[
            styles.railLine,
            {
              backgroundColor: theme.colors.border,
              top: first ? '50%' : 0,
              bottom: last ? '50%' : 0,
            },
          ]}
        />
        <View
          style={[
            styles.railIcon,
            {
              borderWidth: theme.borderWidth,
              borderColor: tone === 'neutral' ? theme.colors.border : c.border,
              backgroundColor: tone === 'neutral' ? theme.colors.surfaceRaised : c.muted,
            },
          ]}
        >
          <Icon
            name={KIND_ICON[row.kind]}
            size={11}
            color={tone === 'neutral' ? theme.colors.textSecondary : c.accent}
          />
        </View>
      </View>

      <View style={styles.body}>
        <AppText
          variant="mono"
          style={[
            styles.time,
            {
              fontFamily: theme.fontFamily.monoBold,
              color: tone === 'neutral' ? theme.colors.textPrimary : c.accent,
            },
          ]}
        >
          {row.time}
        </AppText>

        <AppText
          variant="mono"
          numberOfLines={1}
          style={[
            styles.label,
            { color: tone === 'neutral' ? theme.colors.textSecondary : c.accent },
          ]}
        >
          {row.label}
        </AppText>

        {row.meta != null && (
          <AppText variant="mono" tone="muted" style={styles.meta}>
            {row.meta}
          </AppText>
        )}

        {row.chips?.map((chip) => {
          const cc = toneColors(theme, chip.tone ?? 'neutral');
          return (
            <View
              key={chip.label}
              style={[
                styles.chip,
                {
                  borderWidth: theme.borderWidth,
                  borderColor: chip.tone == null ? theme.colors.border : cc.border,
                  backgroundColor: chip.tone == null ? theme.colors.surface : cc.muted,
                },
              ]}
            >
              <AppText
                variant="mono"
                style={[
                  styles.chipLabel,
                  { color: chip.tone == null ? theme.colors.textSecondary : cc.accent },
                ]}
              >
                {chip.label}
              </AppText>
            </View>
          );
        })}

        {row.pending === true && <Pending />}
      </View>

      {correctButton}
    </View>
  );
}

function Pending() {
  return (
    <AppText variant="mono" tone="amber" accessibilityLabel="Czeka na wysyłkę" style={styles.meta}>
      ↑
    </AppText>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: 36, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  railLine: { position: 'absolute', left: '50%', width: 1 },
  railIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 8,
    minHeight: 44,
  },
  time: { width: 44, fontSize: 13, letterSpacing: 1 },
  label: { flex: 1, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  meta: { fontSize: 9, letterSpacing: 0.3 },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  chipLabel: { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  correct: { width: 46, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  groundRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 0 },
  groundLabel: { flex: 1, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  groundMeta: { fontSize: 9, opacity: 0.75 },
});
