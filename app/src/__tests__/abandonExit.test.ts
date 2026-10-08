/**
 * Ninerdeck - test kolejności wyjścia z formularza po rezygnacji (issue #84 pkt 7).
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
  PROCEED_PHASE,
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

describe('wyjście po zapisie (`proceed`)', () => {
  /**
   * Formularz rezerwacji (22) wychodził po zapisie wprost `navigation.replace`, a bramka
   * czyta stan z OSTATNIEGO renderu - w kroku 2 podniesiony - więc przechwytywała własne
   * wyjście formularza i cofała go do kroku 1, choć rezerwacja już stała na serwerze
   * (błąd z 3.0.0). Wyjście po zapisie ma od razu opuścić bramkę i wypuścić akcję,
   * bez arkusza - w formularzu rezerwacji i w formularzu zlecenia tak samo.
   */
  it('bramka już nie łapie, akcja jedzie, arkusza nie ma', () => {
    expect(abandonGuards(PROCEED_PHASE)).toBe(false);
    expect(abandonDispatches(PROCEED_PHASE)).toBe(true);
    expect(abandonSheetMounted(PROCEED_PHASE)).toBe(false);
    // Spoczynek, a nie krok w drodze: akcja jedzie z tej fazy raz, zegar niczego nie przesuwa.
    expect(nextAbandonPhase(PROCEED_PHASE)).toBeNull();
  });
});
