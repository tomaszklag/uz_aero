import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { conflictField, errorMessage, refusalOf, ruleViolationMessage } from './apiMessage';

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

describe('odmowa reguł rejestru (422)', () => {
  it('oddaje zdanie DOMENY, a nie własne tłumaczenie kodu', () => {
    const refused = http(422, {
      error: 'rule_violation',
      violations: [{ code: 'SESSION_ALREADY_VOIDED', message: 'Ta sesja jest już unieważniona.' }],
    });
    expect(ruleViolationMessage(refused)).toBe('Ta sesja jest już unieważniona.');
  });

  it('kilka naruszeń jedzie razem - żadne nie ginie po drodze', () => {
    const refused = http(422, {
      error: 'rule_violation',
      violations: [
        { code: 'A', message: 'Pierwsze zdanie.' },
        { code: 'B', message: 'Drugie zdanie.' },
      ],
    });
    expect(ruleViolationMessage(refused)).toBe('Pierwsze zdanie. Drugie zdanie.');
  });

  it('inna odmowa i pusta lista → null, więc ekran schodzi na zdanie ogólne', () => {
    // Serwer bez ani jednego naruszenia w ciele nie dałby czego pokazać, a pusty
    // baner nad formularzem czyta się jak usterka.
    expect(ruleViolationMessage(http(422, { error: 'rule_violation', violations: [] }))).toBeNull();
    expect(ruleViolationMessage(http(409, { error: 'refused', reason: 'last_admin' }))).toBeNull();
    expect(ruleViolationMessage(new TypeError('Failed to fetch'))).toBeNull();
  });
});
