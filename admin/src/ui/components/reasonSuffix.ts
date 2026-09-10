/**
 * Ninerdeck - panel 2.0: POWÓD BLOKADY dopisany do etykiety przycisku (moduł CZYSTY).
 *
 * Reguła panelu brzmi: przycisk, którego nie da się kliknąć, MÓWI dlaczego - w napisie,
 * nie w dymku. Powód bierze się wtedy ze zdania odmowy (`aircraftRefusal.ts`,
 * `accountRefusal.ts`), czyli z tego samego brzmienia, którym odpowiedziałby serwer.
 *
 * ══ ZDANIE WCHODZI DO NAPISU, WIĘC ZOSTAWIA KROPKĘ ZA DRZWIAMI ══
 * Odmowa jest zdaniem („Najpierw wyłącz samolot ze służby.") i kropka jest tam na
 * miejscu. Doklejona do etykiety dawała jednak przycisk z kropką W ŚRODKU napisu:
 * „Usuń samolot - najpierw wyłącz samolot ze służby." Napis na przycisku nie jest
 * zdaniem, tylko nazwą czynności, więc kropka schodzi. Pełne zdanie zostaje w `title`.
 *
 * ══ MAŁA LITERA TYLKO NA POCZĄTKU ══
 * Do 2026-09-07 stało tu `reason.toLowerCase()` - i przerabiało „To Twoje konto."
 * na „to twoje konto.", czyli gasiło grzecznościową wielką literę. Doklejka jest
 * dalszym ciągiem etykiety, więc małą literę dostaje wyłącznie PIERWSZY znak.
 *
 * Wyjątek jest jeden i przewidziany: napis zaczynający się WERSALIKAMI (rejestracja
 * „SP-AXA", skrót „MH") zostaje bez zmian - „sP-AXA" byłoby literówką, nie zdaniem.
 */

/** Powód blokady w postaci, w jakiej dokleja się go do etykiety przycisku. */
export function reasonSuffix(reason: string): string {
  const trimmed = reason.trim().replace(/\.$/, '');
  if (trimmed === '') return '';
  const [first = '', second = ''] = trimmed;
  // Dwa wersaliki z rzędu to skrót albo kod - takiego napisu nie ruszamy.
  const acronym = first === first.toUpperCase() && second === second.toUpperCase();
  return acronym ? trimmed : first.toLowerCase() + trimmed.slice(1);
}
