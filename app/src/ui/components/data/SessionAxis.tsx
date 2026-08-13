/**
 * UZ Aero — SessionAxis (`.axis` z mockupu `10-statystyki.html`).
 *
 * Oś czasu jednej sesji: przejęcie → uruchomienie → starty, zrzuty i lądowania →
 * wyłączenie → zdanie, w jednej kolumnie, z pionową kreską łączącą punkty.
 *
 * ══ CZYM RÓŻNI SIĘ OD `EventLog` (04, 05) ══
 * Log kokpitu jest POTWIERDZENIEM ZAPISU w czasie rzeczywistym: ma szynę cykli, chipy
 * z licznikiem i paliwem, znacznik outboxa, ton `live` dla stanu trwającego. Ta oś opisuje
 * sesję ZAMKNIĘTĄ i odpowiada na jedno pytanie — co i o której. Stąd inny inwentarz:
 * bez chipów, bez szyny, za to z podpisem odczytów przy końcach i czasem lotu przy
 * lądowaniu. Wspólny komponent musiałby obsłużyć obie role przełącznikami, a wtedy
 * przestałby pilnować którejkolwiek.
 *
 * ══ KRESKA RYSUJE SIĘ Z WIERSZY ══
 * Pion osi to `::before` każdego wiersza, a nie jedna linia w tle: wiersze mają różną
 * wysokość (jedne z podpisem, inne bez), więc linia rysowana osobno rozjeżdżałaby się
 * z kropkami przy pierwszej zmianie treści. Pierwszy i ostatni wiersz obcinają ją do
 * połowy, żeby oś zaczynała się i kończyła na kropce.
 *
 * Cel korekty ma 44 px (audyt dostępności): naprawa błędnej detekcji nie może być
 * trudniejsza niż jej popełnienie.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Tag } from '../status/Tag';
import type { Tone } from '../tone';
import { toneColors } from '../tone';

/** Rodzaj punktu — steruje kolorem kropki i tonem napisu. */
export type SessionAxisKind =
  | 'claim'
  | 'engineStart'
  | 'takeoff'
  | 'drop'
  | 'landing'
  | 'engineStop'
  | 'release';

export interface SessionAxisRow {
  id: string;
  kind: SessionAxisKind;
  time: string;
  name: string;
  sub?: string | null;
  /** Czas lotu przy lądowaniu („00:41"). */
  duration?: string | null;
  /** Wpis ręczny — jedyny stan z plakietką (issue #38 pkt 10). */
  manual?: boolean;
  /** Czy wiersz ma ołówek (poza oknem korekty kolumny NIE MA w ogóle). */
  correctable?: boolean;
}

export interface SessionAxisFootItem {
  key: string;
  value: string;
  accent?: boolean;
}

export interface SessionAxisProps {
  rows: SessionAxisRow[];
  foot?: SessionAxisFootItem[];
  /** Otwiera arkusz korekty (04c) dla zdarzenia o tym uuid. */
  onCorrect?: (id: string) => void;
  emptyText?: string;
  style?: ViewStyle;
}

/**
 * Kolor kropki. Przejęcie i zdanie są PUSTE (obrys, nie wypełnienie), bo nie są pracą
 * silnika — a nie szare-wypełnione, bo wtedy zlewałyby się z uruchomieniem.
 */
const KIND_TONE: Record<SessionAxisKind, Tone> = {
  claim: 'neutral',
  engineStart: 'neutral',
  takeoff: 'green',
  drop: 'blue',
  landing: 'red',
  engineStop: 'neutral',
  release: 'neutral',
};

/** Które punkty rysujemy obrysem — końce sesji, czyli to, co nie jest pracą silnika. */
const HOLLOW: Record<SessionAxisKind, boolean> = {
  claim: true,
  engineStart: false,
  takeoff: false,
  drop: false,
  landing: false,
  engineStop: false,
  release: true,
};

export function SessionAxis({ rows, foot, onCorrect, emptyText, style }: SessionAxisProps) {
  const { theme } = useTheme();

  if (rows.length === 0) {
    return (
      <View style={[{ padding: theme.spacing.lg }, style]}>
        <AppText variant="mono" tone="muted">
          {emptyText ?? 'Brak zdarzeń w tej sesji.'}
        </AppText>
      </View>
    );
  }

  return (
    <View style={style}>
      {rows.map((row, index) => {
        const c = toneColors(theme, KIND_TONE[row.kind]);
        const hollow = HOLLOW[row.kind];
        const dimmed = row.kind === 'claim' || row.kind === 'release';

        return (
          <View key={row.id} style={styles.row} accessibilityRole="text">
            <AppText
              variant="mono"
              tone={dimmed ? 'secondary' : 'primary'}
              style={styles.time}
            >
              {row.time}
            </AppText>

            <View style={styles.rail}>
              <View
                style={[
                  styles.railLine,
                  {
                    backgroundColor: theme.colors.borderStrong,
                    top: index === 0 ? '50%' : 0,
                    bottom: index === rows.length - 1 ? '50%' : 0,
                  },
                ]}
              />
              <View
                style={[
                  styles.dot,
                  hollow
                    ? { borderWidth: 1.5, borderColor: theme.colors.textMuted }
                    : { backgroundColor: c.accent },
                  { borderColor: hollow ? theme.colors.textMuted : theme.colors.surface },
                ]}
              />
            </View>

            <View style={styles.label}>
              <AppText variant="mono" tone={dimmed ? 'secondary' : 'primary'} style={styles.name}>
                {row.name.toUpperCase()}
              </AppText>
              {row.sub != null && (
                <AppText variant="mono" tone="muted" style={styles.sub}>
                  {row.sub}
                </AppText>
              )}
            </View>

            <View style={styles.right}>
              {row.duration != null && (
                <AppText variant="mono" style={{ color: theme.colors.green, fontSize: 11 }}>
                  {row.duration}
                </AppText>
              )}
              {row.manual === true && <Tag label="RĘCZNIE" tone="amber" size="sm" />}
              {onCorrect != null && row.correctable === true && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Korekta: ${row.name} ${row.time}`}
                  onPress={() => onCorrect(row.id)}
                  style={[
                    styles.correct,
                    {
                      borderColor: theme.colors.borderStrong,
                      borderRadius: theme.radius.sm,
                    },
                  ]}
                >
                  <Icon name="edit" size={14} color={theme.colors.textSecondary} />
                </Pressable>
              )}
            </View>
          </View>
        );
      })}

      {foot != null && foot.length > 0 && (
        <View
          style={[
            styles.foot,
            {
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceRaised,
            },
          ]}
        >
          {foot.map((item) => (
            <View key={item.key} style={styles.footItem}>
              <AppText
                variant="display"
                style={[
                  styles.footValue,
                  item.accent === true ? { color: theme.colors.green } : null,
                ]}
              >
                {item.value}
              </AppText>
              <AppText variant="mono" tone="muted" style={styles.footKey}>
                {item.key.toUpperCase()}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 8, minHeight: 40 },
  time: { width: 46, fontSize: 11 },
  rail: { width: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', width: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  label: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 10, letterSpacing: 1.4 },
  sub: { fontSize: 8.5, letterSpacing: 0.5 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  correct: {
    minWidth: 44,
    minHeight: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  footItem: { gap: 2 },
  footValue: { fontSize: 20, letterSpacing: 1.5, lineHeight: 20 },
  footKey: { fontSize: 7, letterSpacing: 1.2 },
});
