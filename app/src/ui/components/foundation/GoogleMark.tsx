/**
 * UZ Aero - znak „G" Google przy przycisku logowania (mockup 00a).
 *
 * ══ JEDYNE MIEJSCE W APLIKACJI Z KOLORAMI SPOZA TOKENÓW ══
 * To jest ZNAK TOWAROWY Google i jego barwy są częścią znaku, a nie decyzją
 * o kolorystyce aplikacji - ten sam świadomy wyjątek, który makieta 00a zapisuje przy
 * `.g-mark`. Wszystko wokół (przycisk, napis) jest na tokenach.
 *
 * ══ BEZ SVG, BO PROJEKT NIE MA `react-native-svg` ══
 * Litera G to pierścień z czterech kolorowych ćwiartek (jeden `View` z osobnym
 * kolorem każdej krawędzi, obrócony tak, żeby czerwień zaczynała się od góry),
 * przerwa w prawym górnym sektorze zasłonięta TŁEM przycisku i niebieska
 * poprzeczka. Przybliżenie, nie wektor - ale rozpoznawalne w 20 px i zgodne
 * z regułą „bez modułów natywnych", przez którą mapa śladu ma własny renderer.
 * Dlatego komponent potrzebuje koloru tła: przerwa jest MASKĄ, nie dziurą.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

const G_BLUE = '#4285F4';
const G_RED = '#EA4335';
const G_YELLOW = '#FBBC05';
const G_GREEN = '#34A853';

export interface GoogleMarkProps {
  size?: number;
  /** Tło, na którym stoi znak - zasłania przerwę litery. */
  background: string;
  style?: ViewStyle;
}

export function GoogleMark({ size = 20, background, style }: GoogleMarkProps) {
  const stroke = Math.max(3, Math.round(size * 0.22));
  return (
    <View style={[{ width: size, height: size }, style]} accessibilityElementsHidden>
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderTopColor: G_RED,
            borderLeftColor: G_YELLOW,
            borderBottomColor: G_GREEN,
            borderRightColor: G_BLUE,
          },
        ]}
      />
      {/* Przerwa litery: prawy górny sektor pod kolor tła. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: size * 0.5,
          height: size * 0.42,
          backgroundColor: background,
        }}
      />
      {/* Poprzeczka - od środka w prawo, na wysokości osi. */}
      <View
        style={{
          position: 'absolute',
          top: size / 2 - stroke / 2,
          right: 0,
          width: size * 0.5,
          height: stroke,
          backgroundColor: G_BLUE,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Obrót w lewo przesuwa szwy między ćwiartkami tak, że czerwień zaczyna się nad
  // przerwą, a nie na jej środku - jak w oryginale, gdzie górny łuk jest czerwony.
  ring: { position: 'absolute', transform: [{ rotate: '-25deg' }] },
});
