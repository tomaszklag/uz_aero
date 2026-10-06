/**
 * Ninerdeck - STAN PUSTY i STAN BEZ ZASIĘGU ekranu sieciowego (`.empty-wrap`,
 * `.empty-warning`; makiety 25A/25B, 28E, 30A).
 *
 * Ten sam układ, inny ton. Pusty mówi, CO tu trafia, a nie „brak danych"; bez zasięgu
 * mówi, KTO trzyma te dane i co da się zrobić bez nich - pusta lista w tym miejscu
 * wyglądałaby jak „nic nie przyszło". Wyjęty ze skrzynki (25) przy zleceniach (4.0.0,
 * epik Z-C #247), bo lista i karta zlecenia mówią to samo tym samym kształtem.
 *
 * Ekrany o własnym kształcie braku (kalendarz 21B, karta maszyny 27C) zostają przy swoim -
 * ten komponent jest wzorcem ekranów-list, nie każdego ekranu bez danych.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon, type IconName } from '../foundation/Icon';

/** Jedna linijka zdania - kawałki z pogrubieniem tam, gdzie makieta stawia `<b>`. */
export type EmptyLine = { text: string; bold?: boolean }[];

export interface EmptyStateProps {
  tone: 'amber' | 'neutral';
  icon: IconName;
  title: string;
  lines: EmptyLine[];
}

export function EmptyState({ tone, icon, title, lines }: EmptyStateProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const amber = tone === 'amber';
  const accent = amber ? theme.colors.amber : theme.colors.textMuted;

  return (
    <View style={s.empty}>
      <View style={[s.emptyIcon, amber && s.emptyIconAmber]}>
        <Icon name={icon} size={26} color={accent} />
      </View>
      <AppText variant="display" style={[s.emptyTitle, amber && { color: theme.colors.amber }]}>
        {title}
      </AppText>
      {lines.map((line, i) => (
        <AppText key={i} variant="body" style={s.emptyText}>
          {line.map((part, k) => (
            <AppText key={k} variant="body" style={[s.emptyText, part.bold && s.emptyBold]}>
              {part.text}
            </AppText>
          ))}
        </AppText>
      ))}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      paddingHorizontal: 26,
      paddingBottom: 60,
    },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: t.borderWidth,
      borderColor: t.colors.borderStrong,
      backgroundColor: t.colors.surface,
    },
    emptyIconAmber: { borderColor: t.colors.amberBorder, backgroundColor: t.colors.amberMuted },
    emptyTitle: { fontSize: 30, lineHeight: 32, letterSpacing: 3, textAlign: 'center' },
    emptyText: { fontSize: 13, lineHeight: 19, color: t.colors.textSecondary, textAlign: 'center' },
    emptyBold: { color: t.colors.textPrimary, fontWeight: '600' },
  });
