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

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';
import { toneColors, type Tone } from '../tone';

/** Rodzaj wiersza — steruje ikoną, kolorem i tym, czy wiersz stoi w szynie cyklu. */
export type LogKind =
  | 'start'
  | 'stop'
  | 'taxi'
  | 'takeoff'
  | 'landing'
  | 'drop'
  | 'event'
  | 'ground'
  | 'live';

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
  /**
   * Wiersz OCZEKIWANY (mockup 08 `.pending-row`): zdarzenie, którego jeszcze nie ma,
   * ale wiadomo, że nadejdzie („— · Landing · W locie…"). Kreskowana plakietka, wygaszone
   * napisy, bez celu korekty — nie da się poprawić czegoś, co nie zostało zapisane.
   */
  awaited?: boolean;
  /** Separator nad wierszem („Lot 2") — dzieli cykl na loty (mockup 05 `.flight-sep`). */
  section?: string;
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
  // Kołowanie to ruch po ziemi — strzałka w prawo, nie w górę ani w dół.
  taxi: 'next',
  takeoff: 'takeoff',
  landing: 'landing',
  drop: 'drop',
  event: 'info',
  ground: 'refuel',
  live: 'start',
};

const KIND_TONE: Record<LogKind, Tone> = {
  start: 'green',
  stop: 'red',
  taxi: 'neutral',
  takeoff: 'neutral',
  landing: 'neutral',
  drop: 'blue',
  event: 'neutral',
  ground: 'amber',
  live: 'green',
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
        <React.Fragment key={row.id}>
          {row.section != null && <FlightSeparator label={row.section} />}
          <LogRow
            row={row}
            first={index === 0}
            last={index === rows.length - 1}
            onCorrect={onCorrect}
          />
        </React.Fragment>
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

  // Wiersz „na żywo" (mockup 05): pulsujący punkt zamiast plakietki i BRAK korekty —
  // to nie jest zdarzenie w rejestrze, tylko trwający stan.
  const live = row.kind === 'live';
  const awaited = row.awaited === true;

  const correctButton =
    onCorrect == null || live || awaited ? null : (
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
        {live ? (
          <View style={[styles.railLive, { backgroundColor: c.accent }]} />
        ) : (
          <View
            style={[
              styles.railIcon,
              awaited
                ? {
                    // `.event-icon.pending` — kreskowana obwódka, przezroczysty środek.
                    borderWidth: theme.borderWidth,
                    borderStyle: 'dashed',
                    borderColor: theme.colors.borderStrong,
                    backgroundColor: 'transparent',
                  }
                : {
                    borderWidth: theme.borderWidth,
                    borderColor: tone === 'neutral' ? theme.colors.border : c.border,
                    backgroundColor: tone === 'neutral' ? theme.colors.surfaceRaised : c.muted,
                  },
            ]}
          >
            <Icon
              name={KIND_ICON[row.kind]}
              size={11}
              color={awaited || tone === 'neutral' ? theme.colors.textMuted : c.accent}
            />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <AppText
          variant="mono"
          style={[
            styles.time,
            {
              fontFamily: theme.fontFamily.monoBold,
              color: awaited
                ? theme.colors.textMuted
                : tone === 'neutral'
                  ? theme.colors.textPrimary
                  : c.accent,
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
            {
              color: awaited
                ? theme.colors.textMuted
                : tone === 'neutral'
                  ? theme.colors.textSecondary
                  : c.accent,
            },
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

/**
 * `.flight-sep` — poziomy separator z etykietą („Lot 2").
 *
 * W cyklu z sześcioma lotami sama szyna nie wystarcza: bez podziału nie widać,
 * do którego lotu należy zrzut i które lądowanie go zamyka.
 */
function FlightSeparator({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.sep,
        {
          paddingHorizontal: 12,
          paddingVertical: 5,
          backgroundColor: theme.colors.surfaceRaised,
          borderBottomWidth: theme.borderWidth,
          borderBottomColor: theme.colors.borderStrong,
        },
      ]}
    >
      <View style={[styles.sepLine, { backgroundColor: theme.colors.borderStrong }]} />
      <AppText variant="mono" tone="secondary" style={styles.sepLabel}>
        {label}
      </AppText>
      <View style={[styles.sepLine, { backgroundColor: theme.colors.borderStrong }]} />
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
  railLive: { width: 10, height: 10, borderRadius: 5 },
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
  sep: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sepLine: { flex: 1, height: 1 },
  sepLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  groundRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 0 },
  groundLabel: { flex: 1, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
  groundMeta: { fontSize: 9, opacity: 0.75 },
});
