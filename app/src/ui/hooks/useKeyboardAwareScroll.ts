/**
 * UZ Aero — zogniskowane pole zawsze nad klawiaturą.
 *
 * Skrócenie ekranu o wysokość klawiatury (`Screen` + `useKeyboardHeight`) samo nie
 * wystarcza. Natywny Android przewija zogniskowane pole do widoku w chwili OGNISKOWANIA,
 * czyli **przed** wysunięciem klawiatury — mierzy się wtedy z pełną wysokością ekranu
 * i zatrzymuje za wcześnie. Klawiatura wjeżdża sekundę później i znowu przykrywa input.
 *
 * Ten hook domyka sprawę z drugiej strony: czeka na zdarzenie klawiatury, więc zna już
 * jej górną krawędź (`endCoordinates.screenY`), mierzy pole i dociąga listę dokładnie
 * o brakującą różnicę. Nic nie zgaduje — jeśli pole i tak jest widoczne, nie rusza
 * przewinięcia.
 *
 * Dlaczego nie `KeyboardAvoidingView`: patrz nota w `useKeyboardHeight`. Dlaczego nie
 * `react-native-keyboard-controller`: to moduł natywny, wymagałby przebudowy buildu —
 * sięgamy po niego dopiero, gdy ta droga okaże się niewystarczająca.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

import { hiddenBelowKeyboard } from './keyboardGeometry';

export interface KeyboardAwareScroll {
  /** Podłącz do `ScrollView`. */
  ref: React.RefObject<ScrollView | null>;
  /** Podłącz do `onScroll` — `scrollTo` przyjmuje pozycję absolutną, więc musimy znać bieżącą. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

export function useKeyboardAwareScroll(): KeyboardAwareScroll {
  const ref = useRef<ScrollView | null>(null);
  const offset = useRef(0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  useEffect(() => {
    // iOS zna pozycję przed animacją (ruch jest wtedy płynny), Android dopiero po niej —
    // ten sam dobór zdarzeń co w `useKeyboardHeight`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';

    const sub = Keyboard.addListener(showEvent, (event) => {
      const scroll = ref.current;
      const input = TextInput.State.currentlyFocusedInput();
      // Klawiatura potrafi wyjść bez naszego pola (np. z arkusza nad ekranem — ten ma
      // własne unoszenie). Wtedy nie mamy czego dociągać.
      if (scroll == null || input == null) return;

      const keyboardTop = event.endCoordinates.screenY;
      input.measureInWindow((_x, y, _width, height) => {
        const hidden = hiddenBelowKeyboard(y, height, keyboardTop);
        if (hidden === 0) return;
        scroll.scrollTo({ y: offset.current + hidden, animated: true });
      });
    });

    return () => sub.remove();
  }, []);

  return { ref, onScroll, scrollEventThrottle: 16 };
}
