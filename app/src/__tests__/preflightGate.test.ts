/**
 * UZ Aero - test BRAMKI kroku liczników (02a): co blokuje ROZPOCZNIJ LOT.
 *
 * Decyzja użytkownika (2026-08-27, issue #60): pomiar oleju jest krokiem WYMAGANYM
 * przy przejęciu - jak odczyty paliwa i MH. Bramka mieszka w czystej logice, nie
 * w JSX - ta sama lekcja co `myDayActions` (issue #42): warunek w JSX przeżył dziurę
 * bez jednego czerwonego testu.
 *
 * Kolejność powodów jest częścią kontraktu: pilot dostaje JEDEN powód naraz,
 * w kolejności kroków przy maszynie (liczniki → bagnet → wiarygodność licznika).
 */

import { preflightBlocker } from '../ui/screens/logic/preflightGate';

const READY = { fuelL: 150, mh: 1234.5, oilL: 10.2, handoverMh: 1234.5 };

describe('bramka ROZPOCZNIJ LOT (02a)', () => {
  it('komplet odczytów przechodzi bez powodu', () => {
    expect(preflightBlocker(READY)).toBeNull();
  });

  it('bez odczytów paliwa i MH - łańcuch nie ma się od czego zacząć', () => {
    expect(preflightBlocker({ ...READY, fuelL: 0, mh: 0 })).toBe(
      'Wprowadź odczyty paliwa i MH z liczników - rozpoczną nowe ogniwo łańcucha',
    );
    // Jedna wartość > 0 wystarcza (zachowanie sprzed issue #60 - przekazanie zwykle
    // podstawia obie, a wpisanie jednej znaczy, że pilot jest przy licznikach).
    expect(preflightBlocker({ ...READY, fuelL: 0, oilL: 10.2 })).toBeNull();
  });

  it('bez pomiaru oleju stoi z powodem - krok wymagany (issue #60)', () => {
    expect(preflightBlocker({ ...READY, oilL: null })).toBe(
      'Zmierz olej i wpisz pomiar z bagnetu - odczyt przy przejęciu jest obowiązkowy',
    );
  });

  it('cofnięty licznik wobec przekazania blokuje z powodem', () => {
    expect(preflightBlocker({ ...READY, mh: 1234.0 })).toBe(
      'Licznik motogodzin nie może być niższy niż przekazany - popraw odczyt',
    );
    // Bez przekazania nie ma do czego porównywać - reguła śpi.
    expect(preflightBlocker({ ...READY, mh: 1234.0, handoverMh: null })).toBeNull();
  });

  it('powody padają w kolejności kroków przy maszynie', () => {
    // Brak wszystkiego naraz → najpierw liczniki, nie olej.
    expect(preflightBlocker({ fuelL: 0, mh: 0, oilL: null, handoverMh: null })).toContain(
      'paliwa i MH',
    );
    // Liczniki są, oleju brak, licznik cofnięty → najpierw olej (kolejność czynności),
    // potem wiarygodność licznika.
    expect(
      preflightBlocker({ fuelL: 150, mh: 1234.0, oilL: null, handoverMh: 1234.5 }),
    ).toContain('olej');
  });
});
