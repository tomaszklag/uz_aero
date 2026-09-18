/**
 * Ninerdeck - panel: formularz hasła na `#/konto` (2.1.0, issue #134 D6; mockup `konto`;
 * `docs/logowanie-haslem.md` §5.3, D4).
 *
 * Moduł CZYSTY. Trzy decyzje, wszystkie takie, które w JSX rozjeżdżają się po cichu:
 * kiedy wolno zapisać, co powiedzieć pod którym polem i jak nazwać odmowę serwera.
 *
 * ══ POLITYKĘ LICZY DOMENA, NIE TEN PLIK ══
 * `checkPassword` jest TĄ SAMĄ funkcją, której używa serwer (`PUT /me/password`,
 * `POST /auth/password/reset`), telefon i strona z linku. To jeden z dwóch imiennych
 * wyjątków od zakazu importowania WARTOŚCI z domeny (`test/architecture.test.ts`)
 * i ma dokładnie ten powód: reguła sprawdzana po obu stronach z jednej funkcji nie ma
 * jak powiedzieć człowiekowi „hasło dobre", a serwerowi „hasło słabe".
 *
 * NIST SP 800-63B: długość jest jedyną miarą siły. Żadnych wymogów co do rodzaju znaków,
 * żadnego wskaźnika siły, żadnego wygasania - i dlatego nie ma tu czego rysować poza
 * jednym zdaniem pod polem.
 */

import {
  PASSWORD_MIN_LENGTH,
  checkPassword,
} from '@ninerdeck/domain';
import type { PasswordWeakness } from '@ninerdeck/domain';

import { isHttpError } from '../../api/httpClient';

export interface PasswordDraft {
  /** Puste, gdy osoba hasła jeszcze nie ma - wtedy pola w ogóle nie ma na ekranie. */
  current: string;
  next: string;
  repeat: string;
}

export const EMPTY_PASSWORD: PasswordDraft = { current: '', next: '', repeat: '' };

/** Kim jest osoba ustawiająca hasło - do listy zablokowanych fragmentów tożsamości. */
export interface PasswordIdentity {
  email: string | null;
  name: string;
}

/**
 * Zdania polityki - po jednym na powód.
 *
 * Mówią, CO JEST NIE TAK z wpisaną wartością, a nie jakie są wymagania: wymagania stoją
 * w podpowiedzi pod polem i widać je zanim ktokolwiek zacznie pisać.
 */
const WEAKNESS_TEXT: Record<PasswordWeakness, string> = {
  too_short: `Za krótkie - co najmniej ${PASSWORD_MIN_LENGTH} znaków.`,
  too_long: 'Za długie - skróć je.',
  blocklisted: 'Za łatwe do odgadnięcia - wybierz inne.',
  contains_email: 'Za łatwe do odgadnięcia - zawiera Twój adres.',
  contains_name: 'Za łatwe do odgadnięcia - zawiera Twoje nazwisko.',
};

export const weaknessText = (weakness: PasswordWeakness): string => WEAKNESS_TEXT[weakness];

export interface PasswordVerdict {
  /** Zdanie pod polem „Nowe hasło"; `null` = nic do powiedzenia. */
  nextError: string | null;
  /** Zdanie pod polem „Powtórz hasło"; `null` = nic do powiedzenia. */
  repeatError: string | null;
  /** Czy „Zapisz hasło" jest czynne. */
  canSave: boolean;
}

/**
 * Werdykt formularza.
 *
 * ══ PUSTE POLE NIE DOSTAJE ZDANIA ══
 * Blokadę widać wtedy z pól nad przyciskiem (reguła issue #55), a „wpisz hasło, żeby
 * zapisać" opisywałoby rzecz, którą człowiek właśnie widzi. Zdanie pada dopiero wtedy,
 * gdy coś JEST wpisane i jest z tym problem.
 *
 * Powtórka sprawdza się dopiero, gdy jest niepusta: czerwona ramka pod drugim polem
 * w chwili, gdy ktoś skończył pisać pierwsze, jest zarzutem postawionym za wcześnie.
 */
export function verdictOf(draft: PasswordDraft, identity: PasswordIdentity, hasPassword: boolean): PasswordVerdict {
  const weakness = draft.next === '' ? null : checkPassword(draft.next, identity);
  const mismatch = draft.repeat !== '' && draft.repeat !== draft.next;

  const complete =
    draft.next !== '' &&
    draft.repeat === draft.next &&
    // Osoba, która hasło JUŻ MA, musi podać obecne - serwer i tak go zażąda
    // (`401 invalid_credentials`), więc przycisk nie obiecuje zapisu bez niego.
    (!hasPassword || draft.current !== '');

  return {
    nextError: weakness == null ? null : weaknessText(weakness),
    repeatError: mismatch ? 'Hasła nie są takie same.' : null,
    canSave: complete && weakness == null,
  };
}

/**
 * Odmowa serwera - zdanie do banera albo `null`, gdy należy pod pole „Nowe hasło".
 *
 * `400 weak_password` wraca TYM SAMYM zdaniem, które ekran pokazał przy wpisie: obie
 * strony liczą jedną politykę, więc druga wersja tego samego zarzutu byłaby dowodem,
 * że gdzieś jest kopia reguły.
 */
export function passwordFailure(error: unknown): { field: string | null; banner: string | null } {
  if (!isHttpError(error)) {
    return { field: null, banner: 'Nie ma połączenia z serwerem. Spróbuj za chwilę.' };
  }

  if (error.status === 400 && error.body.error === 'weak_password') {
    const reason = error.body.reason as PasswordWeakness | undefined;
    return {
      field: reason != null && reason in WEAKNESS_TEXT ? WEAKNESS_TEXT[reason] : 'Wybierz inne hasło.',
      banner: null,
    };
  }

  if (error.status === 401) {
    // Obecne hasło się nie zgadza - ta sama odmowa, co przy logowaniu, i to samo zdanie.
    return { field: null, banner: 'Nieprawidłowe obecne hasło.' };
  }
  if (error.status === 429) {
    return { field: null, banner: 'Za dużo prób - spróbuj za chwilę.' };
  }

  return { field: null, banner: `Nie udało się zapisać hasła (kod ${error.status}).` };
}
