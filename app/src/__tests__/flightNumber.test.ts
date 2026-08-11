/**
 * UZ Aero — numer lotu w kokpicie (issue #21 pkt 1).
 *
 * Zgłoszenie z urządzenia: arkusz zrzutu w PIERWSZYM locie tytułował się „ZRZUT · LOT 2".
 * Przyczyna: projekcja dopisuje lot do `flights` już przy starcie (lot otwarty), a ekran
 * liczył `flights.length + (inFlight ? 1 : 0)` — wzór zakładający listę samych lotów
 * ZAMKNIĘTYCH. Test pierwszego przypadku upada na starym wzorze (1 + 1 = 2).
 */

import { currentFlightNumber } from '../ui/screens/logic/flightNumber';

describe('currentFlightNumber', () => {
  it('pierwszy lot w powietrzu to LOT 1 — lista lotów zawiera już lot otwarty', () => {
    // Po pierwszym takeoff: flights = [otwarty lot #1], inFlight = true.
    expect(currentFlightNumber(1, true)).toBe(1);
  });

  it('trzeci lot serii w powietrzu to LOT 3', () => {
    expect(currentFlightNumber(3, true)).toBe(3);
  });

  it('na ziemi zdarzenia należą do lotu NADCHODZĄCEGO', () => {
    // Kołowanie przed pierwszym startem: lot 1 dopiero się otworzy (stary wzór: „Lot #0").
    expect(currentFlightNumber(0, false)).toBe(1);
    // Kołowanie po lądowaniu pierwszego lotu: załadunek i taxi to już historia lotu 2.
    expect(currentFlightNumber(1, false)).toBe(2);
  });

  it('pas bezpieczeństwa: inFlight bez otwartego lotu nie produkuje „LOT 0"', () => {
    // Nie powinno się zdarzyć (projekcja otwiera lot razem z flagą) — ale kokpit
    // nie ma prawa pokazać zera nawet na zepsutym strumieniu.
    expect(currentFlightNumber(0, true)).toBe(1);
  });
});
