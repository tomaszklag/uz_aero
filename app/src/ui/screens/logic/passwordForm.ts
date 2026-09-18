/**
 * Ninerdeck - arkusz 13B: ustawienie albo zmiana hasła (makieta `design/13-ustawienia.html`
 * ramka `#haslo`; `docs/logowanie-haslem.md` §5.3, D4).
 *
 * Moduł CZYSTY - trzy decyzje, które w JSX rozjeżdżają się po cichu: kiedy wolno zapisać,
 * co powiedzieć pod którym polem i jak nazwać wiersz w ustawieniach.
 *
 * ══ POLITYKĘ LICZY DOMENA, NIE TEN PLIK ══
 * `checkPassword` jest TĄ SAMĄ funkcją, której używa serwer (`PUT /me/password`), panel
 * i strona z linku. Kopia reguły dałaby arkusz mówiący „hasło dobre" przy serwerze
 * odpowiadającym `weak_password` - a wtedy pilot nie ma jak się dowiedzieć, co poprawić.
 *
 * NIST SP 800-63B: DŁUGOŚĆ JEST JEDYNĄ MIARĄ SIŁY. Żadnych wymogów co do rodzaju znaków,
 * żadnego paska „siły hasła" - pasek udawałby pomiar, którego nie ma.
 */

import { PASSWORD_MIN_LENGTH, checkPassword } from '@ninerdeck/domain';

import { weaknessText } from './loginMessage';

export interface PasswordDraft {
  /** Puste, gdy osoba hasła jeszcze nie ma - wtedy pola w ogóle nie ma w arkuszu. */
  current: string;
  next: string;
  repeat: string;
}

export const EMPTY_PASSWORD_DRAFT: PasswordDraft = { current: '', next: '', repeat: '' };

/** Kim jest osoba ustawiająca hasło - do listy zablokowanych fragmentów tożsamości. */
export interface PasswordIdentity {
  email: string | null;
  name: string;
}

export interface PasswordVerdict {
  /**
   * Podpowiedź polityki pod „Nowe hasło" - pojawia się PO PIERWSZYM ZNAKU.
   *
   * Pusty formularz milczy (issue #55: blokadę widać z pól), a zdanie o polityce PRZED
   * wpisem uczyłoby, że ekran tłumaczy się sam. `null` = nie ma czego mówić.
   */
  hint: string | null;
  /** Czy podpowiedź jest BURSZTYNOWA - wartość nie przechodzi polityki. */
  hintWarns: boolean;
  /** Zdanie pod „Powtórz hasło"; `null` = nic do powiedzenia. */
  repeatError: string | null;
  /** Czy „ZAPISZ HASŁO" jest czynne. */
  canSave: boolean;
}

const POLICY_HINT = `co najmniej ${PASSWORD_MIN_LENGTH} znaków · bez wymogów co do znaków`;

/**
 * Werdykt arkusza.
 *
 * Powtórka sprawdza się dopiero, gdy JEST niepusta: czerwona ramka pod drugim polem
 * w chwili, gdy ktoś skończył pisać pierwsze, jest zarzutem postawionym za wcześnie.
 *
 * `hasPassword` mówi, czy w arkuszu stoi pole „Obecne hasło". Serwer i tak go zażąda
 * (`401 invalid_credentials`), więc przycisk nie obiecuje zapisu bez niego.
 */
export function passwordVerdict(
  draft: PasswordDraft,
  identity: PasswordIdentity,
  hasPassword: boolean,
): PasswordVerdict {
  const weakness = draft.next === '' ? null : checkPassword(draft.next, identity);
  const mismatch = draft.repeat !== '' && draft.repeat !== draft.next;

  return {
    // Dopóki hasło jest ZA KRÓTKIE, podpowiedź powtarza wymóg bursztynem - to jedyny
    // powód, który pilot naprawia, pisząc dalej. Pozostałe („za łatwe", „zawiera Twój
    // adres") są ZARZUTAMI do wartości i mówią, co jest nie tak.
    hint: draft.next === '' ? null : weakness == null ? POLICY_HINT : weaknessOrPolicy(weakness),
    hintWarns: weakness != null,
    repeatError: mismatch ? 'Hasła się różnią.' : null,
    canSave:
      weakness == null &&
      draft.next !== '' &&
      draft.repeat === draft.next &&
      (!hasPassword || draft.current !== ''),
  };
}

/** Wiersz w sekcji „Hasło" - JEDEN wiersz, dwa napisy (lustro wiersza PIN wyżej). */
export interface PasswordRow {
  name: string;
  sub: string;
}

/**
 * Nazwa wiersza i jego podpis.
 *
 * Podpis mówi PO CO, a nie „wymaga internetu": sieć jest stanem domyślnym i nie dostaje
 * zdania (reguła SyncChipa z issue #12). Powód pojawia się dopiero jako BLOKADA - brak
 * sieci albo sesja zerwana zdalnie - bo wtedy opisuje rzecz, której z ekranu nie widać.
 */
export function passwordRow(hasPassword: boolean, block: PasswordBlock): PasswordRow {
  const name = hasPassword ? 'Zmień hasło' : 'Ustaw hasło';
  if (block === 'revoked') return { name, sub: 'niedostępne - zaloguj się ponownie' };
  if (block === 'offline') return { name, sub: 'niedostępne - wymaga internetu' };
  return {
    name,
    sub: hasPassword ? 'najpierw obecne, potem nowe' : 'do logowania na wspólnym tablecie',
  };
}

/**
 * Dlaczego wiersz jest wygaszony. `null` = czynny.
 *
 * Kolejność jest kolejnością POWAGI: sesja zerwana zdalnie nie naprawi się z zasięgiem,
 * a brak sieci - owszem. Wygaszenie NIE jest zakazanym „wyszarzonym przyciskiem" (10B):
 * akcja jest dozwolona i zadziała, tylko nie teraz - a powód stoi w wierszu.
 */
export type PasswordBlock = 'revoked' | 'offline' | null;

export const passwordBlock = (revoked: boolean, online: boolean): PasswordBlock =>
  revoked ? 'revoked' : online ? null : 'offline';

const weaknessOrPolicy = (weakness: Parameters<typeof weaknessText>[0]): string =>
  weakness === 'too_short' ? POLICY_HINT : weaknessText(weakness);
