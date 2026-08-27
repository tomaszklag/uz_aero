/**
 * UZ Aero — placeholder rysowany NAD polem wpisu (issue #58, kolejna tura).
 *
 * Reguła design systemu: placeholder jest ZAWSZE składem tekstowym — body 15
 * w `textPlaceholder` — bo to instrukcja („Kod ICAO albo nazwa…"), nie wartość.
 * Pola tekstowe (notatka, klient) mają to za darmo: natywny placeholder dziedziczy
 * metrykę pola, a pole JEST tekstowe. Pole MONO — wyszukiwarka lotniska — nie ma
 * jak: placeholderowi `TextInput` nie da się nadać osobnego kroju, a zmiana kroju
 * całego POLA przy pustym stanie zmieniałaby jego wysokość (dokładnie ten błąd,
 * który wygonił pole wpisu na dół arkusza).
 *
 * Stąd NAKŁADKA: pole trzyma swoją metrykę ZAWSZE (zero skakania), a zachętę
 * rysuje osobny tekst nad nim, gaszony pierwszą literą. Rysuje się POD polem
 * w porządku warstw wołającego (nakładka pierwsza, pole po niej) — kursor
 * i wpisywane znaki mają malować się na wierzchu, jak przy placeholderze
 * natywnym. `pointerEvents="none"`: tapnięcie trafia w pole, nie w napis.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';

export function PlaceholderOverlay({ visible, text }: { visible: boolean; text: string }) {
  const { theme } = useTheme();
  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <AppText
        variant="body"
        numberOfLines={1}
        style={{ fontSize: 15, lineHeight: 20, color: theme.colors.textPlaceholder }}
      >
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pion środkuje pudełko nakładki rozpięte na całym polu — nie ręcznie dobrana
  // linia bazowa, która rozjechałaby się przy każdej zmianie metryki pola.
  wrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
});
