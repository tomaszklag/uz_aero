/**
 * UZ Aero — Avatar
 *
 * Kafelek z inicjałami (`.pilot-avatar` 40 px, `.crew-avatar` 32 px w mockupach).
 * Zaokrąglony kwadrat, nie koło — tak jest w designie i tak odróżnia się od kółka
 * zaznaczenia w tym samym wierszu.
 *
 * Inicjały liczymy z imienia i nazwiska, bo w bazie mamy `name`, a nie osobne pola.
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tone';

export type AvatarSize = 'sm' | 'md';

export interface AvatarProps {
  /** Pełne imię i nazwisko — inicjały wyliczamy sami. */
  name: string;
  size?: AvatarSize;
  /** `neutral` = pozycja nie wybrana, `green` = wybrana / zalogowany pilot. */
  tone?: Tone;
  style?: ViewStyle;
}

/** „Tomasz Małkiewicz" → „TM"; jednoczłonowe → pierwsza litera. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function Avatar({ name, size = 'md', tone = 'neutral', style }: AvatarProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);
  const box = size === 'md' ? 40 : 32;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: box,
          height: box,
          borderRadius: size === 'md' ? 11 : 9,
          borderWidth: theme.borderWidth,
          borderColor: tone === 'neutral' ? theme.colors.border : c.border,
          backgroundColor: tone === 'neutral' ? theme.colors.surface : c.muted,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        },
        style,
      ]}
    >
      <AppText
        variant="display"
        style={{ color: c.accent, fontSize: size === 'md' ? 17 : 14, letterSpacing: 1 }}
      >
        {initialsOf(name)}
      </AppText>
    </View>
  );
}
