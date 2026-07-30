/**
 * UZ Aero — zogniskowane pole zawsze CAŁE nad klawiaturą.
 *
 * Skrócenie ekranu o wysokość klawiatury (`Screen` + `useKeyboardHeight`) samo nie
 * wystarcza. Natywny Android przewija zogniskowane pole do widoku w chwili OGNISKOWANIA,
 * czyli **przed** wysunięciem klawiatury — mierzy się wtedy z pełną wysokością ekranu
 * i zatrzymuje za wcześnie. Klawiatura wjeżdża chwilę później i znowu przykrywa input.
 *
 * Ten hook domyka sprawę z drugiej strony i robi to w JEDNYM układzie współrzędnych —
 * układzie treści listy (patrz nota o pomyłce w `keyboardGeometry`):
 *   1. czeka na skrócenie ekranu, nie na samo zdarzenie klawiatury — dlatego bierze
 *      `keyboardHeight` parametrem i działa w efekcie, czyli już PO tym, jak układ
 *      przeliczył się na mniejszą wysokość;
 *   2. mierzy pole względem widoku wewnętrznego `ScrollView` (`measureLayout`),
 *      więc dostaje jego pozycję w treści, nie na ekranie;
 *   3. przewija do pozycji BEZWZGLĘDNEJ — nie dodaje delty do bieżącego offsetu,
 *      więc nie da się pomylić o to, ile Android przewinął sam.
 *
 * Bieżące przewinięcie służy wyłącznie do odpowiedzi „czy w ogóle trzeba ruszać" —
 * pole już widoczne nie jest szarpane w górę.
 *
 * Dlaczego nie `KeyboardAvoidingView`: patrz nota w `useKeyboardHeight`. Dlaczego nie
 * `react-native-keyboard-controller`: to moduł natywny, wymagałby przebudowy buildu —
 * sięgamy po niego dopiero, gdy ta droga okaże się niewystarczająca.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TextInput,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

import { scrollTargetForInput } from './keyboardGeometry';

export interface KeyboardAwareScroll {
  /** Na `ScrollView` — stąd `scrollTo` i uchwyt widoku treści do pomiaru. */
  ref: React.RefObject<React.ComponentRef<typeof ScrollView> | null>;
  /** Na `onLayout` `ScrollView` — wysokość widocznej części listy po skróceniu. */
  onLayout: (event: LayoutChangeEvent) => void;
  /** Na `onScroll` — tylko po to, żeby wiedzieć, czy pole i tak jest już widoczne. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

export function useKeyboardAwareScroll(keyboardHeight: number): KeyboardAwareScroll {
  const ref = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const offset = useRef(0);

  // Wysokość widoku w stanie, nie w ref — jej zmiana (skrócenie o klawiaturę) MUSI
  // wznowić efekt. Kolejność zdarzeń klawiatury i przeliczenia układu nie jest
  // gwarantowana, więc nie zakładamy, która wartość dojdzie pierwsza: poprawka
  // wykona się na tej, która dojdzie ostatnia.
  const [viewport, setViewport] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent): void => {
    setViewport(event.nativeEvent.layout.height);
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  useEffect(() => {
    if (keyboardHeight <= 0 || viewport <= 0) return;

    const scroll = ref.current;
    const input = TextInput.State.currentlyFocusedInput();
    // Klawiatura potrafi wyjść bez naszego pola (np. z arkusza nad ekranem — ten ma
    // własne unoszenie). Wtedy nie mamy czego dociągać.
    if (scroll == null || input == null) return;

    // Uchwyt WIDOKU TREŚCI, nie samego `ScrollView` — pomiar względem niego daje
    // pozycję pola w treści, niezależną od tego, jak lista jest przewinięta.
    const content: unknown = scroll.getInnerViewNode();
    if (content == null) return;

    input.measureLayout(
      content as number,
      (_x, inputTop, _width, inputHeight) => {
        const target = scrollTargetForInput(inputTop, inputHeight, viewport);
        // Przewinięte już dalej niż cel = pole widoczne z zapasem. Jeden piksel
        // tolerancji na zaokrąglenia gęstości ekranu.
        if (offset.current >= target - 1) return;
        scroll.scrollTo({ y: target, animated: true });
      },
      // Pomiar zawodzi, gdy pole NIE jest potomkiem tej listy — tak jest za każdym
      // razem, gdy pilot pisze w arkuszu (`Sheet` żyje w `Modal` i unosi się sam).
      // To normalny przebieg, nie awaria: bez tej gałęzi RN zgłasza błąd pomiaru.
      () => undefined,
    );
  }, [keyboardHeight, viewport]);

  return { ref, onLayout, onScroll, scrollEventThrottle: 16 };
}
