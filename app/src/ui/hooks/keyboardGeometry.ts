/**
 * UZ Aero — geometria unoszenia pola nad klawiaturę.
 *
 * Osobny plik, bo osobny powód istnienia: to jedyna DECYZJA, jaką podejmuje
 * `useKeyboardAwareScroll`, i jedyna jego część sprawdzalna bez urządzenia. Hook obok
 * importuje `react-native` (zdarzenia klawiatury, `TextInput.State`), a testy w tym
 * projekcie są RN-free z założenia (`jest.config.js`) — arytmetyka musi więc mieszkać
 * tam, gdzie Jest ją widzi.
 */

/**
 * Zapas między dolną krawędzią pola a klawiaturą. Pole ma być widoczne, a nie stykać
 * się z nią pikselem — przy zerze input wygląda jak wciśnięty pod klawiaturę.
 */
export const KEYBOARD_CLEARANCE = 16;

/**
 * O ile trzeba przewinąć listę, żeby pole wyszło nad klawiaturę. `0` = już widoczne.
 *
 * Wszystkie wielkości w jednym układzie: współrzędne okna, rosnące w dół. `inputTop`
 * i `inputHeight` z `measureInWindow`, `keyboardTop` z `endCoordinates.screenY`
 * (edge-to-edge znosi różnicę między oknem a ekranem, więc nie trzeba ich godzić).
 *
 * Liczymy DOŁEM pola, nie górą — pole wieloliniowe potrafi mieć górną krawędź nad
 * klawiaturą, a dolną pod nią, i wtedy nadal jest nieczytelne.
 */
export function hiddenBelowKeyboard(
  inputTop: number,
  inputHeight: number,
  keyboardTop: number,
  clearance: number = KEYBOARD_CLEARANCE,
): number {
  return Math.max(0, inputTop + inputHeight + clearance - keyboardTop);
}
