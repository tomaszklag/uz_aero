import { describe, expect, it } from 'vitest';

import type { LoginSessionDto } from '../../api/dto';
import { deviceText, lastSeenText, sessionRow, sessionRows, whenText } from './sessionRows';

/** 15 WRZ 2026, 10:00 UTC - chwila, z której patrzy panel we wszystkich przypadkach. */
const NOW = Date.UTC(2026, 8, 15, 10, 0);

const session = (over: Partial<LoginSessionDto> = {}): LoginSessionDto => ({
  id: 's-1',
  surface: 'mobile',
  method: 'password',
  createdAt: new Date(Date.UTC(2026, 8, 12, 8, 4)).toISOString(),
  lastSeenAt: new Date(NOW - 3 * 60_000).toISOString(),
  device: 'Android 14 · Pixel 7 · Ninerdeck 2.1.0',
  ip: '10.0.0.1',
  current: false,
  ...over,
});

describe('od kiedy', () => {
  it('dziś, wczoraj i data - trzy różne pytania', () => {
    expect(whenText(new Date(Date.UTC(2026, 8, 15, 8, 12)).toISOString(), NOW)).toBe('dziś 08:12');
    expect(whenText(new Date(Date.UTC(2026, 8, 14, 19, 40)).toISOString(), NOW)).toBe('wczoraj 19:40');
    expect(whenText(new Date(Date.UTC(2026, 8, 12, 8, 4)).toISOString(), NOW)).toBe('12 WRZ 08:04');
  });
});

describe('ostatnio widziane', () => {
  it('świeże liczy się względnie, starsze - datą', () => {
    expect(lastSeenText(new Date(NOW - 3 * 60_000).toISOString(), NOW)).toBe('3 min temu');
    expect(lastSeenText(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)).toBe('2 h temu');
    // Granica biegnie po DOBIE, nie po liczbie godzin: „26 h temu" każe liczyć w głowie.
    expect(lastSeenText(new Date(Date.UTC(2026, 8, 14, 19, 40)).toISOString(), NOW)).toBe(
      'wczoraj 19:40',
    );
  });
});

describe('napis urządzenia', () => {
  it('przeglądarka dostaje człon powierzchni, telefon go NIE dostaje', () => {
    // Etykietę telefonu składa aplikacja i nazywa w niej siebie - „telefon" byłoby
    // trzecim powtórzeniem w jednej linii.
    expect(deviceText('Chrome · Windows', 'panel')).toBe('Chrome · Windows · panel');
    expect(deviceText('Android 14 · Pixel 7 · Ninerdeck 2.1.0', 'mobile')).toBe(
      'Android 14 · Pixel 7 · Ninerdeck 2.1.0',
    );
  });

  it('nieznane urządzenie mówi to wprost i dopiero wtedy nazywa powierzchnię', () => {
    expect(deviceText(null, 'panel')).toBe('urządzenie nieznane · panel');
    expect(deviceText('   ', 'mobile')).toBe('urządzenie nieznane · telefon');
  });
});

describe('wiersz sesji', () => {
  it('niesie metodę, początek i ostatnią aktywność', () => {
    const row = sessionRow(session(), NOW);
    expect(row.icon).toBe('phone');
    expect(row.meta).toBe('hasło · od 12 WRZ 08:04 · ostatnio 3 min temu');
  });

  it('BIEŻĄCA sesja nie mówi „ostatnio" - to powtórzenie plakietki', () => {
    const row = sessionRow(
      session({ surface: 'panel', method: 'google', device: 'Chrome · Windows', current: true }),
      NOW,
    );
    expect(row.icon).toBe('monitor');
    expect(row.meta).toBe('Google · od 12 WRZ 08:04');
    expect(row.meta).not.toContain('ostatnio');
  });

  it('sesja sprzed 2.1.0 MILCZY o metodzie zamiast zmyślać nazwę', () => {
    // `legacy` to brak odpowiedzi o przeszłości, a nie metoda - napis o „wcześniejszym
    // wydaniu" mówiłby o aplikacji, a nie o urządzeniu, które ktoś próbuje rozpoznać.
    const row = sessionRow(session({ method: 'legacy' }), NOW);
    expect(row.meta.startsWith('od ')).toBe(true);
  });
});

describe('kolejność listy', () => {
  it('bieżąca na górze, potem od najświeższej aktywności', () => {
    const rows = sessionRows(
      [
        session({ id: 'stary', lastSeenAt: new Date(NOW - 5 * 86_400_000).toISOString() }),
        session({ id: 'swiezy', lastSeenAt: new Date(NOW - 60_000).toISOString() }),
        session({ id: 'to-okno', current: true, lastSeenAt: new Date(NOW - 86_400_000).toISOString() }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(['to-okno', 'swiezy', 'stary']);
  });
});
