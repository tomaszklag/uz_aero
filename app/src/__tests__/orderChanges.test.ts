/**
 * Ninerdeck - testy PRZEKŁADU ZMIAN ZLECENIA (`logic/orderChanges.ts`; epik Z-C #247).
 *
 * Serwer oddaje surowe klucze z wartościami przed i po; ten sam przekład czyta linijka
 * „Edytowane · co" u adresata i historia zmian u prowadzącego. Pod obserwacją: każdy
 * klucz, stała kolejność, pomijanie terminu (adresat ma na niego własną linijkę), klucz
 * nieznany i zepsuty bez zdania.
 */

import { capitalized, changesParts, termSpan, type ChangePart } from '../ui/screens/logic/orderChanges';
import { orderDay } from '../ui/screens/logic/orderFormat';
import { local, regOf, SATURDAY } from './support/orderFixtures';

const ctx = { day: orderDay(SATURDAY)!, regOf };
const flat = (parts: readonly ChangePart[]): string => parts.map((p) => (p.strong ? `[${p.text}]` : p.text)).join('');

describe('zmiany zlecenia po polsku', () => {
  it('plan lotu - nazwa pogrubiona, wartości przed i po (makieta 28A)', () => {
    expect(flat(changesParts({ plannedAirMin: { from: 120, to: 180 } }, ctx))).toBe('[plan lotu] 2:00 → 3:00');
  });

  it('każdy klucz w stałej kolejności, połączone kropką', () => {
    const changes = {
      note: { from: null, to: 'Zabierz kamizelki' },
      aircraft: { from: 'ac-axa', to: 'ac-bkl' },
      plannedFuelL: { from: 120, to: 150 },
      operation: { from: 'ferry', to: 'skoki' },
      route: { from: { fromIcao: 'EPKK', toIcao: 'EPRJ' }, to: { fromIcao: 'EPKP', toIcao: 'EPKP' } },
      seats: { from: { pic: 'sought', dual: 'sought' }, to: { pic: 'sought', dual: 'none' } },
    };
    expect(flat(changesParts(changes, ctx))).toBe(
      '[maszyna] SP-AXA → SP-BKL · [zadanie] Przelot → Skoki · [trasa] EPKK-EPRJ → EPKP · ' +
        '[paliwo] 120 L → 150 L · [opis] · [drugi pilot] szukany → brak',
    );
  });

  it('termin - godziny czasem klubu; adresat może go pominąć, bo mówi o nim osobno', () => {
    const changes = {
      term: {
        from: { startsAt: local(0, '09:00'), endsAt: local(0, '11:00') },
        to: { startsAt: local(0, '10:00'), endsAt: local(0, '12:00') },
      },
      plannedAirMin: { from: 90, to: 120 },
    };
    expect(flat(changesParts(changes, ctx))).toBe('[termin] 09:00-11:00 → 10:00-12:00 · [plan lotu] 1:30 → 2:00');
    expect(flat(changesParts(changes, ctx, ['term']))).toBe('[plan lotu] 1:30 → 2:00');
    expect(termSpan(changes.term.from, ctx.day)).toBe('09:00-11:00');
  });

  it('fotel „ja" to osoba zlecająca - bez formy z płcią', () => {
    const seats = { seats: { from: { pic: 'sought', dual: 'none' }, to: { pic: 'self', dual: 'sought' } } };
    expect(flat(changesParts(seats, ctx))).toBe('[dowódca] szukany → osoba zlecająca · [drugi pilot] brak → szukany');
  });

  it('brak wartości to kreska; maszyna spoza floty też - nigdy identyfikator', () => {
    expect(flat(changesParts({ plannedAirMin: { from: null, to: 60 } }, ctx))).toBe('[plan lotu] — → 1:00');
    expect(flat(changesParts({ aircraft: { from: 'ac-axa', to: 'uuid-spoza' } }, ctx))).toBe('[maszyna] SP-AXA → —');
  });

  it('klucz nieznany i wartość zepsuta nie dostają zdania', () => {
    expect(changesParts({ cosNowego: { from: 1, to: 2 } }, ctx)).toEqual([]);
    expect(changesParts({ term: { from: 'wczoraj', to: null } }, ctx)).toEqual([]);
    expect(changesParts({ plannedAirMin: 7 }, ctx)).toEqual([]);
  });

  it('tytuł wpisu historii zaczyna się wielką literą', () => {
    expect(flat(capitalized(changesParts({ plannedAirMin: { from: 120, to: 180 } }, ctx)))).toBe('[Plan lotu] 2:00 → 3:00');
    expect(capitalized([])).toEqual([]);
  });
});
