/**
 * UZ Aero — geometria unoszenia pola nad klawiaturę.
 *
 * Osobny plik, bo osobny powód istnienia: to jedyna DECYZJA, jaką podejmuje
 * `useKeyboardAwareScroll`, i jedyna jego część sprawdzalna bez urządzenia. Hook obok
 * importuje `react-native` (zdarzenia klawiatury, `TextInput.State`), a testy w tym
 * projekcie są RN-free z założenia (`jest.config.js`) — arytmetyka musi więc mieszkać
 * tam, gdzie Jest ją widzi.
 *
 * HISTORIA POMYŁKI (warta zapamiętania, bo kosztowała dwie tury zgłoszenia). Pierwsza
 * wersja liczyła różnicę między dolną krawędzią pola z `measureInWindow` a górną
 * krawędzią klawiatury z `endCoordinates.screenY`. To DWA różne układy współrzędnych —
 * okna i ekranu — więc wynik był zaniżony o stałą rzędu wysokości status bara i pole
 * wyjeżdżało tylko do połowy. Teraz wszystko liczymy w układzie TREŚCI listy
 * (`measureLayout` względem widoku wewnętrznego `ScrollView`), a wynik jest pozycją
 * BEZWZGLĘDNĄ — nie zależy ani od bieżącego przewinięcia, ani od tego, gdzie na ekranie
 * stoi sama lista.
 */

/**
 * Zapas pod dolną krawędzią pola. Pole ma być widoczne z powietrzem wokół, a nie
 * stykać się z klawiaturą pikselem — przy zerze input wygląda jak wciśnięty pod nią.
 * Przy 24 dp widać jeszcze początek podpowiedzi pod polem (`TextField hint`).
 */
export const KEYBOARD_CLEARANCE = 24;

/**
 * Docelowe przewinięcie listy, przy którym całe pole stoi nad klawiaturą.
 *
 * Wszystko w układzie TREŚCI listy (rosnącym w dół, niezależnym od przewinięcia):
 *  • `inputTop`, `inputHeight` — z `measureLayout` względem widoku wewnętrznego,
 *  • `viewportHeight` — wysokość WIDOCZNEJ części listy, czyli już po skróceniu
 *    ekranu o klawiaturę (`Screen` + `useKeyboardHeight`).
 *
 * Liczymy DOŁEM pola, nie górą — pole wieloliniowe potrafi mieć górną krawędź nad
 * klawiaturą, a dolną pod nią, i wtedy nadal jest nieczytelne. Wynik nigdy nie jest
 * ujemny: pole mieszczące się w pierwszym ekranie nie wymaga przewijania.
 */
export function scrollTargetForInput(
  inputTop: number,
  inputHeight: number,
  viewportHeight: number,
  clearance: number = KEYBOARD_CLEARANCE,
): number {
  return Math.max(0, inputTop + inputHeight + clearance - viewportHeight);
}
