/**
 * UZ Aero - HistoryLink: wejście w historię zmian (issue #43, arkusz `design/10i`).
 *
 * Wiersz, nie rozwinięta lista: przy pierwszej korekcie historia ma jeden wpis i
 * rozwinięta zajmowałaby miejsce, nie dając nic.
 *
 * ══ BEZ HISTORII WIERSZA NIE MA W OGÓLE ══
 * Zerowy licznik nie jest informacją, tylko szumem - „Historia zmian · brak" to wiersz
 * o niczym, dokładnie jak „Notatki -" wyrzucone przy issue #40. Element widoczny
 * zawsze, a użyteczny rzadko, uczy oko go pomijać (reguła SyncChipa z issue #12) -
 * i to samo oko przegapi go wtedy, gdy w końcu coś w nim będzie.
 *
 * Renderowanie z pustym stanem trwało jedną iterację i zostało zdjęte po uwadze
 * z przeglądu: przy świeżo poprawianym zdarzeniu arkusz pokazywał „historię" sesji,
 * w której nikt jeszcze niczego nie zmienił.
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Tag } from '../status/Tag';

export interface HistoryLinkProps {
  /** Ile poprawek ma to zdarzenie. Zero = komponent nie renderuje NICZEGO. */
  count: number;
  onPress: () => void;
}

export function HistoryLink({ count, onPress }: HistoryLinkProps) {
  const { theme } = useTheme();
  if (count === 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Historia zmian, ${count}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: pressed ? theme.colors.blue : theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <Icon name="history" size={14} color={theme.colors.textMuted} />
      <AppText variant="body" tone="secondary" style={styles.label}>
        Historia zmian
      </AppText>
      {/* `alignSelf` jawnie: bez tego plakietka rozciąga się na wysokość wiersza (44 px)
          i jej napis siada wyżej niż etykieta obok - wygląda to jak przekrzywiony rząd. */}
      <Tag label={String(count)} tone="blue" style={styles.count} />
      <Icon name="more" size={13} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44 px - cel dotknięcia, ten sam próg co reszta arkusza.
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, paddingHorizontal: 13 },
  label: { flex: 1, fontSize: 12 },
  count: { alignSelf: 'center' },
});
