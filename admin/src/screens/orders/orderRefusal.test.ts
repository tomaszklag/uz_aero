import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { orderErrorMessage, orderRefusalOf, threadErrorMessage } from './orderRefusal';

const odmowa = (status: number, body: unknown): HttpError => new HttpError(status, body as never);
const person = () => null;

describe('odmowa reguły zlecenia', () => {
  it('kod z ciała odpowiedzi - wyłącznie znany', () => {
    expect(orderRefusalOf(odmowa(409, { error: 'seat_filled' }))).toBe('seat_filled');
    expect(orderRefusalOf(odmowa(409, { error: 'slot_taken' }))).toBeNull();
    expect(orderRefusalOf(new Error('sieć'))).toBeNull();
  });

  it('obsadzony fotel jest odpowiedzią o stanie, nie awarią', () => {
    expect(orderErrorMessage(odmowa(409, { error: 'seat_filled' }), 'Europe/Warsaw', person)).toBe(
      'Ten fotel jest już obsadzony - ktoś wybrał przed chwilą.',
    );
  });

  it('odmowa terminu idzie zdaniem rezerwacji - zlecenie JEST rezerwacją', () => {
    expect(orderErrorMessage(odmowa(400, { error: 'booking_in_past' }), 'Europe/Warsaw', person)).not.toMatch(/booking_in_past/);
  });
});

describe('wiadomość w rozmowie, która nie wyszła', () => {
  it('brak połączenia mówi, że tekst zostaje w polu', () => {
    expect(threadErrorMessage(new TypeError('Failed to fetch'))).toBe('Brak połączenia - wiadomość nie wyszła i zostaje w polu.');
  });

  it('rozmowa zamknięta pod palcem - zdanie, nie kod', () => {
    expect(threadErrorMessage(odmowa(409, { error: 'thread_closed' }))).toBe('Ta rozmowa jest już zamknięta - zostaje do odczytu.');
    expect(threadErrorMessage(odmowa(400, { error: 'message_invalid' }))).toBe('Wiadomość jest pusta albo za długa.');
  });

  it('reszta - zdaniem zapisu', () => {
    expect(threadErrorMessage(odmowa(404, { error: 'not_found' }))).not.toMatch(/not_found/);
  });
});
