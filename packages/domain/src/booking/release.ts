/**
 * Ninerdeck - KIEDY SLOT ZWALNIA SIĘ SAM (milestone 3.0.0, `docs/rezerwacje.md` §4.1).
 *
 * Rezerwacja, po którą nikt nie przyszedł, blokowała maszynę do końca slotu - w sobotę
 * to godziny, w których ktoś inny mógłby polecieć. Po `RELEASE_AFTER_MS` od POCZĄTKU
 * rezerwacji serwer zwalnia termin, jeśli nie widzi, żeby ktoś maszynę wziął.
 *
 * ══ TO JEST ŚWIADOMY WYŁOM W ROZDZIALE REJESTRU I REZERWACJI ══
 * Rezerwacja zaczyna tu zależeć od zdarzeń rejestru - i cena jest realna: pilot lecący
 * BEZ ZASIĘGU wysyła zdarzenia dopiero po locie, więc z punktu widzenia serwera „nie
 * przyszedł", a jego slot zwolni się w trakcie lotu. Przyjęte świadomie: zwolnienie
 * nie kasuje rezerwacji ani nie przerywa lotu, a maszyny fizycznie nie ma w hangarze,
 * więc kolejny pilot zderzy się z tym samym, z czym zderzyłby się bez rezerwacji.
 * Wariant „czekaj, aż telefon POTWIERDZI brak lotu" nie istnieje: brak zdarzenia jest
 * nieodróżnialny od braku zasięgu i taki zostanie.
 *
 * Funkcja jest czysta i mieszka w `packages/domain`, żeby regułę dało się przeczytać
 * w jednym miejscu - zadanie okresowe serwera wyłącznie ją woła.
 */

import { RELEASE_AFTER_MS } from './policy';

/** Rezerwacja widziana przez regułę - tyle, ile trzeba, żeby orzec. */
export interface ReleaseCandidate {
  startsAt: number;
  endsAt: number;
}

/**
 * Zajętość maszyny WEDŁUG REJESTRU: operacja przejęta o `claimedAt` i zdana o `closedAt`
 * (`null` = wciąż trwa).
 */
export interface AircraftUse {
  claimedAt: number | null;
  closedAt: number | null;
}

/**
 * Czy rezerwację wolno zwolnić.
 *
 * Trzy warunki naraz i każdy z własnego powodu:
 *
 *  1. **minęła godzina od początku** - wcześniej pilot jest po prostu spóźniony;
 *  2. **termin się jeszcze nie skończył** - po `endsAt` slot i tak jest wolny, a
 *     przestawianie statusu rezerwacji sprzed tygodnia zmieniałoby wyłącznie zapis;
 *  3. **żadna operacja tej maszyny nie zahaczyła o okno rezerwacji**.
 *
 * Trzeci warunek celowo NIE pyta „czy operacja zaczęła się po `startsAt`": pilot, który
 * przyszedł kwadrans przed czasem, wziął tę maszynę na ten właśnie termin, a operacja
 * trwająca od rana przez środek rezerwacji znaczy, że maszyna jest w powietrzu i nie
 * ma czego zwalniać.
 */
export function shouldRelease(
  booking: ReleaseCandidate,
  uses: readonly AircraftUse[],
  now: number,
): boolean {
  if (now < booking.startsAt + RELEASE_AFTER_MS) return false;
  if (now >= booking.endsAt) return false;
  return !uses.some((use) => overlaps(use, booking, now));
}

/**
 * Czy operacja zahaczyła o okno rezerwacji. Operacja otwarta („trwa") liczy się do
 * chwili bieżącej - i to jest właściwa odpowiedź, bo maszyny nikt nie oddał.
 */
function overlaps(use: AircraftUse, booking: ReleaseCandidate, now: number): boolean {
  if (use.claimedAt == null) return false;
  const until = use.closedAt ?? now;
  return use.claimedAt < booking.endsAt && until > booking.startsAt;
}
