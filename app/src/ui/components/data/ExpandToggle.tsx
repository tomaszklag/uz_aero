/**
 * Ninerdeck - ExpandToggle (`.expand` z makiet 24 i 32B): droga do RESZTY, rozwijana w miejscu.
 *
 * Przerywana ramka w tonie podpisu - to nie jest akcja ekranu, tylko wejście w to, czego
 * patrzący zwykle nie szuka („Pozostali adresaci · 4 · zlecenie nieaktualne"). Rozwija się
 * W MIEJSCU, bez osobnego ekranu; szewron obraca się, gdy lista stoi otwarta.
 *
 * Pogrubiony człon (`strong`) niesie liczbę - tę samą, którą pokaże rozwinięcie.
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';

export interface ExpandToggleProps {
  parts: readonly { text: string; strong?: boolean }[];
  open: boolean;
  onToggle: () => void;
}

export function ExpandToggle({ parts, open, onToggle }: ExpandToggleProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const label = parts.map((p) => p.text).join('');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={({ pressed }) => [s.expand, pressed && { borderColor: theme.colors.textMuted }]}
    >
      <AppText variant="micro" style={[s.label, s.block]}>
        {parts.map((part, i) => (
          <AppText key={i} variant="micro" style={[s.label, part.strong === true && s.strong]}>
            {part.text}
          </AppText>
        ))}
      </AppText>
      <Icon name="expand" size={14} color={theme.colors.textMuted} style={open ? s.flipped : undefined} />
    </Pressable>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    expand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 42,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.colors.borderStrong,
    },
    block: { flex: 1 },
    label: { color: t.colors.textMuted },
    // Grubość osobnym plikiem kroju - `fontWeight` na Androidzie nie działa na krojach z pakietu.
    strong: { fontFamily: t.fontFamily.monoBold, color: t.colors.textSecondary },
    flipped: { transform: [{ rotate: '180deg' }] },
  });
