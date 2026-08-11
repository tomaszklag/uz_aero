/**
 * UZ Aero — testy SZKICU PREFLIGHTU (`ui/store/preflightDraft.ts`).
 *
 * Reguła, którą szkic egzekwuje sam — bo da się ją zepsuć z dowolnego ekranu przejęcia,
 * a nie ma szansy przetrwać, jeśli pilnuje jej pamięć programisty: kształt trasy zależny
 * od rodzaju operacji (issue #13).
 *
 * GODZINY MELDUNKU W SZKICU JUŻ NIE MA (§3.6a, 2026-08-07) i razem z nią zniknęły testy
 * jej starzenia się. Nie jest to uproszczenie testów, tylko konsekwencja modelu: służba
 * jest klamrą wokół wzlotów, więc godzina bierze się z pierwszego wzlotu doby, a pilot
 * poprawia ją po fakcie na ekranie 01 — nie ma już wartości, która „udaje teraz"
 * i starzeje się między wejściami na ekran (issue #12).
 */

import { usePreflightDraft } from '../ui/store/preflightDraft';

/**
 * Kształt trasy (issue #13). Formularz pyta o jedno lotnisko przy skokach, ale rekord
 * niesie obie wartości równe — inaczej każdy czytelnik dnia (projekcja, karta arkusza,
 * panel) musiałby znać wyjątek „przy skokach patrz tylko na start".
 */
describe('szkic preflightu — trasa wg rodzaju operacji', () => {
  beforeEach(() => {
    usePreflightDraft.getState().reset();
  });

  it('skoki: wpis lotniska wypełnia OBA kody', () => {
    const draft = usePreflightDraft.getState();
    draft.set('operation', 'skoki');
    draft.set('departureIcao', 'EPKK');

    expect(usePreflightDraft.getState().arrivalIcao).toBe('EPKK');
  });

  it('przelot: kody są niezależne — dzień może skończyć się gdzie indziej', () => {
    const draft = usePreflightDraft.getState();
    draft.set('operation', 'ferry');
    draft.set('departureIcao', 'EPKK');
    draft.set('arrivalIcao', 'EPWA');

    expect(usePreflightDraft.getState()).toMatchObject({
      departureIcao: 'EPKK',
      arrivalIcao: 'EPWA',
    });
  });

  it('przełączenie przelotu na skoki zwija trasę do lotniska startu', () => {
    const draft = usePreflightDraft.getState();
    draft.set('operation', 'ferry');
    draft.set('departureIcao', 'EPKK');
    draft.set('arrivalIcao', 'EPWA');
    draft.set('operation', 'skoki');

    expect(usePreflightDraft.getState().arrivalIcao).toBe('EPKK');
  });

  it('podpowiedź z ostatniego dnia też przechodzi przez kształt trasy', () => {
    // Pamięć trzyma trasę per samolot: wczoraj przelot EPKK → EPWA, dziś skoki.
    usePreflightDraft.getState().suggestTask(
      { operation: 'skoki', client: null },
      { departureIcao: 'EPKK', arrivalIcao: 'EPWA' },
    );

    expect(usePreflightDraft.getState().arrivalIcao).toBe('EPKK');
  });
});
