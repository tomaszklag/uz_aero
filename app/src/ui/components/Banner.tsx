/**
 * UZ Aero — Banner (trzy typy, jeden zamykalny)
 *
 * Taksonomia z `docs/design-notes.md` — od typu zależy, czy wolno go zamknąć:
 *
 *  • `status`  — żywy stan (offline, tylko-odczyt, odliczanie okna korekty).
 *                To PRZYRZĄD, nie onboarding. **Nigdy zamykalny** — ukrycie go
 *                znaczy ukrycie stanu, którego pilot potrzebuje co spojrzenie.
 *  • `warning` — ostrzeżenie warunkowe (rozbieżność paliwa/MH, brak drugiego pilota).
 *                Pojawia się i znika **z warunkiem**; nie zamyka się ręcznie.
 *  • `edu`     — pouczający, jednorazowy. Pomocny za pierwszym razem, szum potem.
 *                **Zamykalny**: `×` chowa go, w jego miejscu zostaje mini-chip `(?)`.
 *
 * Stan schowania banera `edu` aplikacja zapamiętuje NA STAŁE per pilot — inaczej pilot
 * zamykałby go w kółko i wzorzec byłby gorszy niż jego brak. Tu przyjmujemy to przez
 * `dismissed` + `onDismiss`, żeby komponent pozostał bezstanowy.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tone';

export type BannerKind = 'status' | 'warning' | 'edu';

export interface BannerProps {
  kind: BannerKind;
  title?: string;
  text: string;
  /** Ikona po lewej (mockupy mają ją przy ostrzeżeniach — `.warning-box`). */
  icon?: IconName;
  /** Ton akcentu; domyślnie dobierany po rodzaju. */
  tone?: Tone;
  /** Dotyczy wyłącznie `edu`: czy baner jest schowany do mini-chipu. */
  dismissed?: boolean;
  /** Dotyczy wyłącznie `edu`: przełącza stan schowania (zapamiętaj go trwale!). */
  onDismiss?: (next: boolean) => void;
  /** Etykieta mini-chipu po zwinięciu (np. „Jak to działa?"). */
  collapsedLabel?: string;
  style?: ViewStyle;
}

const DEFAULT_TONE: Record<BannerKind, Tone> = {
  status: 'blue',
  warning: 'amber',
  edu: 'blue',
};

export function Banner({
  kind,
  title,
  text,
  icon,
  tone,
  dismissed = false,
  onDismiss,
  collapsedLabel = 'Wyjaśnienie',
  style,
}: BannerProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone ?? DEFAULT_TONE[kind]);
  const dismissible = kind === 'edu' && onDismiss != null;

  // Zwinięty baner pouczający — mini-chip w miejscu, w którym stał.
  if (dismissible && dismissed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Pokaż wyjaśnienie: ${collapsedLabel}`}
        onPress={() => onDismiss?.(false)}
        style={[
          styles.mini,
          {
            minHeight: 34,
            gap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.pill,
            borderWidth: theme.borderWidth,
            borderColor: c.border,
            backgroundColor: c.muted,
          },
          style,
        ]}
      >
        <AppText variant="label" style={{ color: c.accent }}>
          ? {collapsedLabel}
        </AppText>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.banner,
        {
          gap: theme.spacing.xs,
          padding: theme.spacing.md,
          paddingRight: dismissible ? 44 : theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: c.border,
          backgroundColor: c.muted,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {icon != null && <Icon name={icon} size={20} color={c.accent} style={styles.icon} />}
        <View style={styles.content}>
          {title != null && (
            <AppText variant="label" style={{ color: c.accent }}>
              {title}
            </AppText>
          )}
          <AppText variant="body" tone="secondary">
            {text}
          </AppText>
        </View>
      </View>

      {dismissible && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rozumiem, schowaj wyjaśnienie"
          onPress={() => onDismiss?.(true)}
          hitSlop={8}
          style={styles.close}
        >
          <AppText variant="body" tone="muted">
            ✕
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'relative' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  content: { flex: 1, gap: 4 },
  icon: { marginTop: 1 },
  close: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mini: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
});
