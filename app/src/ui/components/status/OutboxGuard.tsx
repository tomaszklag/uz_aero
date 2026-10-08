/**
 * Ninerdeck - OutboxGuard (`.outbox-guard` z mockupów 00 i 13)
 *
 * Amber-box ochrony konta (§3.0): tłumaczy, DLACZEGO zmiana konta jest zablokowana
 * przy niepustym outboxie i co się stanie samo (wysyłka po powrocie zasięgu).
 * Jeden komponent zamiast kopii per ekran - wzorzec wraca przy każdej ścieżce
 * prowadzącej do wylogowania (zamek 00, ustawienia 13, przyszłe warianty).
 *
 * Język pilota, nie systemu: bez słowa „outbox" - mówimy o zapisach dnia.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { plural } from '../../format';

export interface OutboxGuardProps {
  /** Liczba zapisów czekających na wysyłkę. */
  count: number;
  /** Człon po pogrubionym leadzie; domyślnie wariant z ekranu 13. */
  tail?: string;
  style?: ViewStyle;
}

export function OutboxGuard({
  count,
  tail = '. Wylogujesz się, gdy się wyślą - wystarczy zasięg, wysyłka ruszy sama.',
  style,
}: OutboxGuardProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.box,
        {
          backgroundColor: theme.colors.amberMuted,
          borderColor: theme.colors.amberBorder,
          borderWidth: theme.borderWidth,
        },
        style,
      ]}
    >
      <Icon name="warning" size={13} color={theme.colors.amber} />
      <AppText variant="body" tone="secondary" style={styles.text}>
        <AppText
          variant="body"
          style={[styles.text, { color: theme.colors.amber, fontFamily: theme.fontFamily.bodySemiBold }]}
        >
          {`${count} ${plural(count, 'zapis czeka', 'zapisy czekają', 'zapisów czeka')} na wysyłkę`}
        </AppText>
        {tail}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: 320,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  text: { flex: 1, fontSize: 10.5, lineHeight: 16 },
});
