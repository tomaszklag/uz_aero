/**
 * UZ Aero - test blokady arkusza czasów (issue #62 pkt 5 i 7).
 *
 * Arkusz jest JEDEN dla biegu silnika i dla lotu, więc i blokada jest jedna - test
 * pilnuje, żeby zdanie było gramatyczne w obu rolach (nazwy pól są w mianowniku,
 * odmiany nie da się wyprowadzić regułą - patrz nagłówek modułu).
 */

import { flightTimesBlocker } from '../ui/components/sheets/flightTimesBlocker';
import { timeUtc } from '../ui/format';

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
    // początkiem - blokada ma go nazwać, a nie pozwolić zapisać zgadywanki.
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
    ).toBe('Sprawdź kolejność godzin - blok wychodzi ujemny.');

    // Ta sama blokada w drugiej roli arkusza - zdanie musi zostać gramatyczne.
    expect(
      flightTimesBlocker(
        [
          { label: 'Start', value: at(9, 40) },
          { label: 'Lądowanie', value: at(9, 10) },
        ],
        'Czas lotu',
      ),
    ).toBe('Sprawdź kolejność godzin - czas lotu wychodzi ujemny.');
  });

  it('para o zerowej długości też nie przechodzi', () => {
    // Lot trwający zero minut nie jest lotem, a bieg silnika o zerowym bloku nie
    // ma czego zapisać - domena i tak odrzuci jedno i drugie.
    expect(
      flightTimesBlocker(
        [
          { label: 'Start', value: at(9, 10) },
          { label: 'Lądowanie', value: at(9, 10) },
        ],
        'Czas lotu',
      ),
    ).toBe('Sprawdź kolejność godzin - czas lotu wychodzi zerowy.');
  });

  it('bez podanego podpisu czasu trwania mówi neutralnie', () => {
    expect(
      flightTimesBlocker([
        { label: 'Start', value: at(9, 40) },
        { label: 'Lądowanie', value: at(9, 10) },
      ]),
    ).toBe('Sprawdź kolejność godzin - czas trwania wychodzi ujemny.');
  });
});

describe('lot musi mieścić się w biegu silnika (issue #62, trzecia tura)', () => {
  // Bieg 09:42 → 11:18. Arkusz przyjmował start po wyłączeniu silnika bez słowa,
  // a odmowa padała dopiero przy DALEJ - czyli po zamknięciu arkusza.
  const engineRun = {
    from: at(9, 42),
    to: at(11, 18),
    label: 'biegu silnika',
    format: (t: number) => timeUtc(t),
  };

  const flight = (h1: number, m1: number, h2: number, m2: number) => [
    { label: 'Start', value: at(h1, m1) },
    { label: 'Lądowanie', value: at(h2, m2) },
  ];

  it('puszcza lot w środku biegu i lot dokładnie na jego granicach', () => {
    expect(flightTimesBlocker(flight(9, 48, 10, 14), 'Czas lotu', engineRun)).toBeNull();
    // Granice DOMKNIĘTE: lot od uruchomienia do wyłączenia jest poprawny - tak samo
    // liczy je bramka kroku i tak podstawia je „DODAJ LOT".
    expect(flightTimesBlocker(flight(9, 42, 11, 18), 'Czas lotu', engineRun)).toBeNull();
  });

  it('łapie start PO wyłączeniu silnika', () => {
    expect(flightTimesBlocker(flight(11, 30, 11, 50), 'Czas lotu', engineRun)).toBe(
      'Godziny muszą mieścić się w biegu silnika (09:42 → 11:18).',
    );
  });

  it('łapie lądowanie po wyłączeniu i start przed uruchomieniem', () => {
    expect(flightTimesBlocker(flight(11, 0, 11, 40), 'Czas lotu', engineRun)).not.toBeNull();
    expect(flightTimesBlocker(flight(9, 10, 10, 0), 'Czas lotu', engineRun)).not.toBeNull();
  });

  it('sprawdza TAKŻE pole tylko do odczytu - drugi koniec bywa już poza oknem', () => {
    // Pilot skrócił bieg silnika po wpisaniu lotu i poprawia teraz sam start:
    // lądowanie 11:40 zostało poza oknem i arkusz ma o tym powiedzieć.
    expect(flightTimesBlocker(flight(10, 0, 11, 40), 'Czas lotu', engineRun)).not.toBeNull();
  });

  it('kolejność godzin ma PIERWSZEŃSTWO przed granicami', () => {
    // Obie wady naraz: najpierw mówimy o tej, którą widać w kontrolce nad przyciskiem.
    expect(flightTimesBlocker(flight(11, 50, 11, 30), 'Czas lotu', engineRun)).toBe(
      'Sprawdź kolejność godzin - czas lotu wychodzi ujemny.',
    );
  });

  it('bez podanego okna niczego nie sprawdza - arkusz biegu silnika nie ma nadrzędnego', () => {
    expect(flightTimesBlocker(flight(11, 30, 11, 50), 'Czas lotu')).toBeNull();
  });
});

describe('pole KONTEKSTU nie jest polem do wypełnienia (issue #62, szósta tura)', () => {
  /**
   * Zgłoszenie z urządzenia: „jak otwieram popup, gdzie mam wpisać godzinę
   * uruchomienia, to nawet jak coś wpiszę, to na przycisku ZAPISZ mam «wpisz obie
   * godziny» - to uniemożliwia wpisanie godziny uruchomienia".
   *
   * Przyczyna: blokada żądała wartości od WSZYSTKICH pól, także od tego, którego
   * arkusz nie pokazuje jako kontrolki. Przy pierwszym wpisywaniu biegu silnika drugi
   * koniec z definicji jest jeszcze pusty, więc komunikat nie gasł nigdy.
   */
  it('pusty kontekst NIE blokuje zapisu wpisanej godziny', () => {
    expect(
      flightTimesBlocker(
        [
          { label: 'Uruchomienie', value: at(9, 42) },
          { label: 'Wyłączenie', value: null, readOnly: true },
        ],
        'Blok',
      ),
    ).toBeNull();
  });

  it('brak wartości w polu EDYTOWALNYM nadal blokuje, w liczbie pojedynczej', () => {
    expect(
      flightTimesBlocker(
        [
          { label: 'Uruchomienie', value: null },
          { label: 'Wyłączenie', value: at(11, 18), readOnly: true },
        ],
        'Blok',
      ),
    ).toBe('Wpisz godzinę.');
  });

  it('kontekst Z WARTOŚCIĄ nadal wchodzi do porównania kolejności', () => {
    // Po to właśnie drugi koniec zostaje w arkuszu jako wiersz odniesienia: gdyby
    // wypadł z reguł, dałoby się ustawić uruchomienie po wyłączeniu.
    expect(
      flightTimesBlocker(
        [
          { label: 'Uruchomienie', value: at(12, 0) },
          { label: 'Wyłączenie', value: at(11, 18), readOnly: true },
        ],
        'Blok',
      ),
    ).toBe('Sprawdź kolejność godzin - blok wychodzi ujemny.');
  });

  it('kontekst Z WARTOŚCIĄ nadal wchodzi do granic biegu', () => {
    const engineRun = {
      from: at(9, 42),
      to: at(11, 18),
      label: 'biegu silnika',
      format: (t: number) => timeUtc(t),
    };
    expect(
      flightTimesBlocker(
        [
          { label: 'Start', value: at(10, 0) },
          { label: 'Lądowanie', value: at(11, 40), readOnly: true },
        ],
        'Czas lotu',
        engineRun,
      ),
    ).not.toBeNull();
  });
});
