/**
 * Ninerdeck (serwer) - TREŚCI WIADOMOŚCI ZLECEŃ dla skrzynki 25D (4.0.0, issue #247).
 *
 * Wiersz skrzynki potrzebuje więcej niż budzik: fotelu, o który pytamy, trasy w podpisie,
 * zdania „Odpowiedz na nowy termin" tylko tam, gdzie odpowiedź się wyzerowała, i początku
 * ostatniej wiadomości w rozmowie. Wszystko to zostaje W SKRZYNCE - push dalej wozi same
 * identyfikatory (`PUSH_DATA_KEYS`, issue #228).
 */

import { describe, expect, it } from 'vitest';

import {
  MESSAGE_PREVIEW_MAX,
  messagePreview,
  orderChanged,
  orderMessage,
  orderOffered,
  type NoticeOrder,
} from '../src/application/common/notify/orderNotices.ts';
import { pushData } from '../src/application/common/notify/pushData.ts';

const ORDER: NoticeOrder = {
  id: 'o-1',
  bookingId: 'b-1',
  aircraftId: 'SP-AXA',
  startsAt: Date.UTC(2026, 9, 3, 8),
  endsAt: Date.UTC(2026, 9, 3, 10),
  operation: 'przelot',
  fromIcao: 'EPKK',
  toIcao: 'EPRJ',
  createdBy: 'MZI',
};

describe('podgląd ostatniej wiadomości', () => {
  it('krótka wiadomość jedzie w całości, bez spacji na brzegach', () => {
    expect(messagePreview('  Przesunęłam na 10:00-12:00.  ')).toBe('Przesunęłam na 10:00-12:00.');
  });

  it('długa ucina się z wielokropkiem i mieści w limicie', () => {
    const preview = messagePreview('a'.repeat(MESSAGE_PREVIEW_MAX + 50));
    expect(preview.length).toBe(MESSAGE_PREVIEW_MAX);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('treść skrzynki zostaje w skrzynce', () => {
  it('„Zlecenie lotu": fotel i trasa w payloadzie, w budziku same identyfikatory', () => {
    const [draft] = orderOffered(ORDER, [{ pilotId: 'AKO', seat: 'dual' }], false);
    expect(draft!.payload).toMatchObject({ seat: 'dual', fromIcao: 'EPKK', toIcao: 'EPRJ', reminder: false });
    expect(pushData('org', draft!)).toEqual({ kind: 'order_offered', orgId: 'org', bookingId: 'b-1', aircraftId: 'SP-AXA', orderId: 'o-1' });
  });

  it('„Wiadomość w zleceniu": początek wiadomości nie trafia do budzika', () => {
    const draft = orderMessage(ORDER, 'MZI', { threadId: 't-1', recipientId: 'AKO', authorId: 'AKO', unread: 1, body: 'Mogę o 14?' });
    expect(draft.payload).toMatchObject({ preview: 'Mogę o 14?', unread: 1 });
    expect(draft.payload).not.toHaveProperty('body');
    expect(pushData('org', draft)).not.toHaveProperty('preview');
  });

  it('„Odpowiedz od nowa" pada wyłącznie przy zmianie terminu, także gdy wołający poda inaczej', () => {
    const [moved] = orderChanged(ORDER, [{ pilotId: 'AKO', respond: true }], { term: { from: null, to: null } });
    expect(moved!.payload).toMatchObject({ term: true, respond: true });
    const [edited] = orderChanged(ORDER, [{ pilotId: 'AKO', respond: true }], { note: { from: null, to: 'x' } });
    expect(edited!.payload).toMatchObject({ term: false, respond: false });
  });
});
