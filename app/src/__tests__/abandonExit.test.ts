/**
 * UZ Aero - test kolejności wyjścia z formularza po rezygnacji (issue #84 pkt 7).
 *
 * Wywrotki na Androidzie („IllegalStateException" po potwierdzeniu rezygnacji z wpisu
 * ręcznego) nie widać w żadnym teście jednostkowym - widać ją dopiero na urządzeniu.
 * Testowalny jest za to NIEZMIENNIK, którego złamanie ją powoduje: okno arkusza
 * i zdjęcie ekranu ze stosu nie mogą dziać się w tej samej fazie.
 */

import {
  abandonDispatches,
  abandonGuards,
  abandonSheetMounted,
  nextAbandonPhase,
  type AbandonPhase,
} from '../ui/hooks/abandonExit';

const PHASES: AbandonPhase[] = ['form', 'asking', 'closing', 'leaving'];

describe('kolejność wyjścia po rezygnacji', () => {
  /**
   * TO JEST TA USTERKA. Do issue #84 potwierdzenie chowało arkusz i w tym samym kroku
   * wypuszczało nawigację - a rama arkusza trzyma okno modala jeszcze przez czas
   * animacji wyjazdu, więc Android dostawał do zdjęcia okno bez powierzchni.
   */
  it('w żadnej fazie arkusz nie jest w drzewie razem z wypuszczoną nawigacją', () => {
    for (const phase of PHASES) {
      expect(abandonSheetMounted(phase) && abandonDispatches(phase)).toBe(false);
    }
  });

  it('potwierdzenie zdejmuje arkusz z drzewa, ale jeszcze nie zdejmuje ekranu', () => {
    expect(abandonSheetMounted('closing')).toBe(false);
    expect(abandonDispatches('closing')).toBe(false);
  });

  it('między odmontowaniem arkusza a wyjściem jest osobna faza', () => {
    expect(nextAbandonPhase('closing')).toBe('leaving');
    expect(abandonDispatches('leaving')).toBe(true);
  });

  it('fazy spoczynku nie przesuwają się same - czekają na decyzję pilota', () => {
    expect(nextAbandonPhase('form')).toBeNull();
    expect(nextAbandonPhase('asking')).toBeNull();
    expect(nextAbandonPhase('leaving')).toBeNull();
  });

  /**
   * Bramka MUSI opaść razem z potwierdzeniem: gdyby pytała dalej, zatrzymałaby własną
   * akcję wyjścia i pilot zostałby w formularzu, z którego właśnie zrezygnował.
   */
  it('bramka „wstecz" pyta tylko dopóki pilot nie potwierdził', () => {
    expect(abandonGuards('form')).toBe(true);
    expect(abandonGuards('asking')).toBe(true);
    expect(abandonGuards('closing')).toBe(false);
    expect(abandonGuards('leaving')).toBe(false);
  });

  it('arkusz stoi wyłącznie w fazie pytania', () => {
    expect(PHASES.filter(abandonSheetMounted)).toEqual(['asking']);
  });
});
