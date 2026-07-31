/**
 * UZ Aero — Readout (sekcja odczytu z mockupu 02a)
 *
 * Blok „jedna wartość z licznika": etykieta, duża liczba z jednostką, adnotacja
 * świeżości, podpis konfiguracyjny i przycisk korekty po prawej. Pod spodem opcjonalna
 * oś czasu (`Trail`) i dowolna wstawka (pasek poziomu paliwa).
 *
 * W 02a występuje dwa razy — paliwo i motogodziny — i wróci przy zamknięciu dnia (09)
 * oraz tankowaniu (06). Dlatego jest komponentem, a nie dwoma kopiami w ekranie.
 *
 * Zasada `CLAUDE.md`, którą ten blok realizuje: **liczniki fizyczne > dane z serwera**.
 * Wartość z przekazania jest pokazana jako podpowiedź (z adnotacją wieku), a korekta
 * jest zawsze o jedno tapnięcie — nigdy nie trzeba „walczyć" z tym, co podpowiedział
 * serwer. Gdy danych brak, przycisk zmienia się w wezwanie („Wpisz odczyt", amber),
 * bo to wtedy jedyna droga naprzód.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { FreshnessNote, type Freshness } from './FreshnessNote';
import { Icon } from './Icon';
import { Trail, type TrailRow } from './Trail';
import { toneColors, type Tone } from './tone';

export interface ReadoutProps {
  /** Etykieta sekcji, np. „Paliwo na pokładzie". */
  label: string;
  /** Sformatowana wartość; `null` = brak danych (mockup: „— —"). */
  value: string | null;
  unit: string;
  /** Ton wartości: `amber` dla paliwa, `neutral` dla motogodzin. */
  tone?: Tone;
  freshness: Freshness;
  /** Czas ostatniej synchronizacji do adnotacji `cache`. */
  syncedAt?: string | null;
  /** Podpis pod wartością, np. „45% pojemności · zbiorniki 330 L". */
  caption?: string;
  /** Wstawka między adnotacją a podpisem — pasek poziomu paliwa. */
  gauge?: React.ReactNode;
  /** Korekta odczytu. Przy `freshness === 'brak'` przycisk sam zmienia się w wezwanie. */
  onCorrect: () => void;
  correctLabel?: string;
  missingLabel?: string;
  /** Historia prowadząca do tej wartości. */
  trail?: TrailRow[];
  style?: ViewStyle;
}

export function Readout({
  label,
  value,
  unit,
  tone = 'neutral',
  freshness,
  syncedAt,
  caption,
  gauge,
  onCorrect,
  correctLabel = 'Koryguj',
  missingLabel = 'Wpisz odczyt',
  trail = [],
  style,
}: ReadoutProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const amber = toneColors(theme, 'amber');
  const missing = freshness === 'brak' || value == null;

  return (
    <View
      style={[
        {
          gap: 10,
          padding: theme.spacing.lg - 2,
          borderRadius: theme.radius.lg,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.left}>
          <AppText variant="mono" tone="muted" style={styles.label}>
            {label}
          </AppText>

          <View style={styles.valueRow}>
            <AppText
              variant="mono"
              style={{
                fontFamily: theme.fontFamily.monoBold,
                fontSize: 30,
                lineHeight: 32,
                color: missing
                  ? theme.colors.textMuted
                  : tone === 'neutral'
                    ? theme.colors.textPrimary
                    : c.accent,
              }}
            >
              {value ?? '— —'}
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.unit}>
              {unit}
            </AppText>
          </View>

          <FreshnessNote state={freshness} syncedAt={syncedAt} />

          {!missing && gauge}

          {caption != null && !missing && (
            <AppText variant="mono" tone="muted" style={styles.caption}>
              {caption}
            </AppText>
          )}
        </View>

        {/* Cel dotykowy 44 px — próg dla rękawic (ten sam co w `ActionButton`). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${missing ? missingLabel : correctLabel}: ${label}`}
          onPress={onCorrect}
          style={({ pressed }) => [
            styles.correct,
            {
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: theme.radius.sm,
              borderWidth: theme.borderWidth,
              borderColor: missing ? amber.border : theme.colors.borderStrong,
              backgroundColor: missing ? amber.muted : 'transparent',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Icon
            name="edit"
            size={10}
            color={missing ? amber.accent : theme.colors.textSecondary}
          />
          <AppText
            variant="mono"
            style={[
              styles.correctLabel,
              { color: missing ? amber.accent : theme.colors.textSecondary },
            ]}
          >
            {missing ? missingLabel : correctLabel}
          </AppText>
        </Pressable>
      </View>

      {!missing && <Trail rows={trail} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  left: { flex: 1, gap: 4 },
  label: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  unit: { fontSize: 15 },
  caption: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
  correct: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  correctLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
});
