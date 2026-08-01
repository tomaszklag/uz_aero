/**
 * UZ Aero — panel: testy karty „Ostatnio przyjęte" (`A01`).
 *
 * Karta istnieje po to, żeby NIE POMYLIĆ dwóch czasów: kiedy coś się stało i kiedy się
 * o tym dowiedzieliśmy. Na tym rozróżnieniu stoi zdanie, którym zaczyna się cały
 * pulpit: „to nie jest podgląd lotu na żywo".
 */

import { describe, expect, it } from 'vitest';

import type { RecentEventDto } from '../../api/dto';
import { DELAY_WORTH_SAYING_MS, RECENT_EMPTY, recentRows } from './pulpitRecent';

const NOW = Date.UTC(2026, 6, 31, 14, 22, 0);
const MINUTE = 60_000;

const event = (over: Partial<RecentEventDto> = {}): RecentEventDto => ({
  uuid: 'ev-1',
  sessionUuid: 'sess-1',
  aircraftId: 'ac-1',
  reg: 'SP-ABC',
  type: 'takeoff',
  eventTime: NOW - 3 * MINUTE,
  receivedAt: new Date(NOW - 2 * MINUTE).toISOString(),
  picId: 'TMK',
  picCode: 'TMK',
  picName: 'Tomasz Małkiewicz',
  ...over,
});

const one = (over: Partial<RecentEventDto> = {}) => recentRows([event(over)])[0]!;

describe('kolumna czasu i opis', () => {
  it('czas to CZAS ZDARZENIA z sekundami — sekundy mają znaczenie w rejestrze', () => {
    expect(one({ eventTime: Date.UTC(2026, 6, 31, 14, 19, 52) }).time).toBe('14:19:52');
  });

  it('typ zdarzenia jest nazwą wiersza — ten sam napis, co w SQL-u i w mockupie', () => {
    const row = one({ type: 'engine_stop' });
    expect(row.name).toBe('engine_stop');
    expect(row.badge).toBe('silnik');
    expect(row.dot).toBe('red');
  });

  it('opis składa samolot i pilota, bez opóźnienia, gdy jest znikome', () => {
    // Wiersz, który przy każdym zdarzeniu tłumaczy się z sekund, przestaje być czytany.
    expect(one().meta).toBe('SP-ABC · TMK');
  });
});

describe('opóźnienie przyjęcia mówi się WPROST, gdy jest faktem o łączności', () => {
  it('paczka z zaległego outboxu niesie różnicę w opisie', () => {
    const row = one({
      eventTime: NOW - 3 * 60 * MINUTE,
      receivedAt: new Date(NOW - 2 * MINUTE).toISOString(),
    });
    expect(row.meta).toContain('przyjęte 2 h 58 min po zdarzeniu');
  });

  it('dokładnie NA progu jeszcze milczymy — granica jest ostra', () => {
    const row = one({
      eventTime: NOW - DELAY_WORTH_SAYING_MS,
      receivedAt: new Date(NOW).toISOString(),
    });
    expect(row.meta).toBe('SP-ABC · TMK');
  });
});

describe('braki i przejścia', () => {
  it('samolot spoza rejestru i konto bez kodu nie znikają z listy', () => {
    // Rejestr jest append-only i to on jest prawdą; brak wiersza w tabeli referencyjnej
    // odbiera nazwę, nie fakt.
    const row = one({ reg: null, picCode: null, picName: null });
    expect(row.meta).toBe('ac-1 · TMK');
  });

  it('wiersz prowadzi na kartę DNIA, do którego zdarzenie należy', () => {
    // Mockup kieruje stąd do rejestru zdarzeń (`A04`), którego nie ma. Karta dnia
    // istnieje i pokazuje zdarzenie w pełnym kontekście.
    expect(one({ sessionUuid: 'sess-9' }).to).toBe('/dni/sess-9');
  });

  it('pusty rejestr mówi CO INNEGO niż cisza po dniu lotnym', () => {
    expect(recentRows([])).toEqual([]);
    expect(RECENT_EMPTY.note).toContain('sprzed pierwszego synchronizowania');
  });
});
