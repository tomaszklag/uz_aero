/**
 * UZ Aero — test blokady arkusza czasów (issue #62 pkt 5 i 7).
 *
 * Arkusz jest JEDEN dla biegu silnika i dla lotu, więc i blokada jest jedna — test
 * pilnuje, żeby zdanie było gramatyczne w obu rolach (nazwy pól są w mianowniku,
 * odmiany nie da się wyprowadzić regułą — patrz nagłówek modułu).
 */

import { flightTimesBlocker } from '../ui/components/sheets/flightTimesBlocker';

const DAY = Date.UTC(2026, 7, 16);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

describe('blokada arkusza czasów', () => {
  it('puszcza parę w dobrej kolejności', () => {
    expect(
      flightTimesBlocker(
        [
          { label: 'Uruchomienie', value: at(8, 0) },
          { label: 'Wyłączenie', value: at(11, 30) },
        ],
        'Blok',
      ),
    ).toBeNull();
  });

  it('żąda wpisania godzin, dopóki którejś nie ma (issue #62 pkt 3)', () => {
    // Arkusz nie podstawia już 10:00 i 11:00, więc pusty stan jest normalnym
    // początkiem — blokada ma go nazwać, a nie pozwolić zapisać zgadywanki.
    expect(
      flightTimesBlocker([
        { label: 'Uruchomienie', value: null },
        { label: 'Wyłączenie', value: null },
      ]),
    ).toBe('Wpisz obie godziny.');

    expect(
      flightTimesBlocker([
        { label: 'Uruchomienie', value: at(8, 0) },
        { label: 'Wyłączenie', value: null },
      ]),
    ).toBe('Wpisz obie godziny.');

    // Pole pojedyncze mówi w liczbie pojedynczej.
    expect(flightTimesBlocker([{ label: 'Czas zrzutu', value: null }])).toBe('Wpisz godzinę.');
  });

  it('łapie odwróconą parę i mówi o skutku, nie o odmianie nazw', () => {
    expect(
      flightTimesBlocker(
        [
          { label: 'Uruchomienie', value: at(11, 30) },
          { label: 'Wyłączenie', value: at(8, 0) },
        ],
        'Blok',
      ),
    ).toBe('Sprawdź kolejność godzin — blok wychodzi ujemny.');

    // Ta sama blokada w drugiej roli arkusza — zdanie musi zostać gramatyczne.
    expect(
      flightTimesBlocker(
        [
          { label: 'Start', value: at(9, 40) },
          { label: 'Lądowanie', value: at(9, 10) },
        ],
        'Czas lotu',
      ),
    ).toBe('Sprawdź kolejność godzin — czas lotu wychodzi ujemny.');
  });

  it('para o zerowej długości też nie przechodzi', () => {
    // Lot trwający zero minut nie jest lotem, a bieg silnika o zerowym bloku nie
    // ma czego zapisać — domena i tak odrzuci jedno i drugie.
    expect(
      flightTimesBlocker(
        [
          { label: 'Start', value: at(9, 10) },
          { label: 'Lądowanie', value: at(9, 10) },
        ],
        'Czas lotu',
      ),
    ).toBe('Sprawdź kolejność godzin — czas lotu wychodzi zerowy.');
  });

  it('bez podanego podpisu czasu trwania mówi neutralnie', () => {
    expect(
      flightTimesBlocker([
        { label: 'Start', value: at(9, 40) },
        { label: 'Lądowanie', value: at(9, 10) },
      ]),
    ).toBe('Sprawdź kolejność godzin — czas trwania wychodzi ujemny.');
  });
});
