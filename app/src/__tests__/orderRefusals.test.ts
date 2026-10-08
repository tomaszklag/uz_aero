/**
 * Ninerdeck - testy ZDAŃ ODMÓW ZLECENIA (`logic/orderRefusals.ts`; epik Z-C #247).
 *
 * Kod surowy z serwera ma zdanie mówiące, co dalej; kod nieznany temu wydaniu jedzie na
 * ekran w nawiasie, bo pilot przeczyta go administratorowi.
 */

import { DUAL_REQUIRED_REASON } from '../ui/screens/logic/dualRequirement';
import { orderRefusalText, threadRefusalText } from '../ui/screens/logic/orderRefusals';

describe('odmowy zlecenia', () => {
  it('kody serwera mają zdania - wymóg załogi tym samym zdaniem, co 02 i 15', () => {
    expect(orderRefusalText('seat_filled')).toBe('Ten fotel jest już obsadzony.');
    expect(orderRefusalText('booking_from_order')).toBe('Termin zmienia osoba zlecająca - edycją zlecenia.');
    expect(orderRefusalText('dual_required')).toBe(DUAL_REQUIRED_REASON);
  });

  it('kod nieznany jedzie w nawiasie - nie „coś poszło nie tak"', () => {
    expect(orderRefusalText('cos_nowego')).toBe('Nie udało się zapisać zlecenia - kod: cos_nowego.');
    expect(threadRefusalText('cos_nowego')).toBe('Nie udało się wysłać wiadomości - kod: cos_nowego.');
  });

  it('rozmowa: zamknięta i tylko do odczytu mówią, co zostaje', () => {
    expect(threadRefusalText('thread_closed')).toBe('Ta rozmowa jest już zamknięta - zostaje do odczytu.');
    expect(threadRefusalText('read_only')).toBe('Rozmowę prowadzi osoba zlecająca - możesz ją czytać.');
  });
});
