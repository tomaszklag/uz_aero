/**
 * Ninerdeck - „SPRAWDŹ POCZTĘ": stan PO wysłaniu listu z linkiem (00G i 00H).
 *
 * Jeden komponent na dwa ekrany, bo makiety rysują tu DOKŁADNIE to samo - kartę
 * potwierdzenia, adres i wyjście - a różni je jedno zdanie. Dwie kopie rozjechałyby się
 * przy pierwszej poprawce jednej z nich, a to jest treść, której nie wolno różnicować
 * przypadkiem: obie muszą odpowiadać tak samo dla adresu znanego i obcego.
 *
 * ADRES POWTARZAMY, bo jest jedyną rzeczą, którą pilot może tu sprawdzić: literówka
 * w adresie jest najczęstszym powodem, dla którego list „nie przyszedł". Mono, bo to
 * wartość maszynowa, a nie zdanie.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { ActionButton } from '../data/ActionButton';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { StatusCard } from './StatusCard';

export interface LinkSentProps {
  title: string;
  text: string;
  /** Adres, na który poszedł list - dokładnie ten, który pilot wpisał. */
  email: string;
  onBack: () => void;
}

export function LinkSent({ title, text, email, onBack }: LinkSentProps) {
  const { theme } = useTheme();

  return (
    <>
      <StatusCard icon="done" title={title} body={text} tone="green" style={styles.card} />

      <View
        style={[
          styles.mail,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Icon name="mail" size={16} color={theme.colors.textMuted} />
        <AppText variant="mono" numberOfLines={1} style={styles.address}>
          {email}
        </AppText>
      </View>

      <ActionButton label="WRÓĆ DO LOGOWANIA" tone="green" variant="solid" onPress={onBack} />
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  mail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  address: { flexShrink: 1, fontSize: 13, letterSpacing: 0.5 },
});
