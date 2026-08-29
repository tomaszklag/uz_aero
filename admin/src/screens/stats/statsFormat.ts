/**
 * UZ Aero - panel: formaty liczb ekranu statystyk (moduł CZYSTY).
 *
 * Uzupełnienie `@uzaero/format` o zapisy, które w aplikacji pilota nie występują:
 * duże sumy litrów z separatorem tysięcy („21 436 L"), procenty i ułamki z jednym
 * miejscem po kropce/przecinku. Mieszka przy ekranie, nie w pakiecie - pakiet
 * awansuje funkcje dopiero przy drugim konsumencie (`architektura-kodu.md` §6).
 *
 * Reguła całego panelu: `null` to ZAWSZE kreska, nigdy zero - zaokrąglenie nie ma
 * prawa zamienić niewiedzy w liczbę.
 */

/** Kreska niewiedzy - jedna dla całego ekranu. */
export const DASH = '-';

/** Liczba całkowita z ODSTĘPEM tysięcy: `21436 → „21 436"` (zapis mockupu). */
export function thousands(value: number | null): string {
  if (value == null) return DASH;
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = String(Math.abs(rounded));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ' ';
  }
  return sign + out;
}

/** Jedno miejsce po KROPCE - kolumny tabel mockupu („170.8", „5.4"). */
export function dot1(value: number | null): string {
  return value == null ? DASH : value.toFixed(1);
}

/** Dwa miejsca po kropce - blok w godzinach i rozjazd Δ MH („186.65 h", „0.35 h"). */
export function dot2(value: number | null): string {
  return value == null ? DASH : value.toFixed(2);
}

/** Jedno miejsce po PRZECINKU - proza przypisów mockupu („71,7 %", „8,5"). */
export function comma1(value: number | null): string {
  return value == null ? DASH : value.toFixed(1).replace('.', ',');
}

/** Procent CAŁKOWITY - „70 %" (wykorzystanie floty z mockupu). */
export function pct0(value: number | null): string {
  return value == null ? DASH : `${Math.round(value)} %`;
}

/** Procent z jednym miejscem - „60.3 %" (udział w nalocie). */
export function pct1(value: number | null): string {
  return value == null ? DASH : `${value.toFixed(1)} %`;
}

/** Litry z tysiącami - „21 436 L"; `null` = kreska, nigdy „0 L". */
export function litresThousands(value: number | null): string {
  return value == null ? DASH : `${thousands(value)} L`;
}

/** Stopy z tysiącami - „12 840 ft". */
export function feetThousands(value: number | null): string {
  return value == null ? DASH : `${thousands(value)} ft`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Dzień `YYYY-MM-DD` → „01 JUL" - podpisy osi wykresu (mockup bez roku). */
export function dayShort(day: string): string {
  const month = Number(day.slice(5, 7));
  return `${day.slice(8, 10)} ${MONTHS[month - 1] ?? '?'}`;
}

/** Dzień `YYYY-MM-DD` → „01 JUL 2026" - chip zakresu. */
export function dayShortYear(day: string): string {
  return `${dayShort(day)} ${day.slice(0, 4)}`;
}
