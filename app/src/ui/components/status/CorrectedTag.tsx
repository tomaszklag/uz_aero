/**
 * UZ Aero - plakietka „POPR." (issue #43).
 *
 * ══ CO ZNACZY ══
 * „Ta wartość nie jest tą, którą zapisał przyrząd" - fakt o danych, nie akcja. Dlatego
 * widać ją w OBU trybach ekranu sesji: także w odczycie i w podglądzie po oknie 24 h,
 * gdzie niczego już nie da się zmienić. Zamknięte okno odbiera prawo do zmiany danych,
 * nie do ich zrozumienia.
 *
 * ══ DLACZEGO JEST KLIKALNA ══
 * Bo naturalne następne pytanie brzmi „to co właściwie zmieniono", a w trybie odczytu
 * plakietka jest JEDYNĄ drogą do odpowiedzi: arkusz korekty, który niesie wejście
 * w historię, otwiera się tylko w edycji.
 *
 * ══ DLACZEGO `hitSlop`, A NIE WIĘKSZA PLAKIETKA ══
 * Napis ma 7,5 px i taki ma zostać: „popr." jest przypisem do nazwy zdarzenia, a nie
 * przyciskiem. Powiększony do celu dotknięcia zacząłby konkurować z treścią wiersza,
 * a wiersz osi w trybie odczytu ma 28 px (issue #40) i rytmu 44 px nie odzyska.
 * `hitSlop` rozciąga sam obszar reakcji - wygląd zostaje, kciuk trafia.
 */

import React from 'react';
import { Pressable } from 'react-native';

import { Tag } from './Tag';

export interface CorrectedTagProps {
  /**
   * Otwarcie historii zmian. Pominięte - plakietka jest samym napisem (tak stoi
   * w arkuszach, gdzie wejście w historię ma już własny wiersz).
   */
  onPress?: () => void;
  /** Co opisuje plakietka - do czytnika ekranu („Lądowanie 09:41"). */
  accessibilityContext?: string;
}

export function CorrectedTag({ onPress, accessibilityContext }: CorrectedTagProps) {
  const tag = <Tag label="popr." tone="amber" size="sm" />;
  if (onPress == null) return tag;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityContext == null
          ? 'Historia zmian'
          : `Historia zmian: ${accessibilityContext}`
      }
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      {tag}
    </Pressable>
  );
}
