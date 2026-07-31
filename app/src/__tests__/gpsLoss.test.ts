/**
 * UZ Aero — testy napisów stanu „GPS: brak sygnału" (mockup 05g, `screens/gpsLoss.ts`)
 * i formatu pozycji DDM (ekran 13, `format.formatLatLon`).
 *
 * Te zdania czyta pilot W LOCIE — pomyłka w wieku fixa albo w półkuli to nie literówka.
 */

import { formatLatLon } from '../ui/format';
import { fixAge, gpsLossText, staleCellNote, unknownPhaseDetail } from '../ui/screens/logic/gpsLoss';

const T = Date.UTC(2026, 5, 22, 15, 58, 0);

describe('gpsLoss — baner i adnotacje 05g', () => {
  it('wiek fixa: minuty po minucie, sekundy poniżej', () => {
    expect(fixAge(T, T + 12 * 60_000)).toBe('12 min temu');
    expect(fixAge(T, T + 45_000)).toBe('45 s temu');
    expect(fixAge(T, T)).toBe('1 s temu'); // zero sekund nie istnieje w mowie
  });

  it('baner z ostatnim fixem: czas UTC + wiek + instrukcja ręcznego zapisu', () => {
    const text = gpsLossText(T, T + 12 * 60_000);
    expect(text).toContain('Ostatni fix 15:58 UTC (12 min temu).');
    expect(text).toContain('zapisuj je ręcznie');
    expect(text).toContain('Timery i log dnia liczą dalej z zegara.');
  });

  it('bez ani jednego fixa nie datujemy pustki', () => {
    expect(gpsLossText(null, T)).toContain('Ani jednego fixa od startu silnika.');
    expect(staleCellNote(null)).toBe('brak fixa');
    expect(unknownPhaseDetail(null)).toBe('FAZA NIEZNANA · BEZ FIXA OD STARTU SILNIKA');
  });

  it('adnotacje siatki i fazy niosą czas ostatniego fixa', () => {
    expect(staleCellNote(T)).toBe('brak fixa od 15:58');
    expect(unknownPhaseDetail(T)).toBe('FAZA NIEZNANA · BEZ FIXA OD 15:58');
  });
});

describe('formatLatLon — stopnie i minuty dziesiętne (ekran 13)', () => {
  it('kanoniczna pozycja EPKK-okolice: 50°04.7\'N 019°47.1\'E', () => {
    expect(formatLatLon(50.0783, 19.785)).toBe("50°04.7'N 019°47.1'E");
  });

  it('półkule południowa i zachodnia', () => {
    expect(formatLatLon(-33.9249, -18.4241)).toBe("33°55.5'S 018°25.4'W");
  });

  it('minuty z zerem wiodącym — wyrównanie kolumny', () => {
    expect(formatLatLon(52.05, 21.0083)).toBe("52°03.0'N 021°00.5'E");
  });
});
