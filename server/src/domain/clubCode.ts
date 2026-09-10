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

/**
 * Losowy kod z bajtów dostarczonych przez wołającego (issue #100, D2 - generowanie
 * i rotacja kodu w panelu klubu).
 *
 * ══ BAJTY IDĄ Z ZEWNĄTRZ, BO LOSOWOŚĆ NIE JEST DOMENĄ ══
 * Ta funkcja jest czysta i dlatego daje się przetestować co do znaku: produkcja podaje
 * `randomBytes` z `node:crypto`, test - tablicę ustaloną ręką. `Math.random` nie wchodzi
 * tu nawet jako domyślna wartość, bo kod wisi w hangarze przez cały sezon i przewidywalny
 * generator byłby jedyną rzeczą, która daje z niego coś więcej niż zgłoszenie.
 *
 * ══ `% 32` NIE MA OBCIĄŻENIA I TO JEST POWÓD DŁUGOŚCI ALFABETU ══
 * 256 / 32 = 8 dokładnie, więc reszta z dzielenia bajtu jednostajnego jest jednostajna.
 * Alfabet o innej liczności (np. 33 znaki) wymagałby odrzucania części bajtów - pętli,
 * której liczba obrotów zależy od wylosowanych wartości.
 */
export function clubCodeFrom(bytes: Uint8Array): string {
  if (bytes.length < CLUB_CODE_LENGTH) {
    throw new Error(`kod klubu potrzebuje ${CLUB_CODE_LENGTH} bajtów, dostał ${bytes.length}`);
  }
  let code = '';
  for (let i = 0; i < CLUB_CODE_LENGTH; i += 1) {
    code += CLUB_CODE_ALPHABET[bytes[i]! % CLUB_CODE_ALPHABET.length];
  }
  return code;
}
