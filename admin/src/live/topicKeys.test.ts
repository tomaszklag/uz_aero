import { describe, expect, it } from 'vitest';

import { keys } from '../queries/keys';
import { prefixesForTopics } from './topicKeys';

describe('temat kanału → klucze zapytań', () => {
  it('kalendarz, zajętość, karta samolotu', () => {
    expect(prefixesForTopics(['calendar:2026-10-03'])).toEqual([keys.calendar.all]);
    expect(prefixesForTopics(['booking:b1'])).toEqual([keys.calendar.detail('b1'), keys.approvals.all]);
    expect(prefixesForTopics(['aircraft:SP-AXA'])).toEqual([keys.account.watches]);
  });

  it('dziennik i „Do sprawdzenia"', () => {
    expect(prefixesForTopics(['log:2026-10-01'])).toEqual([
      ['log', 'fleet'],
      ['log', 'pilots'],
      ['log', 'sessions'],
    ]);
    expect(prefixesForTopics(['session:s1'])).toEqual([
      keys.log.session('s1'),
      ['log', 'preview', 's1'],
      keys.exports.history('s1'),
      keys.exports.sheet('s1'),
    ]);
    expect(prefixesForTopics(['attention'])).toEqual([keys.attention, keys.flags.all, keys.exports.all]);
  });

  it('klucze unieważniają PREFIKSEM to, co pokazują ekrany', () => {
    // `invalidateQueries` dopasowuje prefiksem - prefiks dziennika musi być początkiem
    // klucza listy, inaczej sygnał odświeżałby nic.
    const fleet = keys.log.fleet({ from: '2026-10-01', to: '2026-10-07' } as Parameters<typeof keys.log.fleet>[0]);
    expect(fleet.slice(0, 2)).toEqual(prefixesForTopics(['log:2026-10-01'])[0]);
    const preview = keys.log.preview('s1', { kind: 'retime' });
    expect(preview.slice(0, 3)).toEqual(prefixesForTopics(['session:s1'])[1]);
  });

  it('jedna ramka - klucze bez powtórzeń', () => {
    expect(prefixesForTopics(['calendar:2026-10-03', 'calendar:2026-10-04', 'booking:b1'])).toEqual([
      keys.calendar.all,
      keys.calendar.detail('b1'),
      keys.approvals.all,
    ]);
  });

  it('tematy zleceń i nieznane nie odświeżają niczego - Z-D dopisze swoje klucze', () => {
    expect(prefixesForTopics(['order:o1', 'orders', 'cos:nowego', 'booking:'])).toEqual([]);
  });
});
