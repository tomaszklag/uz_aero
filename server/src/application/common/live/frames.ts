/**
 * Ninerdeck (serwer) - RAMKI KANAŁU KLUBU (4.0.0, `docs/kanal-klubu.md` §3.2).
 *
 * Koperta `{ v: 1, type, … }` jest jedna dla wszystkich modułów - zlecenia, skrzynka,
 * kalendarz, dziennik - a nowy moduł dokłada swój rodzaj ramki, nie nowe połączenie.
 * Klient ignoruje ramkę nieznanego typu (starszy telefon nie wywraca się na nowej), więc
 * nowy `type` wolno dołożyć bez podbijania `v`; `v` rośnie dopiero, gdy zmienia się
 * znaczenie ramki, którą klient już zna.
 *
 * Każda ramka z danymi niesie `org` - klub, którym połączenie się uwierzytelniło. Kanał nie
 * niesie danych innego klubu nigdy (§5), a klient porównuje `org` z klubem aktywnym tak
 * samo, jak robi to z pushem.
 *
 * Pola koperty idą PO treści: treść, która przypadkiem niesie własne `type` albo `org`,
 * nie przestawi rodzaju ramki ani klubu.
 */

import type { InboxItem } from '../notify/inboxItem.ts';
import type { LiveByeReason, LiveFrame } from '../ports.ts';

export const LIVE_VERSION = 1;

/** Sygnał zmiany - same tematy, bez treści; kształt per widz liczy REST (§2). */
export function changedFrame(orgId: string, topics: readonly string[]): LiveFrame {
  return { v: LIVE_VERSION, type: 'changed', org: orgId, topics: [...topics] };
}

/**
 * Nowa wiadomość w skrzynce (K4): pozycja w kształcie REST - ta sama, którą oddaje
 * odczyt skrzynki - i liczba nieprzeczytanych PO jej zapisie, więc licznik przy dzwonku
 * odświeża się bez drugiego żądania.
 *
 * `quiet: true` - adresat siedzi w załodze operacji w toku (cisza w kokpicie, pkt 44
 * zleceń; decyzje 2026-10-06): telefon dociąga skrzynkę, ale banera nie stawia. Pole
 * istnieje tylko z wartością - poza załogą ramka wygląda jak dotąd.
 */
export function notificationFrame(orgId: string, item: InboxItem, unread: number, quiet: boolean): LiveFrame {
  return { item, unread, ...(quiet ? { quiet: true } : {}), v: LIVE_VERSION, type: 'notification', org: orgId };
}

/** Wiadomość w rozmowie w całości, w kształcie REST. */
export function messageFrame(orgId: string, body: Record<string, unknown>): LiveFrame {
  return { ...body, v: LIVE_VERSION, type: 'message', org: orgId };
}

/** Odczytanie rozmowy - kto i kiedy. */
export function readFrame(orgId: string, body: Record<string, unknown>): LiveFrame {
  return { ...body, v: LIVE_VERSION, type: 'read', org: orgId };
}

/** Powód zamknięcia połączenia - klient reaguje jak na tę samą odmowę REST. */
export function byeFrame(reason: LiveByeReason): LiveFrame {
  return { v: LIVE_VERSION, type: 'bye', reason };
}

/**
 * Powitanie po uwierzytelnieniu - sesja, do której należy połączenie, i czas serwera
 * (klient widzi rozjazd zegara bez osobnego żądania).
 */
export function helloFrame(sessionId: string | null, at: Date): LiveFrame {
  return { v: LIVE_VERSION, type: 'hello', session: sessionId, serverTime: at.toISOString() };
}

/** Podtrzymanie połączenia - w obie strony (§3.2). */
export function pingFrame(): LiveFrame {
  return { v: LIVE_VERSION, type: 'ping' };
}

export function pongFrame(): LiveFrame {
  return { v: LIVE_VERSION, type: 'pong' };
}
