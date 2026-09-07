/**
 * UZ Aero - wysokość klawiatury ekranowej.
 *
 * Potrzebna, bo arkusze (`Sheet`) żyją w `Modal` z `statusBarTranslucent`, a takie okno
 * NIE kurczy się przy wysuwaniu klawiatury - systemowy `adjustResize` zmienia rozmiar
 * okna aplikacji, nie okna modalnego. Efekt: arkusz przyklejony do dołu ląduje pod
 * klawiaturą i pilot nie widzi pola, w które właśnie wpisuje odczyt.
 *
 * `KeyboardAvoidingView` w tej konfiguracji bywa zawodny (różni się między platformami
 * i reaguje na translucent status bar), więc bierzemy wysokość wprost ze zdarzeń
 * klawiatury i doklejamy ją jako margines. Zachowanie jest wtedy identyczne na obu
 * systemach i nie zależy od trybu `windowSoftInputMode`.
 *
 * iOS emituje `keyboardWill*` przed animacją (ruch jest płynny), Android tylko
 * `keyboardDid*` - stąd dobór zdarzeń per platforma.
 *
 * Sama `height` ze zdarzenia nie wystarcza na Androidzie edge-to-edge - dlaczego,
 * i skąd bierze się druga miara, mówi `keyboardBottomOffset`.
 */

import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

import { keyboardBottomOffset } from './keyboardGeometry';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => {
      // Wysokość okna czytamy przy każdym zdarzeniu, nie raz - obrót ekranu i tryb
      // wielookienny zmieniają ją bez odmontowania hooka.
      const windowHeight = Dimensions.get('window').height;
      setHeight(
        keyboardBottomOffset(e.endCoordinates.height, e.endCoordinates.screenY, windowHeight),
      );
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
