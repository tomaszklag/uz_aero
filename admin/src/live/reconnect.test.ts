import { describe, expect, it } from 'vitest';

import { reconnectDelay, RECONNECT_BASE_MS, RECONNECT_MAX_MS } from './reconnect';

describe('odstęp wznowienia kanału', () => {
  it('rośnie dwukrotnie z każdą nieudaną próbą, aż do sufitu', () => {
    const top = () => 1;
    expect(reconnectDelay(0, top)).toBe(RECONNECT_BASE_MS);
    expect(reconnectDelay(1, top)).toBe(2 * RECONNECT_BASE_MS);
    expect(reconnectDelay(3, top)).toBe(8 * RECONNECT_BASE_MS);
    expect(reconnectDelay(20, top)).toBe(RECONNECT_MAX_MS);
  });

  it('połowa stała, połowa losowa - karty po restarcie serwera nie wracają naraz', () => {
    expect(reconnectDelay(2, () => 0)).toBe(2 * RECONNECT_BASE_MS);
    expect(reconnectDelay(2, () => 0.5)).toBe(3 * RECONNECT_BASE_MS);
    expect(reconnectDelay(20, () => 0)).toBe(RECONNECT_MAX_MS / 2);
  });
});
