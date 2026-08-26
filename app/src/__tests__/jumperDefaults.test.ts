import {
  jumperDefaultsLabel,
  normalizeJumperDefaults,
} from '../ui/screens/logic/jumperDefaults';

describe('normalizeJumperDefaults', () => {
  it('suma zero to brak deklaracji, nie zero skoczków', () => {
    expect(normalizeJumperDefaults({ tandem: 0, aff: 0, solo: 0 })).toBeNull();
  });

  it('choćby jeden skoczek zostaje deklaracją', () => {
    expect(normalizeJumperDefaults({ tandem: 1, aff: 0, solo: 0 })).toEqual({
      tandem: 1,
      aff: 0,
      solo: 0,
    });
  });
});

describe('jumperDefaultsLabel', () => {
  it('brak defaultu', () => {
    expect(jumperDefaultsLabel(null)).toBe('Bez ustawionego składu');
  });

  it('wypisuje wyłącznie niezerowe pozycje', () => {
    expect(jumperDefaultsLabel({ tandem: 4, aff: 0, solo: 2 })).toBe('4 tandem · 2 solo');
  });
});
