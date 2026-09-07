/**
 * UZ Aero - testy bramki wpisu lotniska (`ui/components/sheets/airfieldEntry.ts`).
 *
 * Arkusz wyboru lotniska przyjmuje kod ALBO nazwę, bo po nazwie się szuka - ale do
 * zdarzenia `preflight_confirm` wchodzi wyłącznie kod. Bez tej bramki pilot, który wpisał
 * „zielona" i tapnął WYBIERZ zamiast pozycji z listy, zapisałby trasę „ZIELONA": napis,
 * którego nie zna ani katalog, ani arkusz klubu, ani panel - i którego nikt nie poprawi,
 * bo wygląda jak świadoma decyzja.
 */

import { icaoToStore } from '../ui/components/sheets/airfieldEntry';

describe('wpis lotniska → wartość do rejestru', () => {
  it('kod z katalogu przechodzi, także pisany z małej i ze spacjami', () => {
    expect(icaoToStore('EPKK')).toBe('EPKK');
    expect(icaoToStore('  epkk ')).toBe('EPKK');
  });

  it('kod SPOZA katalogu też przechodzi - katalog obejmuje tylko Polskę', () => {
    // Przelot do Berlina. Milczenie katalogu nie jest błędem pilota, więc sprawdzamy
    // KSZTAŁT kodu, a nie przynależność do zbioru.
    expect(icaoToStore('EDDB')).toBe('EDDB');
  });

  it('nazwa albo niedokończony kod nie mają jak trafić do rejestru', () => {
    for (const bad of ['zielona', 'EPK', 'EPKK1', 'EP KK', 'Zielona Góra']) {
      expect(icaoToStore(bad)).toBeNull();
    }
  });

  it('pusty wpis czyści pole - trasa nie jest wymagana', () => {
    expect(icaoToStore('')).toBe('');
    expect(icaoToStore('   ')).toBe('');
  });
});
