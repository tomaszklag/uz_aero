/**
 * Ninerdeck - panel: odmowy ścieżki akceptacji jako zdania (issue #165).
 */

import { describe, expect, it } from 'vitest';

import type { ApiErrorDto } from '../../api/dto';
import { HttpError } from '../../api/httpClient';
import { decisionErrorMessage, stepsErrorMessage } from './approvalRefusal';

const http = (status: number, body: Record<string, unknown>): HttpError => new HttpError(status, body as unknown as ApiErrorDto);

describe('odmowy decyzji', () => {
  it('kod z serwera dostaje zdanie, reszta schodzi na komunikat ogólny', () => {
    expect(decisionErrorMessage(http(403, { error: 'not_your_step' }))).toContain('nie jest Twój krok');
    expect(decisionErrorMessage(http(400, { error: 'reason_required' }))).toContain('Podaj powód');
    expect(decisionErrorMessage(http(409, { error: 'booking_closed' }))).toContain('przed chwilą');
    expect(decisionErrorMessage(new TypeError('sieć'))).toBe('Nie ma połączenia z serwerem. Spróbuj za chwilę.');
  });
});

describe('odmowy zapisu ścieżki', () => {
  it('niosą NAZWĘ kroku z odpowiedzi', () => {
    expect(stepsErrorMessage(http(400, { error: 'step_without_members', stepLabel: 'Szef wyszkolenia' }))).toBe(
      'Krok „Szef wyszkolenia" nie ma ani jednej osoby - wskaż kogoś, kto go zatwierdzi.',
    );
    expect(stepsErrorMessage(http(400, { error: 'member_not_in_org', stepLabel: 'Mechanik' }))).toContain(
      'Mechanik',
    );
    expect(stepsErrorMessage(http(500, { error: 'boom' }))).toContain('kod 500');
  });
});
