import { describe, expect, it, vi, afterEach } from 'vitest';

import { clubTimeZones } from './timeZones';

const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('strefy czasu na karcie klubu', () => {
  it('bierze katalog z przeglądarki, a nie własną tablicę', () => {
    vi.spyOn(intl, 'supportedValuesOf').mockReturnValue(['Europe/Warsaw', 'Europe/Berlin']);

    expect(clubTimeZones('Europe/Warsaw')).toEqual(['Europe/Warsaw', 'Europe/Berlin']);
  });

  it('dokleja strefę klubu, której ta przeglądarka nie zna', () => {
    // Bez tego `<select>` pokazałby PIERWSZĄ pozycję listy, a zapis cicho przestawiłby
    // klubowi konfigurację, której nikt nie tykał.
    vi.spyOn(intl, 'supportedValuesOf').mockReturnValue(['Europe/Warsaw']);

    expect(clubTimeZones('Pacific/Kanton')).toEqual(['Pacific/Kanton', 'Europe/Warsaw']);
  });

  it('pusta strefa niczego nie dokłada - to formularz zakładania, który o nią nie pyta', () => {
    vi.spyOn(intl, 'supportedValuesOf').mockReturnValue(['Europe/Warsaw']);

    expect(clubTimeZones('')).toEqual(['Europe/Warsaw']);
  });

  it('przeglądarka bez katalogu dostaje listę awaryjną, a nie pustą', () => {
    vi.spyOn(intl, 'supportedValuesOf').mockImplementation(() => {
      throw new Error('brak ICU');
    });

    expect(clubTimeZones('Europe/Warsaw')).toContain('Europe/Warsaw');
  });
});
