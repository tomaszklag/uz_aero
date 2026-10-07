import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { orderErrorMessage, orderRefusalOf } from './orderRefusal';

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
