/**
 * UZ Aero - Avatar
 *
 * Kafelek z inicjałami (`.pilot-avatar` 40 px, `.crew-avatar` 32 px w mockupach).
 * Zaokrąglony kwadrat, nie koło - tak jest w designie i tak odróżnia się od kółka
 * zaznaczenia w tym samym wierszu.
 *
 * Inicjały liczymy z imienia i nazwiska, bo w bazie mamy `name`, a nie osobne pola.
 *
 * Z KODEM (`code`) kafelek pokazuje kod pilota zamiast inicjałów - mono, bo tak zapisujemy
 * wszystkie kody w tej aplikacji (`CLAUDE.md`, sekcja Czcionki). Powód zmiany (issue #12):
 * w wierszu wyboru drugiego pilota kod stał już po prawej stronie, więc inicjały po lewej
 * były trzecim - i najmniej użytecznym - zapisem tej samej osoby. Kod jest tym, czym pilot
 * podpisuje się w papierach i czym woła go klub.
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from '../tone';

export type AvatarSize = 'sm' | 'md';

export interface AvatarProps {
  /** Pełne imię i nazwisko - inicjały wyliczamy sami. */
  name: string;
  /** Kod pilota („AKO"); podany - zastępuje inicjały i idzie czcionką mono. */
  code?: string;
  size?: AvatarSize;
  /** `neutral` = pozycja nie wybrana, `green` = wybrana / zalogowany pilot. */
  tone?: Tone;
  style?: ViewStyle;
}

/**
 * „Tomasz Małkiewicz" → „TM"; jednoczłonowe → pierwsza litera.
 *
 * NIE eksportowana: używa jej wyłącznie `Avatar` niżej. Eksport obok komponentu
 * odbierałby plikowi status granicy Fast Refresh (`docs/architektura-kodu.md` §2).
 */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function Avatar({ name, code, size = 'md', tone = 'neutral', style }: AvatarProps) {
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
      {code != null ? (
        // Trzy znaki kodu w kwadracie 32 px: mniejszy stopień i ciaśniejsze światło niż
        // przy dwuznakowych inicjałach - inaczej „AKO" rozpycha kafelek.
        <AppText
          variant="mono"
          numberOfLines={1}
          style={{
            fontFamily: theme.fontFamily.monoBold,
            color: c.accent,
            fontSize: size === 'md' ? 14 : 12,
            letterSpacing: 0.5,
          }}
        >
          {code}
        </AppText>
      ) : (
        <AppText
          variant="display"
          style={{ color: c.accent, fontSize: size === 'md' ? 17 : 14, letterSpacing: 1 }}
        >
          {initialsOf(name)}
        </AppText>
      )}
    </View>
  );
}
