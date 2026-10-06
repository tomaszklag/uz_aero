/**
 * Ninerdeck - testy WSPÓLNYCH NAPISÓW ZLECEŃ (`logic/orderFormat.ts`; epik Z-C #247).
 *
 * Pod obserwacją: słownik foteli („Szuka załogi"), termin czasem klubu liczony od granic
 * doby, chwile w trzech długościach (dziś/wczoraj/jutro/data) i plan lotu jednym wierszem.
 */

import {
  ANSWER,
  HISTORY,
  LONG,
  momentLabel,
  orderCountdown,
  orderDate,
  orderDay,
  orderHours,
  orderLength,
  orderSpan,
  personLabel,
  planLine,
  routeCodes,
  seatAccusative,
  seatGenitive,
  seekingLabel,
  SHORT,
} from '../ui/screens/logic/orderFormat';
import { localMs, nameOf, SATURDAY } from './support/orderFixtures';

const day = orderDay(SATURDAY)!;

describe('fotele', () => {
  it('„Szuka …" - jeden fotel w dopełniaczu, dwa to załoga, zero to komplet', () => {
    expect(seekingLabel(['pic'])).toBe('Szuka dowódcy');
    expect(seekingLabel(['dual'])).toBe('Szuka drugiego pilota');
    expect(seekingLabel(['pic', 'dual'])).toBe('Szuka załogi');
    expect(seekingLabel([])).toBeNull();
  });

  it('odmiana fotela w zdaniu', () => {
    expect(seatGenitive('dual')).toBe('drugiego pilota');
    expect(seatAccusative('pic')).toBe('dowódcę');
  });
});

describe('termin czasem klubu', () => {
  it('doba z dniem tygodnia i godziny odejmowaniem od jej granic', () => {
    expect(orderDate(day)).toBe('Sobota · 3 października');
    expect(orderHours(localMs(0, '09:00'), localMs(0, '13:00'), day)).toBe('09:00 → 13:00');
    expect(orderSpan(localMs(0, '09:00'), localMs(0, '11:00'), day)).toBe('09:00-11:00');
    expect(orderLength(localMs(0, '09:00'), localMs(0, '13:00'))).toBe('4 h');
  });

  it('godzina spoza doby liczy się na dobie przesuniętej - piątek wieczór i niedziela rano', () => {
    expect(orderSpan(localMs(-1, '18:00'), localMs(-1, '20:30'), day)).toBe('18:00-20:30');
    expect(orderHours(localMs(1, '10:00'), localMs(1, '11:30'), day)).toBe('10:00 → 11:30');
  });

  it('odliczanie do początku; trwający termin to „TRWA", miniony - nic', () => {
    expect(orderCountdown(localMs(0, '09:00'), localMs(0, '13:00'), localMs(-1, '21:48'))).toBe('ZA 11 H 12 MIN');
    expect(orderCountdown(localMs(0, '09:00'), localMs(0, '13:00'), localMs(-1, '07:00'))).toBe('ZA 1 DZIEŃ 2 H');
    expect(orderCountdown(localMs(0, '09:00'), localMs(0, '13:00'), localMs(0, '10:00'))).toBe('TRWA');
    expect(orderCountdown(localMs(0, '09:00'), localMs(0, '13:00'), localMs(0, '14:00'))).toBeNull();
  });
});

describe('chwile względem „teraz"', () => {
  const now = localMs(0, '07:31');

  it('dziś: sam zegar w wierszach gęstych, „dziś" na karcie i w historii', () => {
    expect(momentLabel(localMs(0, '07:10'), day, now, SHORT)).toBe('07:10');
    expect(momentLabel(localMs(0, '07:10'), day, now, ANSWER)).toBe('07:10');
    expect(momentLabel(localMs(0, '07:10'), day, now, LONG)).toBe('dziś 07:10');
    expect(momentLabel(localMs(0, '07:10'), day, now, HISTORY)).toBe('dziś 07:10');
  });

  it('wczoraj: „wcz." w wierszach gęstych, „wczoraj" na karcie', () => {
    expect(momentLabel(localMs(-1, '19:10'), day, now, SHORT)).toBe('wcz. 19:10');
    expect(momentLabel(localMs(-1, '18:40'), day, now, LONG)).toBe('wczoraj 18:40');
    expect(momentLabel(localMs(-1, '19:14'), day, now, ANSWER)).toBe('wczoraj 19:14');
  });

  it('jutro i dalej - doba klubu, nie doba UTC', () => {
    expect(momentLabel(localMs(1, '09:00'), day, now, LONG)).toBe('jutro 09:00');
    // 00:30 w sobotę to w UTC jeszcze piątek - dzień liczy się czasem klubu.
    expect(momentLabel(localMs(0, '00:30'), day, now, LONG)).toBe('dziś 00:30');
    expect(momentLabel(localMs(-6, '08:00'), day, now, SHORT)).toBe('27 WRZ 08:00');
  });
});

describe('trasa, plan i osoba', () => {
  it('trasa kodami - skoki jednym lotniskiem', () => {
    expect(routeCodes('EPKK', 'EPRJ')).toBe('EPKK → EPRJ');
    expect(routeCodes('EPKP', 'EPKP')).toBe('EPKP');
    expect(routeCodes(null, 'EPRJ')).toBe('EPRJ');
    expect(routeCodes(null, null)).toBeNull();
  });

  it('plan lotu jednym wierszem; bez planu - nic', () => {
    expect(planLine(90, 120)).toBe('1:30 · paliwo 120 L');
    expect(planLine(180, null)).toBe('3:00');
    expect(planLine(null, 600)).toBe('paliwo 600 L');
    expect(planLine(null, null)).toBeNull();
  });

  it('„Ty" dla patrzącego, nazwisko dla innych, kreska poza pamięcią klubu - nigdy identyfikator', () => {
    expect(personLabel('AKO', 'AKO', nameOf)).toBe('Ty');
    expect(personLabel('MZI', 'AKO', nameOf)).toBe('Marta Zięba');
    expect(personLabel('uuid-spoza', 'AKO', nameOf)).toBe('—');
    expect(personLabel(null, 'AKO', nameOf)).toBe('—');
  });
});
