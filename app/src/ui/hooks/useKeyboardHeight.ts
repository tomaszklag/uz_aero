/**
 * UZ Aero — wysokość klawiatury ekranowej.
 *
 * Potrzebna, bo arkusze (`Sheet`) żyją w `Modal` z `statusBarTranslucent`, a takie okno
 * NIE kurczy się przy wysuwaniu klawiatury — systemowy `adjustResize` zmienia rozmiar
 * okna aplikacji, nie okna modalnego. Efekt: arkusz przyklejony do dołu ląduje pod
 * klawiaturą i pilot nie widzi pola, w które właśnie wpisuje odczyt.
 *
 * `KeyboardAvoidingView` w tej konfiguracji bywa zawodny (różni się między platformami
 * i reaguje na translucent status bar), więc bierzemy wysokość wprost ze zdarzeń
 * klawiatury i doklejamy ją jako margines. Zachowanie jest wtedy identyczne na obu
 * systemach i nie zależy od trybu `windowSoftInputMode`.
 *
 * iOS emituje `keyboardWill*` przed animacją (ruch jest płynny), Android tylko
 * `keyboardDid*` — stąd dobór zdarzeń per platforma.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
