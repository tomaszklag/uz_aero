/**
 * UZ Aero — SyncStatusBox (`.google-box` z mockupu 11 / `.sync-box` z 11a)
 *
 * Przyrząd statusu wysyłki na ekranie synchronizacji: okrągła plakietka stanu,
 * etykieta + licznik „wysłane / wszystkie" i chwila ostatniej udanej wysyłki.
 * W stanie `pending` dochodzi pasek postępu z podpisami — outbox niepusty to nie
 * błąd, tylko trwająca praca, i tak ma wyglądać (amber, nie czerwień).
 *
 * Dwa stany zamiast osobnych komponentów, bo w designie to TEN SAM przyrząd —
 * różni się kolorem i obecnością paska, a nie strukturą.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { fontFamily } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface SyncProgress {
  /** Ułamek wysłanych 0–1 — szerokość wypełnienia paska. */
  fraction: number;
  /** Podpis pod paskiem z lewej („ostatnia udana wysyłka 14:02 UTC"). */
  left: string;
  /** Podpis z prawej, akcentowany („12 czeka na wysyłkę"). */
  right: string;
}

export interface SyncStatusBoxProps {
  /** `ok` = wszystko na serwerze (zielony ✓); `pending` = outbox niepusty (amber). */
  tone: 'ok' | 'pending';
  /** Etykieta mono UPPERCASE („STATUS WYSYŁKI · PIC: TMK"). */
  label: string;
  /** Główny licznik („47 / 47 zdarzeń wysłanych na serwer"). */
  value: string;
  /** Chwila ostatniej udanej wysyłki („16:45 UTC"); null = jeszcze żadnej. */
  time?: string | null;
  /** Pasek postępu — tylko w stanie `pending`. */
  progress?: SyncProgress | null;
  style?: ViewStyle;
}

export function SyncStatusBox({ tone, label, value, time, progress, style }: SyncStatusBoxProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const ok = tone === 'ok';
  const accent = ok ? colors.green : colors.amber;

  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: colors.surface,
          // Mockup 11: obramowanie neutralne przy komplecie; 11a: amber przy zaległości.
          borderColor: ok ? colors.border : colors.amberBorder,
          borderWidth: theme.borderWidth,
          borderRadius: theme.radius.md,
        },
        style,
      ]}
    >
      <View style={styles.top}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: ok ? colors.greenMuted : colors.amberMuted,
              borderColor: ok ? colors.greenBorder : colors.amberBorder,
              borderWidth: theme.borderWidth,
            },
          ]}
        >
          <Icon name={ok ? 'check' : 'info'} size={17} color={accent} />
        </View>

        <View style={styles.info}>
          <AppText variant="label" tone="muted" style={styles.label}>
            {label}
          </AppText>
          <AppText variant="body" style={styles.value}>
            {value}
          </AppText>
        </View>

        {time != null && (
          <AppText variant="mono" tone="muted" style={styles.time}>
            {time}
          </AppText>
        )}
      </View>

      {progress != null && (
        <>
          <View
            style={[
              styles.track,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: colors.amber,
                  width: `${Math.round(clamp01(progress.fraction) * 100)}%`,
                },
              ]}
            />
          </View>
          <View style={styles.labels}>
            <AppText variant="mono" tone="muted" style={styles.progressLabel}>
              {progress.left}
            </AppText>
            <AppText variant="mono" style={[styles.progressLabel, { color: colors.amber }]}>
              {progress.right}
            </AppText>
          </View>
        </>
      )}
    </View>
  );
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

const styles = StyleSheet.create({
  box: { padding: 13, gap: 9 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 3 },
  label: { fontSize: 8, letterSpacing: 1.5 },
  value: { fontSize: 12, fontFamily: fontFamily.bodySemiBold },
  time: { fontSize: 9, letterSpacing: 0.5 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  progressLabel: { fontSize: 9 },
});
