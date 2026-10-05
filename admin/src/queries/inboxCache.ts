/**
 * Ninerdeck - panel: PAMIĘĆ SKRZYNKI - czyste przekształcenia stron (4.0.0, K7
 * `docs/kanal-klubu.md`; epik KK-D #246).
 *
 * Skrzynka żyje w jednym zapytaniu w stronach (`keys.notifications.inbox`). Dwie rzeczy
 * zmieniają ją bez odczytu: ramka `notification` kanału klubu (nowa albo odświeżona
 * wiadomość - rozmowa ma JEDEN wiersz na wątek, więc ten sam identyfikator wraca z nową
 * treścią) i przeczytanie z otwarciem listy. Obie są tutaj, jako czyste funkcje z testem -
 * hak tylko je woła.
 */

import type { InfiniteData } from '@tanstack/react-query';

import type { InboxCursor } from '../api/notifications';
import type { InboxItemDto, InboxPageDto } from '../api/dto';

/** Kształt wiadomości dla kanału klubu - `live/` nie importuje z `api/` (strażnik architektury). */
export type { InboxItemDto };

export type InboxData = InfiniteData<InboxPageDto, InboxCursor | null>;

/** Kursor następnej strony - ostatni wiersz tej strony. */
export const cursorOf = (item: InboxItemDto): InboxCursor => ({ at: item.createdAt, id: item.id });

/** Pozycja skrzynki z ramki kanału; `null` = to nie jest kształt wiersza skrzynki. */
export function asInboxItem(value: unknown): InboxItemDto | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.kind !== 'string' || typeof v.createdAt !== 'string') return null;
  const payload = v.payload != null && typeof v.payload === 'object' && !Array.isArray(v.payload) ? v.payload : {};
  const day = v.day as InboxItemDto['day'] | undefined;
  return {
    id: v.id,
    kind: v.kind,
    payload: payload as Record<string, unknown>,
    createdAt: v.createdAt,
    readAt: typeof v.readAt === 'string' ? v.readAt : null,
    day: day != null && typeof day === 'object' && typeof day.date === 'string' ? day : null,
  };
}

/**
 * Wiadomość z kanału na górę pierwszej strony - ta sama (odświeżona rozmowa) znika
 * z miejsca, w którym stała. Liczba nieprzeczytanych idzie z ramki: serwer liczy ją po
 * zapisie, więc jest prawdziwa także wtedy, gdy panel ma pobraną tylko część skrzynki.
 */
export function withNotification(
  data: InboxData | undefined,
  item: InboxItemDto,
  unread: number | null,
): InboxData | undefined {
  if (data == null || data.pages.length === 0) return data;
  const pages = data.pages.map((page, index) => {
    const items = page.items.filter((existing) => existing.id !== item.id);
    if (index !== 0) return { ...page, items };
    return { ...page, items: [item, ...items], unread: unread ?? page.unread };
  });
  return { ...data, pages };
}

/** Przeczytane - stempel przy wierszach i liczba przy dzwonku pomniejszona o nie. */
export function withRead(data: InboxData | undefined, ids: ReadonlySet<string>, at: string): InboxData | undefined {
  if (data == null || ids.size === 0) return data;
  let marked = 0;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((item) => {
      if (item.readAt != null || !ids.has(item.id)) return item;
      marked += 1;
      return { ...item, readAt: at };
    }),
  }));
  const first = pages[0];
  if (first != null) pages[0] = { ...first, unread: Math.max(0, first.unread - marked) };
  return { ...data, pages };
}

/** Wszystkie pobrane wiersze - strony sklejone w jedną listę, najnowsze pierwsze. */
export const inboxItems = (data: InboxData | undefined): InboxItemDto[] =>
  data == null ? [] : data.pages.flatMap((page) => page.items);

/** Liczba przy dzwonku - z pierwszej strony; `null` = jeszcze nie wiadomo. */
export const unreadCount = (data: InboxData | undefined): number | null => data?.pages[0]?.unread ?? null;
