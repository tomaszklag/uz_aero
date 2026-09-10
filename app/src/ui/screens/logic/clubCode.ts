/**
 * UZ Aero - KOD KLUBU po stronie telefonu (wielofirmowość §3.8, issue #102).
 *
 * Kod ma kształt `XXX-XXXX` - 7 znaków z alfabetu 32 (litery bez O/I, cyfry bez 0/1),
 * przepisywanych z ekranu administratora albo z kartki. Myślnik i wielkość liter są
 * ZAPISEM, nie treścią: serwer normalizuje `azg7k4m` tak samo jak `AZG-7K4M`.
 *
 * ══ MASKA NIE FILTRUJE ALFABETU I TO JEST DECYZJA ══
 * Wycinanie liter O/I w trakcie pisania byłoby polem, które połyka wciśnięty klawisz
 * bez słowa - pilot nie ma skąd wiedzieć, że akurat tej litery w kodach nie ma.
 * Kod spoza alfabetu jedzie więc na serwer i wraca jedną odpowiedzią „Nie znam takiego
 * kodu" - tą samą, co kod nieznany (nic się nie ujawnia, §5).
 */

/** Ile znaków ma kod bez myślnika - stała nazwana, bo pojawia się w dwóch miejscach. */
export const CLUB_CODE_LENGTH = 7;

/** Wpis pilota → zapis kanoniczny `XXX-XXXX`. Myślnik stawia maska, nie pilot. */
export function maskClubCodeInput(raw: string): string {
  const body = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CLUB_CODE_LENGTH);
  return body.length > 3 ? `${body.slice(0, 3)}-${body.slice(3)}` : body;
}

/** Czy wpis jest kompletny - dopiero wtedy „DOŁĄCZ" ma co wysłać. */
export const clubCodeComplete = (masked: string): boolean =>
  masked.replace(/-/g, '').length === CLUB_CODE_LENGTH;
