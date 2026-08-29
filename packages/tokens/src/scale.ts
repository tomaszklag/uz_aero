/**
 * UZ Aero - SKALE NIEZALEŻNE OD MOTYWU.
 *
 * Odstępy i promienie nie zmieniają się między motywami: motyw zmienia kolory, nie
 * geometrię. Trzymanie ich osobno od palet sprawia, że dodanie szóstego motywu nie
 * dotyka wymiarów, a zmiana skali nie wymaga przeglądania pięciu palet.
 */

/** Skala odstępów (px). Wartości: 4,8,12,16,20,24,32,40,48 (docs/_main.md.txt §9). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
} as const;

/** Promienie zaokrągleń. Karty/pola = 12 (md), przyciski/kafle/klawisze = 14 (btn), duże CTA = 16 (lg), modale = 24, pill = 999. */
export const radius = {
  sm: 8,
  md: 12,
  /**
   * Kanon dla przycisków, kafli akcji, klawiszy i pól-kontrolek (num-btn, action-card,
   * step-btn, day-card, time-input…). Mockupy wahają się między 13 a 14 px - steppery
   * i wiersze 05e/05f dają 13 - dryf 13 → 14 znormalizowany celowo, wzorem
   * `colors.overlay`, który zakończył dryf scrimów.
   */
  btn: 14,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;
