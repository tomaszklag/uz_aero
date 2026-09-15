/**
 * Ninerdeck - Brand (`.brand` z 00/00a i `.app-icon`+`.app-name` z 01)
 *
 * Znak marki: kafel z monogramem `9`, „NINERDECK" (DECK zielone - jedyne miejsce łamiące zasadę
 * „display bez akcentu", celowo, bo to logo) i tagline. Dwa rozmiary z mockupów:
 * `md` - ekrany logowania (kafel 72, napis 40), `hero` - splash (kafel 88, napis 56).
 */

import React from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from './AppText';
import { toneColors } from '../tone';

export interface BrandProps {
  size?: 'md' | 'hero';
  /** Tagline pod nazwą - splash go ma, PIN nie (mockupy 01 vs 00). */
  tagline?: boolean;
  style?: ViewStyle;
}

export function Brand({ size = 'md', tagline = true, style }: BrandProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');
  const hero = size === 'hero';

  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[
          {
            width: hero ? 88 : 72,
            height: hero ? 88 : 72,
            borderRadius: hero ? 24 : 20,
            marginBottom: 6,
            borderWidth: theme.borderWidth,
            borderColor: green.border,
            backgroundColor: green.muted,
          },
          styles.icon,
        ]}
      >
        {/* Znak jedzie z generatora ikon (`npm run icons`), a nie z rejestru `Icon`:
            monogram ma być DOKŁADNIE tym kształtem, co ikona w launcherze. Plik jest biały,
            bo zieleń różni się między motywami - barwi go `tintColor`. */}
        <Image
          source={require('../../../../assets/brand-mark.png')}
          style={{ width: hero ? 44 : 36, height: hero ? 44 : 36, tintColor: green.accent }}
          accessibilityIgnoresInvertColors
        />
      </View>
      <AppText variant="display" style={hero ? styles.nameHero : styles.name}>
        NINER
        <AppText
          variant="display"
          style={[hero ? styles.nameHero : styles.name, { color: green.accent }]}
        >
          DECK
        </AppText>
      </AppText>
      {tagline && (
        <AppText variant="mono" tone="muted" style={styles.tagline}>
          Automatyczny logbook lotniczy
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 40, lineHeight: 42, letterSpacing: 5 },
  nameHero: { fontSize: 52, lineHeight: 54, letterSpacing: 6 },
  tagline: { fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase' },
});
