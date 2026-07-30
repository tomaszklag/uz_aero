/**
 * UZ Aero — testy geometrii unoszenia pola nad klawiaturę (`ui/hooks/keyboardGeometry`).
 *
 * Samego zachowania klawiatury tu nie sprawdzimy — jest natywne, w Node nie istnieje.
 * Testowalna jest jedna rzecz, i to ta, która się psuła: decyzja O ILE przewinąć.
 * Scenariusze poniżej to prawdziwa geometria zgłoszenia (telefon 2400×1080 @ 2.75,
 * czyli ~873 dp wysokości okna, klawiatura ~310 dp → krawędź na ~563 dp).
 */

import { hiddenBelowKeyboard } from '../ui/hooks/keyboardGeometry';

const KEYBOARD_TOP = 563;

describe('hiddenBelowKeyboard', () => {
  it('pole schowane pod klawiaturą — przewijamy o brakującą różnicę z zapasem', () => {
    // Dół pola na 600, czyli 37 dp pod krawędzią klawiatury; +16 dp zapasu = 53.
    expect(hiddenBelowKeyboard(552, 48, KEYBOARD_TOP)).toBe(53);
  });

  it('pole wysoko nad klawiaturą — nie ruszamy przewinięcia', () => {
    expect(hiddenBelowKeyboard(120, 48, KEYBOARD_TOP)).toBe(0);
  });

  it('nigdy nie zwraca wartości ujemnej — przewinięcie „w drugą stronę" byłoby szarpnięciem', () => {
    expect(hiddenBelowKeyboard(0, 48, KEYBOARD_TOP)).toBe(0);
  });

  it('pole dokładnie na krawędzi klawiatury liczy się jako zakryte — o szerokość zapasu', () => {
    // Dół pola == krawędź klawiatury: technicznie widoczne, wizualnie wciśnięte pod nią.
    expect(hiddenBelowKeyboard(515, 48, KEYBOARD_TOP)).toBe(16);
  });

  it('zapas jest odejmowany od widoczności, nie dodawany do niej', () => {
    // Bez zapasu to samo pole byłoby uznane za widoczne — zapas ma je podnieść.
    expect(hiddenBelowKeyboard(515, 48, KEYBOARD_TOP, 0)).toBe(0);
    expect(hiddenBelowKeyboard(515, 48, KEYBOARD_TOP, 40)).toBe(40);
  });

  it('wysokie pole (wieloliniowe) liczy się dołem, nie górą', () => {
    // Góra nad klawiaturą, dół pod nią — samo `inputTop` uznałoby je za widoczne.
    expect(hiddenBelowKeyboard(500, 120, KEYBOARD_TOP)).toBe(73);
  });
});
