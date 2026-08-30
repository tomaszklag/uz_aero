import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { conflictField, errorMessage, refusalOf } from './apiMessage';

const http = (status: number, body: Record<string, unknown>): HttpError =>
  new HttpError(status, body as never);

describe('rozpoznanie odmowy', () => {
  it('409 conflict oddaje POLE, które jest zajęte', () => {
    expect(conflictField(http(409, { error: 'conflict', field: 'code' }))).toBe('code');
    expect(conflictField(http(409, { error: 'conflict', field: 'reg' }))).toBe('reg');
  });

  it('409 refused oddaje POWOD reguły', () => {
    expect(refusalOf(http(409, { error: 'refused', reason: 'last_admin' }))).toBe('last_admin');
  });

  it('nie myli obu odmów ze sobą', () => {
    expect(refusalOf(http(409, { error: 'conflict', field: 'code' }))).toBeNull();
    expect(conflictField(http(409, { error: 'refused', reason: 'last_admin' }))).toBeNull();
  });

  it('awaria sieci nie jest żadną z nich', () => {
    const offline = new TypeError('Failed to fetch');
    expect(conflictField(offline)).toBeNull();
    expect(refusalOf(offline)).toBeNull();
  });
});

describe('zdanie dla człowieka', () => {
  it('brak sieci i odpowiedź serwera to DWA różne zdania', () => {
    // `fetch` rzuca `TypeError` bez statusu - „kod 0" byłby wymysłem panelu.
    expect(errorMessage(new TypeError('Failed to fetch'))).toContain('Nie ma połączenia');
    expect(errorMessage(http(500, { error: 'oops' }))).not.toContain('Nie ma połączenia');
  });

  it('401 prowadzi do logowania, a nie do „popraw pola"', () => {
    expect(errorMessage(http(401, { error: 'unauthorized' }))).toContain('Zaloguj się');
  });

  it('nieznana awaria niesie KOD - jedyną rzecz, którą da się przekazać dalej', () => {
    expect(errorMessage(http(503, { error: 'unavailable' }))).toContain('503');
  });

  it('„nic się nie zmieniło" nie brzmi jak awaria', () => {
    expect(errorMessage(http(400, { error: 'no_changes' }))).toBe('Nic się nie zmieniło.');
  });
});
