/**
 * Ninerdeck - RAMKI KANAŁU KLUBU od serwera, strona telefonu (4.0.0,
 * `docs/kanal-klubu.md` §3.2; epik KK-C #246).
 *
 * Koperta `{ v: 1, type, … }` jest jedna dla telefonu i panelu. Telefon - jak panel -
 * rozpoznaje to, co zna, a ramkę poprawnego kształtu, ale nieznanego typu, IGNORUJE:
 * nowszy serwer dokłada rodzaje ramek bez psucia starszej aplikacji, a starszej
 * aplikacji nie da się zaktualizować w chwili wdrożenia serwera. Rozmowy zleceń
 * (`message`, `read`) przyjdą z ekranami zleceń (Z-C); do tego czasu są ramką nieznaną.
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

import type { RemoteCalendarDay, RemoteNotification } from '../ports';

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
  /** Powód zamknięcia - łącze reaguje jak REST na tę samą odmowę: odświeża tokeny. */
  | { type: 'bye'; reason: string }
  | { type: 'ignored' };

/** Ramki z treścią dla aplikacji - te podaje dalej łącze. */
export type LiveDataFrame = Extract<LiveFrame, { type: 'changed' | 'notification' }>;

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
    case 'bye':
      return { type: 'bye', reason: text(value.reason) ?? 'unknown' };
    default:
      return typeof value.type === 'string' ? { type: 'ignored' } : null;
  }
}
