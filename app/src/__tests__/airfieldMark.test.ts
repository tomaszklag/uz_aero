/**
 * UZ Aero - test oznaczenia kodu spoza katalogu (issue #62 pkt 1).
 *
 * Pilnuje jednej rzeczy, którą łatwo zgubić przy następnej zmianie: nazwa i plakietka
 * WYKLUCZAJĄ SIĘ. Kod z katalogu ma nazwę i nie ma plakietki, kod spoza - odwrotnie.
 * Oba naraz mówiłyby to samo dwa razy w kontrolce, której prawa krawędź niesie
 * dokładnie jedną rzecz.
 */

import { airfieldMark } from '../ui/components/input/airfieldMark';

describe('oznaczenie wybranego lotniska', () => {
  it('kod z katalogu niesie NAZWĘ i nie jest obcy', () => {
    const mark = airfieldMark('EPKK');
    expect(mark.foreign).toBe(false);
    expect(mark.meta).not.toBeNull();
    expect(mark.meta).toContain('Krak');
  });

  it('kod spoza katalogu jest OZNACZONY i nie udaje, że ma nazwę', () => {
    // Przelot do Berlina jest normalnym dniem - katalog obejmuje Polskę, więc jego
    // milczenie nie jest błędem pilota. Ale wybór ma zostać widoczny.
    const mark = airfieldMark('EDDB');
    expect(mark.foreign).toBe(true);
    expect(mark.meta).toBeNull();
  });

  it('pusty kod nie jest ani znany, ani obcy - pole czeka na wybór', () => {
    for (const empty of ['', null, undefined]) {
      expect(airfieldMark(empty)).toEqual({ meta: null, foreign: false });
    }
  });

  it('nazwa i plakietka nigdy nie występują razem', () => {
    for (const icao of ['EPKK', 'EPWA', 'EDDB', 'KJFK', '']) {
      const mark = airfieldMark(icao);
      expect(mark.meta != null && mark.foreign).toBe(false);
    }
  });
});
