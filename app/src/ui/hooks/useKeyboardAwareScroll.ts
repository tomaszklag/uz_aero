/**
 * UZ Aero - zogniskowane pole zawsze CAŁE nad klawiaturą.
 *
 * Skrócenie ekranu o wysokość klawiatury (`Screen` + `useKeyboardHeight`) samo nie
 * wystarcza. Natywny Android przewija zogniskowane pole do widoku w chwili OGNISKOWANIA,
 * czyli **przed** wysunięciem klawiatury - mierzy się wtedy z pełną wysokością ekranu
 * i zatrzymuje za wcześnie. Klawiatura wjeżdża chwilę później i znowu przykrywa input.
 *
 * Ten hook domyka sprawę z drugiej strony i robi to w JEDNYM układzie współrzędnych -
 * układzie okna (patrz nota o pomyłkach w `keyboardGeometry`):
 *   1. czeka na skrócenie ekranu, nie na samo zdarzenie klawiatury - dlatego bierze
 *      `keyboardHeight` parametrem i działa w efekcie, czyli już PO tym, jak układ
 *      przeliczył się na mniejszą wysokość;
 *   2. mierzy DWIE rzeczy tym samym `measureInWindow` - pole i listę - więc porównuje
 *      krawędzie z jednego układu i nie potrzebuje referencji węzła nadrzędnego;
 *   3. przewija o brakującą różnicę względem bieżącego przewinięcia (`onScroll`,
 *      throttle 16 ms), bo dół listy jest tu jednocześnie górą klawiatury.
 *
 * Dlaczego nie `measureLayout` względem widoku treści, choć dawałby pozycję bezwzględną:
 * na Fabric wymaga referencji węzła nadrzędnego, a dostając cokolwiek innego wypisuje
 * „ref.measureLayout must be called with a ref to a native component" i nie mierzy nic -
 * mechanizm był martwy, a pilot widział czerwony błąd. `measureInWindow` nie ma argumentu,
 * o który można się pomylić, i zachowuje się tak samo na obu architekturach.
 *
 * Gdy pilot pisze w arkuszu (`Sheet` żyje w `Modal` i unosi się sam), pomiary są z dwóch
 * różnych okien i wynik nie ma sensu - ale też nie ma szkody: przewinięcie dotyczy listy
 * schowanej pod scrimem, a arkusz nie zależy od tego mechanizmu.
 *
 * Dlaczego nie `KeyboardAvoidingView`: patrz nota w `useKeyboardHeight`. Dlaczego nie
 * `react-native-keyboard-controller`: to moduł natywny, wymagałby przebudowy buildu -
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

import { scrollDeltaForInput } from './keyboardGeometry';

export interface KeyboardAwareScroll {
  /** Na `ScrollView` - stąd `scrollTo` i uchwyt natywnego widoku listy do pomiaru. */
  ref: React.RefObject<React.ComponentRef<typeof ScrollView> | null>;
  /** Na `onLayout` `ScrollView` - wysokość widocznej części listy po skróceniu. */
  onLayout: (event: LayoutChangeEvent) => void;
  /** Na `onScroll` - tylko po to, żeby wiedzieć, czy pole i tak jest już widoczne. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

export function useKeyboardAwareScroll(keyboardHeight: number): KeyboardAwareScroll {
  const ref = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const offset = useRef(0);

  // Wysokość widoku w stanie, nie w ref - jej zmiana (skrócenie o klawiaturę) MUSI
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
    // Klawiatura potrafi wyjść bez naszego pola (np. z arkusza nad ekranem - ten ma
    // własne unoszenie). Wtedy nie mamy czego dociągać.
    if (scroll == null || input == null) return;

    // Mierzymy natywny widok listy (`getNativeScrollRef`), nie komponent - pomiary są
    // metodami węzła natywnego i tylko ten uchwyt je wystawia.
    const scrollHost = scroll.getNativeScrollRef();
    if (scrollHost == null) return;

    // Najpierw lista: jej dolna krawędź (już po skróceniu o klawiaturę) jest granicą,
    // pod którą pole nie może kończyć. Zerowa wysokość = widok jeszcze nie ma układu.
    scrollHost.measureInWindow((_scrollX, scrollTop, _scrollWidth, scrollHeight) => {
      if (scrollHeight <= 0) return;

      input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
        if (inputHeight <= 0) return;

        const delta = scrollDeltaForInput(inputTop + inputHeight, scrollTop + scrollHeight);
        // Jeden piksel tolerancji na zaokrąglenia gęstości ekranu - pole widoczne
        // z zapasem nie ma być szarpane.
        if (delta <= 1) return;
        scroll.scrollTo({ y: offset.current + delta, animated: true });
      });
    });
  }, [keyboardHeight, viewport]);

  return { ref, onLayout, onScroll, scrollEventThrottle: 16 };
}
