/**
 * UZ Aero - czas i podpisy gestu przytrzymania (issue #67).
 *
 * Akcje kokpitu, które ZAPISUJĄ zdarzenie (START ENGINE, STOP, zapis ręczny paska
 * akcji), wymagają przytrzymania zamiast tapnięcia - „na klik mogą zdarzyć się
 * pomyłki", a w wibracjach i rękawicach przypadkowe dotknięcie jest realne.
 * Czas jest JEDEN dla wszystkich takich akcji: pilot uczy się jednego gestu,
 * nie tabeli czasów per przycisk. Do issue #67 START ENGINE wymagał 2 s,
 * a STOP i zapis ręczny działały na klik - mimo że mockupy deklarowały
 * przytrzymanie także na STOP.
 *
 * Podpisy są funkcjami, nie literałami w ekranach, bo odmiana zależy od liczby:
 * stary `accessibilityHint` składał „Przytrzymaj ${s} sekundy" i przy 1 s mówił
 * „Przytrzymaj 1 sekundy". Moduł jest czysty (bez importów z RN), więc odmianę
 * pilnuje test jednostkowy.
 */

/** Czas przytrzymania akcji zapisujących zdarzenie (ms) - issue #67: 1 s. */
export const HOLD_MS = 1000;

/** Biernik po „przytrzymaj": 1 sekundę · 2-4 sekundy · 5+ sekund (i 12-14 → sekund). */
function secondsAccusative(seconds: number): string {
  if (seconds === 1) return 'sekundę';
  const tens = seconds % 100;
  const units = seconds % 10;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return 'sekundy';
  return 'sekund';
}

/**
 * Pełne zdanie do podpisu hero i `accessibilityHint`:
 * „Przytrzymaj 1 sekundę aby potwierdzić".
 */
export function holdConfirmHint(holdMs: number): string {
  const seconds = Math.max(1, Math.round(holdMs / 1000));
  return `Przytrzymaj ${seconds} ${secondsAccusative(seconds)} aby potwierdzić`;
}

/**
 * Mikropodpis przycisków paska akcji: „przytrzymaj 1 s" - w slocie, w którym
 * zablokowany STOP trzyma powód („po LDG"). Powód blokady WYGRYWA z podpisem
 * gestu: dopóki przycisk nie działa, odpowiedzią na tapnięcie jest powód.
 */
export function holdShortLabel(holdMs: number): string {
  const seconds = Math.max(1, Math.round(holdMs / 1000));
  return `przytrzymaj ${seconds} s`;
}
