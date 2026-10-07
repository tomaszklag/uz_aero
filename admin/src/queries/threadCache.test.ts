import { describe, expect, it } from 'vitest';

import type { ThreadMessageDto, ThreadPageDto } from '../api/dto';
import { asThreadMessage, threadPage, withMessage, withRead, type ThreadData } from './threadCache';

function message(id: string, at: string, authorId = 'mzi'): ThreadMessageDto {
  return { id, authorId, body: `treść ${id}`, createdAt: at };
}

function page(messages: ThreadMessageDto[], over: Partial<ThreadPageDto> = {}): ThreadPageDto {
  return {
    role: 'participant',
    closed: null,
    threadId: 't1',
    participants: [
      { pilotId: 'mzi', lastReadAt: null },
      { pilotId: 'ako', lastReadAt: null },
    ],
    messages,
    next: null,
    ...over,
  };
}

function data(...pages: ThreadPageDto[]): ThreadData {
  return { pages, pageParams: pages.map((_, i) => (i === 0 ? null : { beforeAt: 'x', beforeId: `c${i}` })) };
}

describe('wiadomość z ramki kanału', () => {
  it('kształt wiadomości przechodzi bez pól obcych; inny kształt to nie wiadomość', () => {
    expect(asThreadMessage({ id: 'm1', threadId: 't1', authorId: 'ako', body: 'Mogę od 10', createdAt: '2026-10-02T17:10:00.000Z' })).toEqual({
      id: 'm1',
      authorId: 'ako',
      body: 'Mogę od 10',
      createdAt: '2026-10-02T17:10:00.000Z',
    });
    expect(asThreadMessage({ id: 'm1', authorId: 'ako' })).toBeNull();
    expect(asThreadMessage(null)).toBeNull();
    expect(asThreadMessage(['m1'])).toBeNull();
  });
});

describe('nowa wiadomość w pamięci rozmowy', () => {
  it('staje na górze pierwszej strony', () => {
    const before = data(page([message('m2', '2026-10-02T17:12:00.000Z')]));
    const after = withMessage(before, message('m3', '2026-10-03T05:31:00.000Z'));
    expect(after?.pages[0]?.messages.map((m) => m.id)).toEqual(['m3', 'm2']);
  });

  it('ta sama wiadomość drugą drogą (ramka i odpowiedź na wysyłkę) nie staje dwa razy', () => {
    const before = data(page([message('m3', '2026-10-03T05:31:00.000Z')]), page([message('m1', '2026-10-02T17:02:00.000Z')]));
    const after = withMessage(withMessage(before, message('m4', '2026-10-03T05:40:00.000Z')), message('m4', '2026-10-03T05:40:00.000Z'));
    expect(after?.pages.flatMap((p) => p.messages.map((m) => m.id))).toEqual(['m4', 'm3', 'm1']);
  });

  it('rozmowa jeszcze niepobrana zostaje bez zmian - przeczyta się w całości przy otwarciu', () => {
    expect(withMessage(undefined, message('m1', '2026-10-02T17:02:00.000Z'))).toBeUndefined();
  });
});

describe('odczyt drugiej strony z ramki `read`', () => {
  it('nowa chwila w miejsce starej', () => {
    const after = withRead(data(page([])), 'mzi', '2026-10-03T05:41:00.000Z');
    expect(after?.pages[0]?.participants).toEqual([
      { pilotId: 'mzi', lastReadAt: '2026-10-03T05:41:00.000Z' },
      { pilotId: 'ako', lastReadAt: null },
    ]);
  });

  it('uczestnik spoza listy dochodzi do niej', () => {
    const after = withRead(data(page([], { participants: [] })), 'ako', '2026-10-03T05:41:00.000Z');
    expect(after?.pages[0]?.participants).toEqual([{ pilotId: 'ako', lastReadAt: '2026-10-03T05:41:00.000Z' }]);
  });
});

describe('cała pobrana rozmowa', () => {
  it('wiadomości ze wszystkich stron, bez powtórzeń, od najnowszej; stan z pierwszej strony', () => {
    const merged = threadPage(
      data(
        page([message('m3', '2026-10-03T05:31:00.000Z'), message('m2', '2026-10-02T17:12:00.000Z')], { closed: 'thread_closed' }),
        page([message('m2', '2026-10-02T17:12:00.000Z'), message('m1', '2026-10-02T17:02:00.000Z')], { closed: null }),
      ),
    );
    expect(merged?.messages.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
    expect(merged?.closed).toBe('thread_closed');
  });

  it('wiadomości tej samej chwili mają stały porządek', () => {
    const at = '2026-10-03T05:31:00.000Z';
    const merged = threadPage(data(page([message('a', at), message('b', at)])));
    expect(merged?.messages.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('nic jeszcze nie przyszło', () => {
    expect(threadPage(undefined)).toBeNull();
  });
});
