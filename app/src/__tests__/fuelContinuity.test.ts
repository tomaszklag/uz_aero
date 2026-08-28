/**
 * UZ Aero — test ciągłości paliwa w formularzu (issue #62, piąta tura).
 *
 * „Chodzi o to, aby była ciągłość w ilości paliwa" — a jednocześnie „nic nie może
 * blokować, to powinny być tylko ostrzeżenia wymagające reakcji". Test pilnuje obu
 * zdań naraz: rozjazd jest widoczny i nazwany, ale nie ma jak zatrzymać zapisu.
 */

import {
  fuelAfterReference,
  fuelBeforeReference,
  fuelContinuityWarnings,
} from '../ui/screens/logic/fuelContinuity';
import type { RemoteFuelChain } from '../application';

const chain: RemoteFuelChain = {
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
};

describe('wiersze odniesienia w arkuszu odczytu', () => {
  it('podają liczbę Z ŹRÓDŁEM — kto i kiedy', () => {
    // Zgłoszenie: „jeśli jest domyślna wartość, to należy wypisać, z czego ona wynika".
    const before = fuelBeforeReference(chain);
    expect(before!.value).toBe('140 L');
    expect(before!.label).toContain('Zostawione przed lotem');
    expect(before!.label).toContain('AKO');

    const after = fuelAfterReference(chain);
    expect(after!.value).toBe('96 L');
    expect(after!.label).toContain('Zastane po locie');
    expect(after!.label).toContain('JKW');
  });

  it('bez sąsiada milczą — kreska byłaby gorsza od braku wiersza', () => {
    expect(fuelBeforeReference(null)).toBeNull();
    expect(fuelBeforeReference(undefined)).toBeNull();
    expect(fuelBeforeReference({ before: null, after: null })).toBeNull();
    expect(fuelAfterReference({ before: null, after: null })).toBeNull();
  });
});

describe('ostrzeżenia o rozjeździe łańcucha', () => {
  it('milczą, gdy odczyty się zgadzają', () => {
    expect(fuelContinuityWarnings(chain, 140, 96)).toEqual([]);
  });

  it('milczą w granicach podziałki paliwomierza', () => {
    // 4 L różnicy to mniej niż tolerancja — ostrzeżenie o tym byłoby fałszywym
    // alarmem przy każdej normalnej sesji.
    expect(fuelContinuityWarnings(chain, 144, 92)).toEqual([]);
  });

  it('mówią o rozjeździe z POPRZEDNIM lotem i podają źródło', () => {
    const [w] = fuelContinuityWarnings(chain, 100, 96);
    expect(w!.id).toBe('continuity-before');
    expect(w!.text).toContain('140 L');
    expect(w!.text).toContain('100 L');
    expect(w!.src).toContain('AKO');
  });

  it('mówią o rozjeździe z NASTĘPNYM lotem', () => {
    const [w] = fuelContinuityWarnings(chain, 140, 40);
    expect(w!.id).toBe('continuity-after');
    expect(w!.text).toContain('96 L');
  });

  it('łapią rozjazd w OBIE strony — także paliwo, którego przybyło', () => {
    // Ktoś mógł dolać poza aplikacją: rejestr o tym nie wie, a zbiornik owszem.
    // Dlatego mówimy o różnicy, a nie o jej znaku, i nie nazywamy tego błędem.
    expect(fuelContinuityWarnings(chain, 200, 96)).toHaveLength(1);
    expect(fuelContinuityWarnings(chain, 140, 200)).toHaveLength(1);
  });

  it('bez łańcucha i bez odczytów nie ma o czym mówić', () => {
    expect(fuelContinuityWarnings(null, 100, 40)).toEqual([]);
    expect(fuelContinuityWarnings(chain, null, null)).toEqual([]);
  });

  it('ostrzeżenie jest TYLKO tekstem — nie niesie niczego, co mogłoby zablokować zapis', () => {
    // Gdyby kiedyś doszło pole w rodzaju `blocking`, ekran mógłby zacząć na nim
    // wyszarzać przycisk — a to jest dokładnie ta bramka, której tu nie ma być.
    for (const w of fuelContinuityWarnings(chain, 100, 40)) {
      expect(Object.keys(w).sort()).toEqual(['id', 'src', 'text']);
    }
  });
});
