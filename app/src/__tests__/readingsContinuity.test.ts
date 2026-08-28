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
  mhAfterReference,
  mhBeforeReference,
  mhContinuityWarnings,
  oilContinuityWarnings,
  oilReference,
} from '../ui/screens/logic/readingsContinuity';
import { oilLitres } from '../ui/format';
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
    expect(fuelBeforeReference({ before: null, after: null, oil: null })).toBeNull();
    expect(fuelAfterReference({ before: null, after: null, oil: null })).toBeNull();
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

describe('ciągłość MOTOGODZIN — łańcuch MH jest osią samolotu (§4.5)', () => {
  it('podaje odczyty obu sąsiadów jako wiersze odniesienia', () => {
    expect(mhBeforeReference(chain, 'decimal')!.value).toBe('1232.0');
    expect(mhAfterReference(chain, 'decimal')!.value).toBe('1240.0');
    expect(mhBeforeReference(chain, 'decimal')!.label).toContain('AKO');
  });

  it('milczy, gdy licznik trzyma łańcuch', () => {
    expect(mhContinuityWarnings(chain, 'decimal', 1232, 1240)).toEqual([]);
    // W granicach podziałki licznika (0,1 h) też milczy.
    expect(mhContinuityWarnings(chain, 'decimal', 1232.05, 1240)).toEqual([]);
  });

  it('mówi o rozjeździe z każdej strony osobno', () => {
    expect(mhContinuityWarnings(chain, 'decimal', 1200, 1240)[0]!.id).toBe(
      'continuity-mh-before',
    );
    expect(mhContinuityWarnings(chain, 'decimal', 1232, 1300)[0]!.id).toBe(
      'continuity-mh-after',
    );
    expect(mhContinuityWarnings(chain, 'decimal', 1200, 1300)).toHaveLength(2);
  });
});

describe('ciągłość OLEJU — kotwica, nie para „przed/po"', () => {
  /** Bagnet po locie kłamie, więc olej ma jeden punkt odniesienia, nie dwa (issue #60). */
  const withOil: RemoteReadingsChain = {
    ...chain,
    oil: {
      levelL: 9.2,
      atMh: 1230,
      at: Date.UTC(2026, 7, 16, 7, 0),
      byPilotId: 'ako',
      addedSinceL: 1,
    },
  };

  it('wiersz odniesienia niesie pomiar, autora i DOLEWKI od niego', () => {
    const row = oilReference(withOil)!;
    expect(row.value).toBe(oilLitres(9.2));
    expect(row.label).toContain('AKO');
    expect(row.label).toContain('dolano');
  });

  it('bez pomiaru w rejestrze milczy', () => {
    expect(oilReference(chain)).toBeNull();
    expect(oilReference(null)).toBeNull();
  });

  it('mówi TYLKO o oleju, którego PRZYBYŁO bez dolewki', () => {
    // Ubytek jest normalnym zużyciem i ma własny rachunek w module oleju.
    expect(oilContinuityWarnings(withOil, 7.5)).toEqual([]);
    // Sufit = pomiar + dolewki = 10,2 L; w granicach tolerancji bagnetu milczymy.
    expect(oilContinuityWarnings(withOil, 10.5)).toEqual([]);
    const [w] = oilContinuityWarnings(withOil, 12);
    expect(w!.id).toBe('continuity-oil');
    expect(w!.text).toContain('dolano');
  });

  it('bez pomiaru albo bez wpisu nie ma o czym mówić', () => {
    expect(oilContinuityWarnings(chain, 12)).toEqual([]);
    expect(oilContinuityWarnings(withOil, null)).toEqual([]);
  });
});
