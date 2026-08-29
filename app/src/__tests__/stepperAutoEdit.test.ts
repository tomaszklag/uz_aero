/**
 * UZ Aero - kiedy kontrolka otwiera się od razu do wpisu (uwaga z urządzenia, 2026-08-29).
 *
 * „Jak mam «dodaj lot», gdzie mam już wpisane default wartości, to nie otwieraj tutaj
 * klawiatury - tutaj raczej będę korzystał z przycisków ±1 min. Tak samo jak otwieram
 * popup, aby wyedytować godzinę."
 */

import { stepperOpensForTyping } from '../ui/components/input/stepperAutoEdit';

describe('stepperOpensForTyping', () => {
  it('PUSTA wartość otwiera klawiaturę - ± nie ma od czego liczyć kroku', () => {
    // Pierwsze wpisanie biegu silnika: kontrolka stoi na `--:--`, przyciski ± są
    // wygaszone, więc klawiatura jest jedyną drogą i czekanie na tapnięcie to koszt.
    expect(stepperOpensForTyping(true, true, null)).toBe(true);
  });

  it('WPISANA wartość NIE otwiera klawiatury - od tego są ±', () => {
    // „DODAJ LOT" dziedziczy granice biegu silnika, a korekta otwiera się na
    // istniejącym czasie. W obu razach pilot poprawia o minutę przyciskiem, a
    // klawiatura zasłania drugą kontrolkę pary i wiersz „Blok" pod nią.
    expect(stepperOpensForTyping(true, true, 0)).toBe(false);
    expect(stepperOpensForTyping(true, true, Date.UTC(2026, 7, 16, 9, 42))).toBe(false);
  });

  it('bez `autoEdit` kontrolka nie otwiera się nigdy', () => {
    expect(stepperOpensForTyping(false, true, null)).toBe(false);
  });

  it('kontrolka bez wpisu nie ma czego otworzyć', () => {
    // `edit == null` - sam odczyt z przyciskami, np. licznik bez klawiatury.
    expect(stepperOpensForTyping(true, false, null)).toBe(false);
  });
});
