/**
 * UZ Aero — testy drabinki fokusu pola w arkuszu (issue #58 pkt 7/8, druga tura).
 *
 * Kontrakt, który zawiódł już DWA RAZY (`autoFocus`, potem pojedyncze `focus()`
 * w `onShow`), więc jest przybity testem: pierwsza próba to czyste `focus()`,
 * każde ponowienie musi iść przez `blur()` (fokus na skupionym już polu jest
 * no-opem i nie pokaże klawiatury), a widoczna klawiatura zatrzymuje drabinkę.
 */

import { RETRY_DELAYS_MS, focusStep, shouldStartLadder } from '../ui/hooks/keyboardFocus';

describe('focusStep — drabinka fokusu w arkuszu', () => {
  it('pierwsza próba jest czystym focus() — pole nie było jeszcze skupione', () => {
    // Stan klawiatury nie zmienia pierwszego kroku: przy otwarciu arkusza pole
    // i tak nie jest źródłem widocznej klawiatury.
    expect(focusStep(0, false)).toBe('focus');
    expect(focusStep(0, true)).toBe('focus');
  });

  it('ponowienie bez klawiatury idzie przez blur — drugi focus bez niego jest no-opem', () => {
    expect(focusStep(1, false)).toBe('refocus');
    expect(focusStep(2, false)).toBe('refocus');
  });

  it('widoczna klawiatura zatrzymuje drabinkę — późny blur+focus mrugałby kursorem', () => {
    expect(focusStep(1, true)).toBe('stop');
    expect(focusStep(RETRY_DELAYS_MS.length, true)).toBe('stop');
  });

  /**
   * TRZECIA tura zgłoszenia: start wyłącznie z `onShow` gubił pierwszą próbę, bo
   * `onShow` potrafi wyprzedzić commit dzieci modala — ref był pusty i klawiaturę
   * wyciągało dopiero ponowienie po 150 ms („najpierw popup, potem klawiatura").
   * Kolejność zdarzeń bywa OBIE strony, więc bramka pyta o koniunkcję.
   */
  it('drabinka rusza dopiero, gdy okno pokazane I pole zamontowane — w obu porządkach', () => {
    // Samo zdarzenie (którekolwiek) nie wystarcza…
    expect(shouldStartLadder(true, false)).toBe(false);
    expect(shouldStartLadder(false, true)).toBe(false);
    expect(shouldStartLadder(false, false)).toBe(false);
    // …a komplet startuje niezależnie od tego, które przyszło ostatnie.
    expect(shouldStartLadder(true, true)).toBe(true);
  });

  it('odstępy prób obejmują animację wjazdu modala (ostatnia próba po niej)', () => {
    // Wjazd arkusza (slide) trwa ~300 ms; ostatnie ponowienie musi wypaść za nim,
    // inaczej cała drabinka kończy się przed chwilą, w której fokus IME w ogóle
    // może dostać okno.
    expect(Math.max(...RETRY_DELAYS_MS)).toBeGreaterThanOrEqual(400);
    // Rosnąco — każda próba daje oknu więcej czasu niż poprzednia.
    expect([...RETRY_DELAYS_MS].sort((a, b) => a - b)).toEqual(RETRY_DELAYS_MS);
  });
});
