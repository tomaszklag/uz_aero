/**
 * UZ Aero - co wolno zapisać z arkusza wyboru lotniska.
 *
 * Pole arkusza przyjmuje DWIE rzeczy: kod ICAO i nazwę (żeby dało się szukać „zielona").
 * Do rejestru wchodzi wyłącznie pierwsza z nich - bez tej bramki wpis „zielona" wylądowałby
 * w zdarzeniu `preflight_confirm` jako „ZIELONA", czyli trasa, której nie zna ani katalog,
 * ani arkusz klubu, ani panel.
 *
 * Kod SPOZA katalogu przechodzi (przelot do EDDB): katalog obejmuje Polskę, więc jego
 * milczenie nie jest błędem pilota - sprawdzamy KSZTAŁT, a nie przynależność do katalogu.
 *
 * Osobny plik `.ts`, bo `.tsx` eksportuje wyłącznie komponenty (`docs/architektura-kodu.md` §2).
 */

/** Cztery znaki alfanumeryczne - kształt kodu ICAO (EPKK, EDDB, 4-cyfrowe lądowiska). */
const ICAO = /^[A-Z0-9]{4}$/;

/**
 * Wpis pilota → wartość do zapisania albo `null`, gdy zapisać się nie da.
 *
 * Pusty wpis daje `''` (a nie `null`) i to jest celowe: wyczyszczenie pola jest
 * pełnoprawną decyzją, trasa nie jest wymagana.
 */
export function icaoToStore(text: string): string | null {
  const code = text.trim().toUpperCase();
  if (code.length === 0) return '';
  return ICAO.test(code) ? code : null;
}
