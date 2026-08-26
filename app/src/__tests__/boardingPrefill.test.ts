/**
 * UZ Aero — prefill arkuszy skokowych (issue #28).
 *
 * Zgłoszenie z urządzenia: pilot zapisał załadunek przed uruchomieniem silnika, po
 * uruchomieniu otworzył „Załadunek" jeszcze raz i zobaczył same zera. Arkusz 05i
 * zerował liczniki przy każdym otwarciu, choć załadunek wciąż CZEKAŁ na zrzut —
 * ten sam stan, który arkusz zrzutu 05e czyta jako prefill od issue #21.
 *
 * Test pierwszego przypadku upada na starej wersji ekranu: `BoardingSheet` nie dostawał
 * składu w ogóle, więc nie było czym go otworzyć.
 */

import { boardingInitialJumpers, boardingPrefill } from '../ui/screens/logic/boardingPrefill';

describe('boardingPrefill', () => {
  it('załadunek czekający na zrzut otwiera liczniki swoim składem', () => {
    expect(
      boardingPrefill({ jumpers: { tandem: 2, aff: 1, solo: 1 }, at: 1_700_000_000_000 }),
    ).toEqual({ jumpers: { tandem: 2, aff: 1, solo: 1 }, at: 1_700_000_000_000 });
  });

  it('bez załadunku (albo po zrzucie, który go skonsumował) liczniki startują od zera', () => {
    // Projekcja czyści `boarding` przy `drop` — ci skoczkowie już wyszli.
    expect(boardingPrefill(null)).toEqual({ jumpers: null, at: null });
  });

  it('załadunek BEZ liczb nie jest prefillem — i nie ma czego podpisać', () => {
    // `jumpers: null` to „skład niepodany", nie „zero skoczków": zerowe liczniki
    // z podpisem „skład z załadunku" ogłaszałyby deklarację pustego samolotu.
    expect(boardingPrefill({ jumpers: null, at: 1_700_000_000_000 })).toEqual({
      jumpers: null,
      at: null,
    });
  });
});

describe('boardingInitialJumpers (2026-08-17)', () => {
  it('czekający załadunek wygrywa z defaultem sesji', () => {
    expect(
      boardingInitialJumpers(
        { jumpers: { tandem: 2, aff: 1, solo: 1 }, at: 1_700_000_000_000 },
        { tandem: 4, aff: 0, solo: 0 },
      ),
    ).toEqual({ tandem: 2, aff: 1, solo: 1 });
  });

  it('bez czekającego załadunku (pierwszy w sesji albo po zrzucie) podstawia default', () => {
    expect(boardingInitialJumpers(null, { tandem: 4, aff: 0, solo: 0 })).toEqual({
      tandem: 4,
      aff: 0,
      solo: 0,
    });
  });

  it('bez czekającego załadunku i bez defaultu liczniki startują od zera', () => {
    expect(boardingInitialJumpers(null, null)).toBeNull();
  });
});
