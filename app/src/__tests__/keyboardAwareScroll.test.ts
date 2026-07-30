/**
 * UZ Aero — testy geometrii unoszenia pola nad klawiaturę (`ui/hooks/keyboardGeometry`).
 *
 * Samego zachowania klawiatury tu nie sprawdzimy — jest natywne, w Node nie istnieje.
 * Testowalna jest jedna rzecz, i to ta, która się psuła dwie tury z rzędu: DOKĄD
 * przewinąć listę. Wszystkie liczby w układzie treści (`measureLayout`), więc wynik
 * jest pozycją bezwzględną, nie deltą.
 *
 * Scenariusze z prawdziwej geometrii zgłoszenia: preflight na telefonie 2400×1080 @ 2.75
 * (~873 dp okna), klawiatura ~310 dp → widoczna część listy ~490 dp po odjęciu nagłówka.
 */

import { KEYBOARD_CLEARANCE, scrollTargetForInput } from '../ui/hooks/keyboardGeometry';

const VIEWPORT = 490;

describe('scrollTargetForInput', () => {
  it('pole „Oznaczenie klienta" na dole długiego formularza — przewijamy pod jego dół', () => {
    // Pole w treści na 1180–1228; żeby dół + zapas 24 był widoczny w 490 dp okna,
    // trzeba stanąć na 1228 + 24 − 490.
    expect(scrollTargetForInput(1180, 48, VIEWPORT)).toBe(762);
  });

  it('pole mieszczące się w pierwszym ekranie nie wymaga przewijania', () => {
    expect(scrollTargetForInput(80, 48, VIEWPORT)).toBe(0);
  });

  it('nigdy nie zwraca wartości ujemnej — przewinięcie „w minus" byłoby szarpnięciem', () => {
    expect(scrollTargetForInput(0, 48, VIEWPORT)).toBe(0);
  });

  it('pole dokładnie na dolnej krawędzi okna liczy się jako zakryte — o szerokość zapasu', () => {
    // Dół pola == dolna krawędź widoku: technicznie widoczne, wizualnie wciśnięte
    // pod klawiaturę. Cel podnosi je o sam zapas.
    expect(scrollTargetForInput(VIEWPORT - 48, 48, VIEWPORT)).toBe(KEYBOARD_CLEARANCE);
  });

  it('liczymy DOŁEM pola — wieloliniowe z górą nad krawędzią wciąż trzeba podnieść', () => {
    // Góra na 400 (widoczna), dół na 520 (pod krawędzią 490): sama góra uznałaby
    // pole za widoczne i to był błąd, który pilot widział jako „ucięty input".
    expect(scrollTargetForInput(400, 120, VIEWPORT)).toBe(54);
  });

  it('zapas podnosi pole, a nie obniża — zero zapasu daje ciaśniejszy cel', () => {
    const tight = scrollTargetForInput(1180, 48, VIEWPORT, 0);
    const roomy = scrollTargetForInput(1180, 48, VIEWPORT, 40);
    expect(tight).toBe(738);
    expect(roomy).toBe(778);
    expect(roomy).toBeGreaterThan(tight);
  });

  it('mniejsze okno (wyższa klawiatura) wymaga większego przewinięcia', () => {
    const tallKeyboard = scrollTargetForInput(1180, 48, 380);
    expect(tallKeyboard).toBeGreaterThan(scrollTargetForInput(1180, 48, VIEWPORT));
  });

  it('zapas domyślny wystarcza na początek podpowiedzi pod polem', () => {
    // Regresja na stałą: 16 dp okazało się za mało (pilot: „widać do połowy inputa"),
    // 24 dp odsłania też pierwszą linię `TextField hint`.
    expect(KEYBOARD_CLEARANCE).toBeGreaterThanOrEqual(24);
  });
});
