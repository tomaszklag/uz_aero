import { describe, expect, it } from 'vitest';

import { liveUrl } from './liveUrl';

describe('adres kanału klubu', () => {
  it('ten sam host co panel; pod HTTPS `wss:`', () => {
    expect(liveUrl({ protocol: 'https:', host: 'app.ninerdeck.pl' })).toBe('wss://app.ninerdeck.pl/admin/api/live');
    expect(liveUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/admin/api/live');
  });
});
