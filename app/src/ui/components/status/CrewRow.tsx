/**
 * UZ Aero — CrewRow (`.crew-row` z mockupu 07)
 *
 * Wiersz aktualnej załogi: badge roli, kod pilota dużym mono, opcjonalny znacznik
 * „zalogowany · Ty" i metadane po prawej (od kiedy, block time).
 *
 * Czym różni się od `CrewCard` (ekran 10): karta jest PODSUMOWANIEM dnia — statystyki
 * w pionie, do przepisania do dokumentów. Wiersz jest STANEM „kto teraz siedzi w kabinie"
 * — jedna linia, czytana przed decyzją o zmianie. Puste miejsce Duala to pełnoprawny
 * wiersz z kreską, nie brak wiersza: mockup pokazuje je zawsze, bo „nie ma Duala"
 * jest informacją.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Tag } from './Tag';
import { toneColors } from '../tone';

export interface CrewRowProps {
  /** Badge roli — „PIC" / „DUAL". */
  role: string;
  /** Kod pilota; null = miejsce puste. */
  pilotId: string | null;
  /** Znacznik „zalogowany · Ty" przy wierszu zalogowanego pilota. */
  you?: boolean;
  /** Pierwsza linia metadanych po prawej (np. „od 08:00"). */
  metaTop?: string;
  /** Druga linia (np. „block: 2:22") — jaśniejsza, bo to wartość, nie etykieta. */
  metaBottom?: string;
  style?: ViewStyle;
}

export function CrewRow({ role, pilotId, you = false, metaTop, metaBottom, style }: CrewRowProps) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');
  const empty = pilotId == null;

  return (
    <View
      style={[
        styles.row,
        {
          gap: 12,
          paddingHorizontal: 13,
          paddingVertical: 12,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceRaised,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.roleBadge,
          {
            borderWidth: theme.borderWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceHover,
          },
        ]}
      >
        <AppText variant="mono" tone="muted" style={styles.roleLabel}>
          {role}
        </AppText>
      </View>

      <Icon name="crew" size={16} color={empty ? theme.colors.textMuted : green.accent} />

      <AppText
        variant="mono"
        numberOfLines={1}
        style={[
          styles.name,
          empty
            ? { fontSize: 14, color: theme.colors.textMuted }
            : { fontFamily: theme.fontFamily.monoBold, color: green.accent },
        ]}
      >
        {pilotId ?? 'brak drugiego pilota'}
      </AppText>

      {you && <Tag label="zalogowany · Ty" tone="green" />}

      {(metaTop != null || metaBottom != null) && (
        <View style={styles.meta}>
          {metaTop != null && (
            <AppText variant="mono" tone="muted" style={styles.metaLine}>
              {metaTop}
            </AppText>
          )}
          {metaBottom != null && (
            <AppText variant="mono" tone="secondary" style={styles.metaLine}>
              {metaBottom}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  roleBadge: { width: 44, borderRadius: 6, paddingVertical: 3, alignItems: 'center', flexShrink: 0 },
  roleLabel: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  name: { flexShrink: 1, fontSize: 18, letterSpacing: 1.5 },
  meta: { marginLeft: 'auto', alignItems: 'flex-end', gap: 1 },
  metaLine: { fontSize: 10, lineHeight: 14, letterSpacing: 0.3 },
});
