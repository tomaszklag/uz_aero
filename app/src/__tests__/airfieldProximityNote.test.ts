/**
 * UZ Aero — testy komunikatu o rozjeździe pozycji z trasą (issue #6).
 *
 * Sedno: ten sam werdykt mówi CO INNEGO w preflighcie i w kokpicie, bo pilot ma w tych
 * dwóch miejscach różne możliwości działania. W preflighcie pole jest edytowalne i
 * komunikat prowadzi do poprawki; w kokpicie trasa jest już zapisana, a rejestr nie zna
 * korekty trasy — więc komunikat mówi to, co pilot naprawdę może zrobić.
 */

import { groundReferenceIcao, proximityNote } from '../ui/screens/logic/airfieldProximityNote';
import type { Airfield, AirfieldProximity } from '../domain';

function airfield(icao: string, name: string): Airfield {
  return { icao, name, lat: 52, lon: 16, elevationFt: 200, runway: null };
}

const MISMATCH: AirfieldProximity = {
  kind: 'mismatch',
  declared: airfield('EPKK', 'Kraków John Paul II International Airport'),
  distanceNm: 218.4,
  nearest: { airfield: airfield('EPZG', 'Zielona Góra-Babimost Airport'), distanceNm: 0.8 },
};

const SUGGESTION: AirfieldProximity = {
  kind: 'suggestion',
  nearest: { airfield: airfield('EPZG', 'Zielona Góra-Babimost Airport'), distanceNm: 0.8 },
};

describe('proximityNote — preflight', () => {
  it('rozjazd: ostrzega, podaje odległość i proponuje kod do wstawienia', () => {
    const note = proximityNote(MISMATCH, 'preflight');

    expect(note?.tone).toBe('amber');
    expect(note?.text).toContain('EPKK');
    expect(note?.text).toContain('218 NM');
    expect(note?.text).toContain('EPZG · Zielona Góra-Babimost Airport');
    expect(note?.suggestedIcao).toBe('EPZG');
  });

  it('pusta trasa: ton informacyjny, nie ostrzegawczy — to nie jest błąd', () => {
    const note = proximityNote(SUGGESTION, 'preflight');

    expect(note?.tone).toBe('blue');
    expect(note?.suggestedIcao).toBe('EPZG');
  });

  it('bliska odległość dostaje miejsce po przecinku — całe NM zaokrąglałyby do zera', () => {
    const note = proximityNote({ ...MISMATCH, distanceNm: 3.42 }, 'preflight');

    expect(note?.text).toContain('3.4 NM');
  });

  it('bez najbliższego lotniska komunikat nie obiecuje podpowiedzi', () => {
    const note = proximityNote({ ...MISMATCH, nearest: null }, 'preflight');

    expect(note?.text).not.toContain('Najbliżej');
    expect(note?.suggestedIcao).toBeNull();
  });
});

describe('proximityNote — kokpit', () => {
  it('rozjazd: mówi, co pilot MOŻE zrobić, skoro trasy nie da się już zmienić', () => {
    const note = proximityNote(MISMATCH, 'cockpit');

    expect(note?.tone).toBe('amber');
    expect(note?.text).toContain('administratorowi');
    // Żadnego kodu do wstawienia: nie ma gdzie go wstawić.
    expect(note?.suggestedIcao).toBeNull();
  });

  it('pusta trasa milczy — po zapisie podpowiedź nic już nie zmienia', () => {
    expect(proximityNote(SUGGESTION, 'cockpit')).toBeNull();
  });
});

describe('groundReferenceIcao', () => {
  const route = {
    inFlight: false,
    flightsCount: 0,
    departureIcao: 'EPZG',
    arrivalIcao: 'EPWA',
  };

  it('w powietrzu NIE sprawdzamy — oddalanie się od pola jest istotą lotu', () => {
    // Bez tego baner świeciłby przez cały lot i nauczyłby pilota ignorowania ostrzeżeń.
    expect(groundReferenceIcao({ ...route, inFlight: true })).toBeNull();
  });

  it('przed pierwszym lotem odniesieniem jest lotnisko startu', () => {
    expect(groundReferenceIcao(route)).toBe('EPZG');
  });

  it('po locie odniesieniem jest lotnisko docelowe — tam zamyka się dzień', () => {
    expect(groundReferenceIcao({ ...route, flightsCount: 2 })).toBe('EPWA');
  });

  it('bez podanego celu wraca do lotniska startu (dzień skokowy)', () => {
    expect(groundReferenceIcao({ ...route, flightsCount: 2, arrivalIcao: null })).toBe('EPZG');
  });
});

describe('proximityNote — cisza', () => {
  it('brak werdyktu to brak komunikatu w obu miejscach', () => {
    expect(proximityNote(null, 'preflight')).toBeNull();
    expect(proximityNote(null, 'cockpit')).toBeNull();
  });
});
