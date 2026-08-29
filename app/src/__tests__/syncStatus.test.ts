/**
 * UZ Aero - testy sekcji „Synchronizacja" w Ustawieniach (`screens/logic/syncStatus.ts`).
 *
 * Plik schudł razem z ekranem 11 (2026-08-12): licznik „wysłane / wszystkie", nazwa
 * karty arkusza, równanie paliwa i podsumowanie zrzutów opisywały widok, który był
 * trzecią kopią ekranu 10, i zniknęły wraz z nim. Zostało to, co pilot nadal widzi:
 * odmiana liczebników (etykiety idą wprost do niego) i katalog uwag serwera, po którym
 * dzwoni do administratora.
 */

import { eventsCount, flagLabel, serverNoticeLabel } from '../ui/screens/logic/syncStatus';

describe('eventsCount - polska liczba mnoga', () => {
  it.each([
    [1, '1 zdarzenie'],
    [2, '2 zdarzenia'],
    [4, '4 zdarzenia'],
    [5, '5 zdarzeń'],
    [12, '12 zdarzeń'], // 12–14 to zawsze „zdarzeń", mimo końcówki 2–4
    [14, '14 zdarzeń'],
    [22, '22 zdarzenia'],
    [47, '47 zdarzeń'],
  ])('%i → %s', (n, expected) => {
    expect(eventsCount(n)).toBe(expected);
  });
});

describe('flagLabel', () => {
  // Pilot nie może zobaczyć `aircraft_overlap` ani `fuel_mismatch` - to kody dla
  // programisty. Katalog ma KOMPLET sześciu typów §4.5 i mówi dokładnie tymi samymi
  // słowami co panel (`admin/src/screens/flags/flagTypes.ts`, pole `short`), bo pilot
  // i administrator rozmawiają o tej samej fladze przez telefon.
  it.each([
    ['aircraft_overlap', 'dwa telefony piszą do jednej maszyny'],
    ['pilot_overlap', 'pilot rzekomo na dwóch maszynach naraz'],
    ['mh_gap', 'dziura w łańcuchu MH'],
    ['mh_regression', 'licznik się cofnął'],
    ['fuel_mismatch', 'paliwo poza tolerancją'],
    ['clock_drift', 'zegar telefonu przestawiony'],
  ])('%s → %s', (type, label) => {
    expect(flagLabel(type)).toBe(label);
  });

  it('nie zna już `session_overlap` - etap D4 rozdzielił go na dwie różne patologie', () => {
    // Nazwa historyczna: żaden strumień po 2026-08-07 jej nie niesie, a katalog, który
    // ją zna, uczy nieaktualnego modelu. Surowy kod jest tu WŁAŚCIWĄ odpowiedzią.
    expect(flagLabel('session_overlap')).toBe('session_overlap');
  });

  it('nieznany typ wraca surowy - lepszy kod niż zgadywana etykieta', () => {
    expect(flagLabel('whatever_new')).toBe('whatever_new');
  });
});

describe('serverNoticeLabel - cisza nie może znaczyć dwóch rzeczy', () => {
  // Flagi przychodzą w odpowiedzi na WYSYŁKĘ. Telefon, który jeszcze nigdy nie wysłał,
  // nie wie nic - i musi to powiedzieć wprost, bo „brak uwag" znaczyłoby wtedy
  // „sprawdzone i czysto" (§6 pkt 2).
  it('bez ani jednej udanej wysyłki: nie wiemy nic', () => {
    expect(serverNoticeLabel(0, false)).toBe('jeszcze nie sprawdzone');
    expect(serverNoticeLabel(2, false)).toBe('jeszcze nie sprawdzone');
  });

  it('po wysyłce: brak uwag albo ich liczba', () => {
    expect(serverNoticeLabel(0, true)).toBe('brak uwag');
    expect(serverNoticeLabel(1, true)).toBe('1');
    expect(serverNoticeLabel(3, true)).toBe('3');
  });
});
