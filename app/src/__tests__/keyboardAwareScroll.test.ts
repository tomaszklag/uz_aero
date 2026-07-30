/**
 * UZ Aero — testy geometrii unoszenia pola nad klawiaturę (`ui/hooks/keyboardGeometry`).
 *
 * Samego zachowania klawiatury tu nie sprawdzimy — jest natywne, w Node nie istnieje.
 * Testowalna jest arytmetyka, i to ona psuła się trzy tury z rzędu: O ILE przewinąć listę
 * i ILE miejsca ustąpić klawiaturze. Wszystkie liczby w układzie OKNA (`measureInWindow`),
 * więc porównujemy krawędzie z jednego układu.
 *
 * Scenariusze z prawdziwej geometrii zgłoszenia: preflight na telefonie 2400×1080 @ 2.75
 * (~873 dp okna), klawiatura ~310 dp → dolna krawędź listy w okolicy 500 dp.
 */

import {
  KEYBOARD_CLEARANCE,
  keyboardBottomOffset,
  scrollDeltaForInput,
  sheetBottomPad,
} from '../ui/hooks/keyboardGeometry';

/** Dolna krawędź widocznej listy = góra klawiatury (lista jest już skrócona). */
const VIEWPORT_BOTTOM = 500;
/** Okno telefonu ze zgłoszenia (2400×1080 @ 2.75). */
const WINDOW = 873;

describe('scrollDeltaForInput', () => {
  it('pole „Oznaczenie klienta" wciśnięte pod klawiaturę — przewijamy o brakującą różnicę', () => {
    // Dół pola na 640, krawędź listy na 500: brakuje 140 plus zapas 24.
    expect(scrollDeltaForInput(640, VIEWPORT_BOTTOM)).toBe(164);
  });

  it('pole z zapasem nad klawiaturą nie wymaga ruchu', () => {
    expect(scrollDeltaForInput(300, VIEWPORT_BOTTOM)).toBe(0);
  });

  it('nigdy nie zwraca wartości ujemnej — przewinięcie „w minus" byłoby szarpnięciem', () => {
    expect(scrollDeltaForInput(0, VIEWPORT_BOTTOM)).toBe(0);
  });

  it('pole dokładnie na krawędzi listy liczy się jako zakryte — o szerokość zapasu', () => {
    // Technicznie widoczne, wizualnie wciśnięte pod klawiaturę.
    expect(scrollDeltaForInput(VIEWPORT_BOTTOM, VIEWPORT_BOTTOM)).toBe(KEYBOARD_CLEARANCE);
  });

  it('liczymy DOŁEM pola — wieloliniowe z górą nad krawędzią wciąż trzeba podnieść', () => {
    // Pole 400–520 przy krawędzi 500: góra widoczna, dół nie. Sama góra uznałaby pole
    // za widoczne i to był błąd, który pilot widział jako „ucięty input".
    expect(scrollDeltaForInput(520, VIEWPORT_BOTTOM)).toBe(44);
  });

  it('zapas zwiększa przewinięcie, a nie zmniejsza', () => {
    const tight = scrollDeltaForInput(640, VIEWPORT_BOTTOM, 0);
    const roomy = scrollDeltaForInput(640, VIEWPORT_BOTTOM, 40);
    expect(tight).toBe(140);
    expect(roomy).toBe(180);
  });

  it('wyższa klawiatura (niższa krawędź listy) wymaga większego przewinięcia', () => {
    expect(scrollDeltaForInput(640, 380)).toBeGreaterThan(
      scrollDeltaForInput(640, VIEWPORT_BOTTOM),
    );
  });

  it('zapas domyślny wystarcza na początek podpowiedzi pod polem', () => {
    // Regresja na stałą: 16 dp okazało się za mało (pilot: „widać do połowy inputa"),
    // 24 dp odsłania też pierwszą linię `TextField hint`.
    expect(KEYBOARD_CLEARANCE).toBeGreaterThanOrEqual(24);
  });
});

describe('keyboardBottomOffset', () => {
  it('Android edge-to-edge: bierze miarę do dołu okna, gdy „height" pomija pasek nawigacji', () => {
    // Klawiatura 310 dp stoi nad paskiem 48 dp, a okno sięga pod pasek — arkusz musi
    // ustąpić 358 dp, inaczej przyciski kończą pod klawiaturą.
    expect(keyboardBottomOffset(310, WINDOW - 358, WINDOW)).toBe(358);
  });

  it('iOS: obie miary zgodne — wynik bez zmian', () => {
    expect(keyboardBottomOffset(336, WINDOW - 336, WINDOW)).toBe(336);
  });

  it('nie schodzi poniżej zmierzonej wysokości klawiatury', () => {
    // `screenY` niżej niż krawędź klawiatury (inny układ współrzędnych) — pomiar
    // z `height` zostaje, bo mniejsza wartość zasłoniłaby przyciski.
    expect(keyboardBottomOffset(310, WINDOW - 120, WINDOW)).toBe(310);
  });

  it('odrzuca wynik nierealny — brak `screenY` nie wypycha arkusza za ekran', () => {
    expect(keyboardBottomOffset(310, 0, WINDOW)).toBe(310);
  });

  it('schowana klawiatura to zero, nie wysokość okna', () => {
    expect(keyboardBottomOffset(0, WINDOW, WINDOW)).toBe(0);
    expect(keyboardBottomOffset(0, 0, WINDOW)).toBe(0);
  });
});

/**
 * Zapas pod rzędem akcji arkusza. Obie pomyłki widziane na urządzeniu w jednym cyklu:
 * najpierw ucięty przycisk (za mało), potem pas martwego powietrza (za dużo, bo pasek
 * nawigacji policzony dwa razy).
 */
describe('sheetBottomPad', () => {
  /** Pasek trzech przycisków na telefonie ze zgłoszenia. */
  const NAV_BAR = 48;
  const DESIGN = 32;
  const GAP = 16;

  it('klawiatura wysunięta: sam odstęp — pasek nawigacji jest już w jej wysokości', () => {
    expect(sheetBottomPad(DESIGN, NAV_BAR, 358, GAP)).toBe(GAP);
  });

  it('klawiatura zwinięta: pasek nawigacji plus odstęp, żeby nie uciął przycisku', () => {
    expect(sheetBottomPad(DESIGN, NAV_BAR, 0, GAP)).toBe(NAV_BAR + GAP);
    // Kluczowe: więcej niż zapas z mockupu, bo ten był mniejszy niż sam pasek.
    expect(sheetBottomPad(DESIGN, NAV_BAR, 0, GAP)).toBeGreaterThan(DESIGN);
  });

  it('nawigacja gestami: zapas z mockupu zostaje podłogą', () => {
    // Inset 24 dp + 16 = 40 > 32, ale przy insecie zerowym arkusz nie może przykleić
    // się do krawędzi — wtedy broni go wartość z mockupu.
    expect(sheetBottomPad(DESIGN, 24, 0, GAP)).toBe(40);
    expect(sheetBottomPad(DESIGN, 0, 0, GAP)).toBe(DESIGN);
  });

  it('każdy arkusz wnosi własny zapas z mockupu — reguła go nie normalizuje', () => {
    expect(sheetBottomPad(26, 0, 0, GAP)).toBe(26);
    expect(sheetBottomPad(30, 0, 0, GAP)).toBe(30);
  });
});
