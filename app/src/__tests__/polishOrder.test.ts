/**
 * Ninerdeck - testy POLSKIEJ KOLEJNOŚCI ALFABETYCZNEJ (`logic/polishOrder.ts`; epik Z-C #247).
 *
 * Pod obserwacją: polskie litery stoją po swoich łacińskich odpowiednikach (Ł po L, Ś po S,
 * Ż na końcu), lista osób idzie po nazwisku, a imię rozstrzyga tylko przy równych nazwiskach.
 */

import { bySurname, comparePolish, surnameOf } from '../ui/screens/logic/polishOrder';

describe('polska kolejność', () => {
  it('Ł po L, Ś po S, Ż za Z - nie w kolejności punktów kodowych', () => {
    const sorted = ['Żak', 'Zieleń', 'Łukasiewicz', 'Lis', 'Śliwa', 'Sowa', 'Ćwik', 'Cichy'].sort(comparePolish);
    expect(sorted).toEqual(['Cichy', 'Ćwik', 'Lis', 'Łukasiewicz', 'Sowa', 'Śliwa', 'Zieleń', 'Żak']);
  });

  it('wielkość liter nie ma znaczenia; krótszy przedrostek idzie pierwszy', () => {
    expect(comparePolish('kowal', 'Kowal')).toBe(0);
    expect(comparePolish('Kowal', 'Kowalski')).toBeLessThan(0);
  });

  it('osoby po nazwisku - kolejność z makiety 31C', () => {
    const people = ['Jakub Wrona', 'Paweł Wilk', 'Ewa Sowa', 'Barbara Nowak', 'Piotr Lis', 'Adam Kowalski', 'Anna Kowal'];
    expect([...people].sort(bySurname)).toEqual([
      'Anna Kowal',
      'Adam Kowalski',
      'Piotr Lis',
      'Barbara Nowak',
      'Ewa Sowa',
      'Paweł Wilk',
      'Jakub Wrona',
    ]);
  });

  it('równe nazwiska rozstrzyga imię', () => {
    expect(['Zofia Nowak', 'Barbara Nowak'].sort(bySurname)).toEqual(['Barbara Nowak', 'Zofia Nowak']);
    expect(surnameOf('  Anna   Kowal ')).toBe('Kowal');
  });
});
