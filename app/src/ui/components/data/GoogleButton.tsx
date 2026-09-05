/**
 * UZ Aero - przycisk „Kontynuuj z Google" (mockup 00a, `.btn-google`).
 *
 * NIE jest `ActionButton`: tamten jest zielonym CTA w Bebas, a przycisk dostawcy ma
 * być neutralny - ciemne tło, jasny napis, znak w oryginalnych barwach - czyli ciemny
 * wariant przycisku z wytycznych Google, złożony z tokenów aplikacji. Jeden wygląd,
 * bo jedno miejsce: ekran logowania.
 *
 * `busy` zamienia napis, nie chowa przycisku: zniknięcie wygląda tak samo przy
 * sukcesie i przy awarii (reguła „każda akcja zostawia ślad").
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '../../theme';
import { GoogleMark } from '../foundation/GoogleMark';

export interface GoogleButtonProps {
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}

export function GoogleButton({ onPress, busy = false, disabled = false }: GoogleButtonProps) {
  const { theme } = useTheme();
  const background = theme.colors.surfaceRaised;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Kontynuuj z Google"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: pressed ? theme.colors.greenBorder : theme.colors.borderStrong,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <GoogleMark size={20} background={background} />
      <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
        {busy ? 'Logowanie…' : 'Kontynuuj z Google'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    // 16 px z mockupu + 1 px ramki = 56 dp celu: ponad próg rękawic z §6.
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
  },
  // Archivo 15.5 / 600 z mockupu; rodzina wprost, bo pliki wag są osobnymi krojami.
  label: { fontFamily: 'Archivo_600SemiBold', fontSize: 15.5 },
});
