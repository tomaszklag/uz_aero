/**
 * Ninerdeck - panel: RAMKI KANAŁU KLUBU od serwera (4.0.0, `docs/kanal-klubu.md` §3.2;
 * epik KK-D #246).
 *
 * Koperta `{ v: 1, type, … }` - jedna dla wszystkich modułów. Panel rozpoznaje to, co
 * zna, a ramkę poprawnego kształtu, ale nieznanego typu, IGNORUJE: nowszy serwer dokłada
 * rodzaje ramek bez psucia starszego panelu - ta sama zasada, co nieznany rodzaj
 * powiadomienia w skrzynce. Rozmowy w zleceniu (`message`, `read`; epik Z-D #248) niosą
 * wskazanie rozmowy - zlecenie i adresata - a ramka bez niego albo z wiadomością spoza
 * kształtu jest ignorowana, jak nieznana.
 *
 * Czysty moduł: tekst → ramka albo `null` (to nie jest obiekt JSON z napisem `type`).
 */

import { asThreadMessage, type ThreadMessageDto } from '../queries/threadCache';

/** Ramka po odczytaniu - wyłącznie pola, z których panel korzysta. */
export type LiveFrame =
  | { type: 'hello' }
  | { type: 'ping' }
  /** Tematy bez treści - ekran, który je pokazuje, czyta je od nowa RESTem. */
  | { type: 'changed'; topics: string[] }
  /** Pozycja skrzynki w kształcie REST + liczba nieprzeczytanych - czyta ją skrzynka. */
  | { type: 'notification'; item: unknown; unread: number | null }
  /** Wiadomość w rozmowie zlecenia W CAŁOŚCI - otwarta rozmowa dopisuje ją bez odczytu. */
  | { type: 'message'; orderId: string; recipientId: string; message: ThreadMessageDto }
  /** Uczestnik przeczytał rozmowę - „Odczytane 07:41" u drugiej strony. */
  | { type: 'read'; orderId: string; recipientId: string; pilotId: string; at: string }
  /** Powód zamknięcia - o tym, co dalej, rozstrzyga brama REST (`GET /me`). */
  | { type: 'bye'; reason: string }
  | { type: 'ignored' };

export function parseFrame(text: string): LiveFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const frame = value as Record<string, unknown>;
  switch (frame.type) {
    case 'hello':
      return { type: 'hello' };
    case 'ping':
      return { type: 'ping' };
    case 'changed':
      return {
        type: 'changed',
        topics: Array.isArray(frame.topics) ? frame.topics.filter((t): t is string => typeof t === 'string') : [],
      };
    case 'notification':
      return { type: 'notification', item: frame.item, unread: typeof frame.unread === 'number' ? frame.unread : null };
    case 'message':
    case 'read':
      return threadFrame(frame);
    case 'bye':
      return { type: 'bye', reason: typeof frame.reason === 'string' ? frame.reason : 'unknown' };
    default:
      return typeof frame.type === 'string' ? { type: 'ignored' } : null;
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** Ramka rozmowy; bez wskazania rozmowy albo z treścią spoza kształtu - ignorowana. */
function threadFrame(frame: Record<string, unknown>): LiveFrame {
  const orderId = text(frame.orderId);
  const recipientId = text(frame.recipientId);
  if (orderId == null || recipientId == null) return { type: 'ignored' };
  if (frame.type === 'message') {
    const message = asThreadMessage(frame.message);
    return message == null ? { type: 'ignored' } : { type: 'message', orderId, recipientId, message };
  }
  const pilotId = text(frame.pilotId);
  const at = text(frame.at);
  return pilotId == null || at == null ? { type: 'ignored' } : { type: 'read', orderId, recipientId, pilotId, at };
}
