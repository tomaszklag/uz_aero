/**
 * UZ Aero - testy sekcji „Synchronizacja" w Ustawieniach (`screens/logic/syncStatus.ts`).
 *
 * Plik schudł dwa razy. Raz razem z ekranem 11 (2026-08-12): licznik „wysłane /
 * wszystkie", nazwa karty arkusza, równanie paliwa i podsumowanie zrzutów opisywały
 * widok, który był trzecią kopią ekranu 10.
 *
 * Drugi raz przy issue #82: katalog uwag serwera (`flagLabel`) i stany wiersza „Uwagi
 * serwera" (`serverNoticeLabel`) odeszły razem z sekcją, której pilot nie ma jak
 * naprawić - rozstrzyga te flagi panel. Zostało to, co pilot nadal czyta: odmiana
 * liczebników i JEDNA godzina ostatniej rozmowy z serwerem.
 */

import { eventsCount, lastContactAt, lastContactLabel } from '../ui/screens/logic/syncStatus';

const DAY = 24 * 3_600_000;
const NOON = Date.UTC(2026, 8, 4, 12, 0);

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

describe('lastContactAt - jedna godzina zamiast dwóch', () => {
  /**
   * TO JEST TA USTERKA (issue #82). Stempel wysyłki aktualizuje się WYŁĄCZNIE, gdy
   * było co wysłać, więc pilot bez zaległości widział godzinę sprzed kilku godzin
   * obok świeżego stempla danych referencyjnych. Obie liczby poprawne, obraz fałszywy.
   */
  it('bierze PÓŹNIEJSZY z dwóch kierunków - pytanie brzmi „od kiedy nie mam kontaktu"', () => {
    const rano = NOON - 4 * 3_600_000;

    expect(lastContactAt(rano, NOON)).toBe(NOON);
    expect(lastContactAt(NOON, rano)).toBe(NOON);
  });

  it('jeden kierunek wystarcza, gdy drugiego jeszcze nie było', () => {
    expect(lastContactAt(NOON, null)).toBe(NOON);
    expect(lastContactAt(null, NOON)).toBe(NOON);
  });

  it('bez ani jednej udanej rozmowy nie zmyślamy godziny', () => {
    expect(lastContactAt(null, null)).toBeNull();
  });
});

describe('lastContactLabel', () => {
  it('w tej samej dobie UTC wystarczy godzina', () => {
    expect(lastContactLabel(Date.UTC(2026, 8, 4, 8, 12), NOON)).toBe('08:12 UTC');
  });

  /**
   * Sama godzina przy stemplu sprzed dwóch dni mówiłaby nieprawdę o tym, co pilot
   * naprawdę sprawdza - a właśnie zamrożony stempel bez daty kazał zapytać, czy
   * aplikacja w ogóle się synchronizuje.
   */
  it('spoza doby niesie datę', () => {
    const label = lastContactLabel(NOON - 2 * DAY, NOON);

    expect(label).toContain('UTC');
    expect(label).not.toBe('12:00 UTC');
  });

  it('brak kontaktu nazywa się wprost', () => {
    expect(lastContactLabel(null, NOON)).toBe('jeszcze żadnej');
  });
});
