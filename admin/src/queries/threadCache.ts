/**
 * Ninerdeck - panel: PAMIĘĆ ROZMOWY W ZLECENIU - czyste przekształcenia stron (4.0.0,
 * epik Z-D #248; `docs/zlecenia.md` §7, `docs/kanal-klubu.md` §3.2).
 *
 * Rozmowa żyje w jednym zapytaniu w stronach (`keys.orders.thread`), od najnowszej.
 * Trzy rzeczy zmieniają ją bez odczytu: ramka `message` kanału klubu (wiadomość
 * W CAŁOŚCI), odpowiedź na wysyłkę (ta sama wiadomość drugą drogą) i ramka `read`
 * (odczyt drugiej strony). O tożsamości wiadomości rozstrzyga identyfikator, nie
 * kolejność - ramka i odpowiedź przychodzą w dowolnej kolejności, a ta sama wiadomość
 * nie staje dwa razy. Ta sama zasada, co w telefonie (`threadState.ts`).
 *
 * Moduł czysty - hak i kanał tylko go wołają; test obok.
 */

import type { InfiniteData } from '@tanstack/react-query';

import type { ThreadCursorDto, ThreadMessageDto, ThreadPageDto } from '../api/dto';

/** Kształt wiadomości dla kanału klubu - `live/` nie importuje z `api/` (strażnik architektury). */
export type { ThreadMessageDto };

export type ThreadData = InfiniteData<ThreadPageDto, ThreadCursorDto | null>;

/** Wiadomość z ramki kanału; `null` = to nie jest kształt wiadomości rozmowy. */
export function asThreadMessage(value: unknown): ThreadMessageDto | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const text = (key: string): string | null => (typeof v[key] === 'string' ? (v[key] as string) : null);
  const id = text('id');
  const authorId = text('authorId');
  const body = text('body');
  const createdAt = text('createdAt');
  return id == null || authorId == null || body == null || createdAt == null ? null : { id, authorId, body, createdAt };
}

/**
 * Wiadomość na górę pierwszej strony - ta sama (identyfikator) znika z miejsca, w którym
 * stała. Rozmowa, której pamięć jeszcze nie istnieje, zostaje bez zmian: przeczyta się
 * w całości przy otwarciu.
 */
export function withMessage(data: ThreadData | undefined, message: ThreadMessageDto): ThreadData | undefined {
  if (data == null || data.pages.length === 0) return data;
  const pages = data.pages.map((page, index) => {
    const messages = page.messages.filter((m) => m.id !== message.id);
    return index === 0 ? { ...page, messages: [message, ...messages] } : { ...page, messages };
  });
  return { ...data, pages };
}

/** Odczyt uczestnika z ramki `read` - nowa chwila w miejsce starej, na pierwszej stronie. */
export function withRead(data: ThreadData | undefined, pilotId: string, at: string): ThreadData | undefined {
  if (data == null || data.pages.length === 0) return data;
  const [first, ...rest] = data.pages;
  const participants = first!.participants.some((p) => p.pilotId === pilotId)
    ? first!.participants.map((p) => (p.pilotId === pilotId ? { ...p, lastReadAt: at } : p))
    : [...first!.participants, { pilotId, lastReadAt: at }];
  return { ...data, pages: [{ ...first!, participants }, ...rest] };
}

/**
 * Cała pobrana rozmowa jako jedna strona: rola, stan i odczyty z najświeższej (pierwszej),
 * wiadomości ze wszystkich - bez powtórzeń, od najnowszej. `null` = nic jeszcze nie przyszło.
 */
export function threadPage(data: ThreadData | undefined): Omit<ThreadPageDto, 'next'> | null {
  const first = data?.pages[0];
  if (data == null || first == null) return null;
  const byId = new Map<string, ThreadMessageDto>();
  for (const page of data.pages) for (const m of page.messages) if (!byId.has(m.id)) byId.set(m.id, m);
  const messages = [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
  );
  return { role: first.role, closed: first.closed, threadId: first.threadId, participants: first.participants, messages };
}
