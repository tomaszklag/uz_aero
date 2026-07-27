/**
 * UZ Aero — IdentityStrip (`.pilot-strip` z mockupu 02)
 *
 * Pasek „kto jest zalogowany": awatar, nazwisko, druga linia, rola.
 *
 * To nie ozdoba. `CLAUDE.md` mówi: *tożsamość pilota jest znana w całej sesji — NIE pytamy
 * o kod pilota w formularzach*. Skoro nie pytamy, to musimy **pokazać** — inaczej pilot
 * nie ma jak sprawdzić, na czyje konto właśnie zapisuje dzień lotny. Ten pasek jest
 * odpowiedzią na pytanie, którego formularz celowo nie zadaje.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Tag } from './Tag';
import { toneColors, type Tone } from './tone';

export interface IdentityStripProps {
  name: string;
  /** Druga linia — e-mail, kod pilota, godzina zalogowania. */
  subtitle?: string;
  /** Rola po prawej (np. „PIC"). */
  badge?: string;
  tone?: Tone;
  /** Dodatkowa akcja po prawej (np. zmiana konta). */
  right?: React.ReactNode;
  style?: ViewStyle;
}

export function IdentityStrip({
  name,
  subtitle,
  badge,
  tone = 'green',
  right,
  style,
}: IdentityStripProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  return (
    <View
      style={[
        styles.strip,
        {
          gap: theme.spacing.md,
          padding: theme.spacing.md,
          borderRadius: theme.radius.lg,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <Avatar name={name} size="md" tone={tone} />

      <View style={styles.info}>
        <AppText variant="label" numberOfLines={1}>
          {name}
        </AppText>
        {subtitle != null && (
          <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </AppText>
        )}
      </View>

      {badge != null && <Tag label={badge} tone={tone} size="md" />}
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1, minWidth: 0, gap: 2 },
  subtitle: { fontSize: 10, letterSpacing: 0.5 },
});
