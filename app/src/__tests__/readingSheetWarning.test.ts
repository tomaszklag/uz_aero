/**
 * UZ Aero - testy ostrzeżeń w arkuszu odczytu (uwaga z urządzenia, 2026-08-29).
 *
 * Zgłoszenie prosiło o dwie rzeczy naraz: sufit zbiornika i rozjazd z poprzednikiem -
 * i obie miały paść PRZY POLU, nie w podsumowaniu kroku 4. Test pilnuje treści zdań
 * (pilot ma z nich wiedzieć, co zrobić) oraz granicy „ostrzega, nigdy nie blokuje".
 */

import {
  fuelSheetWarning,
  mhSheetWarning,
  type FuelSheetContext,
  type MhSheetContext,
} from '../ui/screens/logic/readingSheetWarning';
import type { RemoteReadingsChain } from '../application';

const chain: RemoteReadingsChain = {
  before: {
    sessionUuid: 'rano',
    picId: 'ako',
    at: Date.UTC(2026, 7, 16, 9, 0),
    fuelL: 140,
    mh: 1232,
  },
  after: {
    sessionUuid: 'wieczor',
    picId: 'jkw',
    at: Date.UTC(2026, 7, 16, 15, 0),
    fuelL: 96,
    mh: 1240,
  },
  oil: null,
};

const fuelCtx = (over: Partial<FuelSheetContext> = {}): FuelSheetContext => ({
  capacityL: 330,
  chain,
  foundL: 140,
  addedL: 0,
  ...over,
});

const mhCtx = (over: Partial<MhSheetContext> = {}): MhSheetContext => ({
  format: 'decimal',
  chain,
  beforeMh: 1232,
  ...over,
});

describe('fuelSheetWarning - sufit zbiornika', () => {
  it('odczyt ponad pojemność mówi OBIE liczby', () => {
    const w = fuelSheetWarning('found', 340, fuelCtx());
    expect(w).toContain('340 L');
    expect(w).toContain('330 L');
  });

  it('dolewka liczy się RAZEM z zastanym - sama w sobie zbiornika nie przekracza', () => {
    // 300 L dolewki to nie jest „300 L w zbiorniku": pytanie brzmi, ile wyjdzie po dolaniu.
    expect(fuelSheetWarning('added', 300, fuelCtx({ foundL: 100 }))).toContain('400 L');
    expect(fuelSheetWarning('added', 100, fuelCtx({ foundL: 100 }))).toBeNull();
  });

  it('bez znanej pojemności sufit MILCZY - tak samo jak `checkCapacity` w domenie', () => {
    expect(fuelSheetWarning('found', 9000, fuelCtx({ capacityL: null, chain: null }))).toBeNull();
  });
});

describe('fuelSheetWarning - ciągłość z poprzednikiem', () => {
  it('mniej niż zdał poprzednik OSTRZEGA i podaje, kto zdawał', () => {
    // Sedno zgłoszenia: „warning, jeśli wpiszę mniejszą wartość w Paliwo zastane niż
    // wynika to ze zdania samolotu przez poprzednika".
    const w = fuelSheetWarning('found', 100, fuelCtx());
    expect(w).toContain('AKO');
    expect(w).toContain('140 L');
    expect(w).toContain('100 L');
  });

  it('WIĘCEJ też ostrzega - paliwo nie przybywa samo', () => {
    expect(fuelSheetWarning('found', 200, fuelCtx())).toContain('tankował poza aplikacją');
  });

  it('różnica w granicach podziałki paliwomierza MILCZY', () => {
    // Ostrzeżenie o 2 L byłoby fałszywym alarmem przy każdej normalnej sesji.
    expect(fuelSheetWarning('found', 145, fuelCtx())).toBeNull();
  });

  it('pole „po locie" porównuje się z NASTĘPNYM pilotem, nie z poprzednim', () => {
    expect(fuelSheetWarning('after', 60, fuelCtx({ addedL: 0, foundL: 140 }))).toContain('JKW');
  });

  it('bez łańcucha ekran o ciągłości milczy - offline nie jest błędem', () => {
    expect(fuelSheetWarning('found', 10, fuelCtx({ chain: null }))).toBeNull();
    expect(fuelSheetWarning('found', 10, fuelCtx({ chain: undefined }))).toBeNull();
  });
});

describe('fuelSheetWarning - ile mogło zostać po locie', () => {
  it('więcej niż zastane + dolane jest niemożliwe i zdanie podaje rachunek', () => {
    const w = fuelSheetWarning('after', 200, fuelCtx({ foundL: 100, addedL: 48, chain: null }));
    expect(w).toContain('148 L');
    expect(w).toContain('100 L');
    expect(w).toContain('48 L');
  });

  it('sufit zbiornika ma PIERWSZEŃSTWO - najpierw to, co fizycznie niemożliwe', () => {
    const w = fuelSheetWarning('after', 400, fuelCtx({ foundL: 100, addedL: 48, chain: null }));
    expect(w).toContain('pojemność zbiorników');
  });
});

describe('mhSheetWarning', () => {
  it('cofnięty licznik mówi, od czego bieg się zaczął', () => {
    expect(mhSheetWarning('after', 1231, mhCtx({ chain: null }))).toContain('1232');
  });

  it('rozjazd z poprzednikiem podaje jego odczyt i kto go zostawił', () => {
    const w = mhSheetWarning('before', 1230, mhCtx());
    expect(w).toContain('AKO');
    expect(w).toContain('1232');
  });

  it('różnica w granicach podziałki licznika MILCZY', () => {
    expect(mhSheetWarning('before', 1232.05, mhCtx())).toBeNull();
  });

  it('bez łańcucha i bez stanu przed - milczy', () => {
    expect(mhSheetWarning('before', 999, mhCtx({ chain: null, beforeMh: null }))).toBeNull();
  });
});
