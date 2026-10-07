/**
 * Ninerdeck - RAMKI KANAŁU KLUBU od serwera, strona telefonu (4.0.0,
 * `docs/kanal-klubu.md` §3.2; epik KK-C #246).
 *
 * Koperta `{ v: 1, type, … }` jest jedna dla telefonu i panelu. Telefon - jak panel -
 * rozpoznaje to, co zna, a ramkę poprawnego kształtu, ale nieznanego typu, IGNORUJE:
 * nowszy serwer dokłada rodzaje ramek bez psucia starszej aplikacji, a starszej
 * aplikacji nie da się zaktualizować w chwili wdrożenia serwera.
 *
 * Rozmowy zleceń (`message`, `read`; epik Z-C #247, `docs/zlecenia.md` §11) niosą TREŚĆ
 * w całości - otwarta rozmowa dopisuje wiadomość bez pytania serwera. Ramka rozmowy bez
 * wskazania rozmowy (zlecenie × adresat) albo z wiadomością spoza kształtu REST jest
 * ignorowana: nie ma czego z nią zrobić, a zgubiona ramka niczego nie gubi (K2).
 *
 * Ramki z danymi niosą `org` - klub, którym połączenie się uwierzytelniło. Łącze porównuje
 * go z klubem, dla którego połączenie otwarto (§5), tak jak tapnięcie w push porównuje
 * klub wiadomości z klubem aktywnym. Brak klubu w ramce = `null`, czyli ramka, której
 * nikt nie poda dalej.
 *
 * Pozycja skrzynki w ramce `notification` ma KSZTAŁT REST - tę samą, którą oddaje
 * `GET /me/notifications` (serwer składa obie jedną funkcją). Parser przepisuje z niej
 * wyłącznie znane pola: wiersz skrzynki i baner rysują się jednym kodem, niezależnie od
 * tego, czy wiadomość przyszła odczytem, czy kanałem.
 *
 * Czysty moduł: tekst → ramka albo `null` (to nie jest obiekt JSON z napisem `type`).
 */

import type { RemoteCalendarDay, RemoteNotification, RemoteThreadMessage } from '../ports';

/** Ramka po odczytaniu - wyłącznie pola, z których telefon korzysta. */
export type LiveFrame =
  | { type: 'hello' }
  | { type: 'ping' }
  /** Tematy bez treści - ekran, który je pokazuje, czyta je od nowa RESTem (K2). */
  | { type: 'changed'; org: string | null; topics: string[] }
  /**
   * Nowa wiadomość w skrzynce. `item` = `null`, gdy pozycja nie ma kształtu REST
   * (licznik i tak się przyda), `unread` = nieprzeczytane w całej skrzynce PO zapisie,
   * `quiet` = adresat siedzi w załodze operacji w toku (cisza w kokpicie, decyzje
   * 2026-10-06) - skrzynka się odświeża, baneru nie ma.
   */
  | {
      type: 'notification';
      org: string | null;
      item: RemoteNotification | null;
      unread: number | null;
      quiet: boolean;
    }
  /**
   * Wiadomość w rozmowie zlecenia W CAŁOŚCI, w kształcie REST. Rozmowę wskazuje para
   * zlecenie × adresat (§7.1) - ta sama, co w ścieżce `…/threads/:recipientId`.
   */
  | {
      type: 'message';
      org: string | null;
      orderId: string;
      recipientId: string;
      message: RemoteThreadMessage;
    }
  /** Uczestnik przeczytał rozmowę - „Odczytane 14:05" pod ostatnią wiadomością. */
  | {
      type: 'read';
      org: string | null;
      orderId: string;
      recipientId: string;
      pilotId: string;
      at: string;
    }
  /** Powód zamknięcia - łącze reaguje jak REST na tę samą odmowę: odświeża tokeny. */
  | { type: 'bye'; reason: string }
  | { type: 'ignored' };

/** Ramki z treścią dla aplikacji - te podaje dalej łącze. */
export type LiveDataFrame = Extract<LiveFrame, { type: 'changed' | 'notification' | 'message' | 'read' }>;

/** Ramki rozmowy - otwarta rozmowa dostaje je od razu i w całości. */
export type ThreadFrame = Extract<LiveDataFrame, { type: 'message' | 'read' }>;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  value != null && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Doba klubu terminu - wszystkie trzy chwile albo nic (wiersz pokaże się bez godzin). */
function dayOf(value: unknown): RemoteCalendarDay | null {
  if (!isObject(value)) return null;
  const date = text(value.date);
  const startsAt = text(value.startsAt);
  const endsAt = text(value.endsAt);
  return date == null || startsAt == null || endsAt == null ? null : { date, startsAt, endsAt };
}

/** Pozycja skrzynki w kształcie REST albo `null` - bez pól, których REST nie zna. */
function notificationOf(value: unknown): RemoteNotification | null {
  if (!isObject(value)) return null;
  const id = text(value.id);
  const kind = text(value.kind);
  const createdAt = text(value.createdAt);
  if (id == null || kind == null || createdAt == null || !isObject(value.payload)) return null;
  return { id, kind, payload: value.payload, createdAt, readAt: text(value.readAt), day: dayOf(value.day) };
}

/** Wiadomość rozmowy w kształcie REST albo `null` - pola obce (`threadId`) zostają na serwerze. */
function threadMessageOf(value: unknown): RemoteThreadMessage | null {
  if (!isObject(value)) return null;
  const id = text(value.id);
  const authorId = text(value.authorId);
  const body = text(value.body);
  const createdAt = text(value.createdAt);
  if (id == null || authorId == null || body == null || createdAt == null) return null;
  return { id, authorId, body, createdAt };
}

/** Ramka rozmowy; bez wskazania rozmowy albo z treścią spoza kształtu - ignorowana. */
function threadFrameOf(value: Json): LiveFrame {
  const org = text(value.org);
  const orderId = text(value.orderId);
  const recipientId = text(value.recipientId);
  if (orderId == null || recipientId == null) return { type: 'ignored' };
  if (value.type === 'message') {
    const message = threadMessageOf(value.message);
    return message == null ? { type: 'ignored' } : { type: 'message', org, orderId, recipientId, message };
  }
  const pilotId = text(value.pilotId);
  const at = text(value.at);
  return pilotId == null || at == null
    ? { type: 'ignored' }
    : { type: 'read', org, orderId, recipientId, pilotId, at };
}

export function parseFrame(raw: string): LiveFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  switch (value.type) {
    case 'hello':
      return { type: 'hello' };
    case 'ping':
      return { type: 'ping' };
    case 'changed':
      return {
        type: 'changed',
        org: text(value.org),
        topics: Array.isArray(value.topics) ? value.topics.filter((t): t is string => typeof t === 'string') : [],
      };
    case 'notification':
      return {
        type: 'notification',
        org: text(value.org),
        item: notificationOf(value.item),
        unread: typeof value.unread === 'number' ? value.unread : null,
        // Wyłącznie `true` wycisza - cisza jest wyjątkiem, nie domysłem.
        quiet: value.quiet === true,
      };
    case 'message':
    case 'read':
      return threadFrameOf(value);
    case 'bye':
      return { type: 'bye', reason: text(value.reason) ?? 'unknown' };
    default:
      return typeof value.type === 'string' ? { type: 'ignored' } : null;
  }
}
