/**
 * UZ Aero (serwer) - KOD KLUBU: jedyna droga dołączenia do klubu (wielofirmowość,
 * issue #100; `docs/wielofirmowosc.md` §3.8, decyzja właściciela 2026-09-09).
 *
 * Kod jest krótki i czytelny przez telefon: 7 symboli z alfabetu 32 znaków - litery
 * bez `O` i `I`, cyfry bez `0` i `1`, bo te pary myli się w druku i w mowie. Pilot
 * wpisuje go z klawiatury na ekranie 00E, więc długość jest granicą WYGODY, nie
 * bezpieczeństwa: 32⁷ ≈ 3,4·10¹⁰ kombinacji przy ograniczeniu tempa `POST /auth/join`
 * wystarcza z zapasem, a kod i tak daje wyłącznie członkostwo `pending`.
 *
 * ══ MYŚLNIK I WIELKOŚĆ LITER SĄ ZAPISEM, NIE TREŚCIĄ ══
 * W bazie (`organizations.join_code`) stoi postać ZNORMALIZOWANA: siedem wersalików
 * bez myślnika (`AZG7K4M`). Tak porównuje serwer, więc `azg-7k4m`, `AZG 7K4M`
 * i `azg7k4m` trafiają w ten sam klub. Zapis kanoniczny `XXX-XXXX` (`AZG-7K4M`) jest
 * wyłącznie dla oka - panel pokazuje go administratorowi, 00E pilotowi.
 */

/** 24 litery (bez O, I) + 8 cyfr (2–9). Kolejność bez znaczenia - to zbiór. */
export const CLUB_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const CLUB_CODE_LENGTH = 7;

/**
 * Wpis pilota → postać znormalizowana albo `null`, gdy to nie może być kod klubu
 * (zła długość, znak spoza alfabetu). Wołający odpowiada wtedy tak samo, jak na kod
 * nieznany - kształt wpisu nie ma powodu się ujawniać.
 */
export function normalizeClubCode(input: string): string | null {
  const raw = input.replace(/[\s-]/g, '').toUpperCase();
  if (raw.length !== CLUB_CODE_LENGTH) return null;
  for (const char of raw) {
    if (!CLUB_CODE_ALPHABET.includes(char)) return null;
  }
  return raw;
}

/** Postać znormalizowana → zapis kanoniczny `XXX-XXXX`. */
export function formatClubCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
