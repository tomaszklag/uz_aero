/**
 * UZ Aero — panel: liczby rozbieżności z `flags.details` (moduł czysty).
 *
 * Ten plik powstał razem z rozdzieleniem `session_overlap` (2026-08-07) na
 * `aircraft_overlap` i `pilot_overlap`. Do tej pory jedna gałąź opisywała jedno pojęcie
 * i modułu nikt nie testował; teraz gałęzie są dwie i **muszą mówić różne rzeczy**, bo
 * to dwie różne sprawy dla administratora: pierwsza trzyma dokument klubu, druga opisuje
 * grafik człowieka.
 *
 * `details` jest kolumną `jsonb`, więc drugą regułą jest przyznawanie się do braku:
 * flagi zapisane przed zmianą detektora zostają w bazie na zawsze, a skrzynka pokazuje
 * sprawy sprzed pół roku.
 */

import { describe, expect, it } from 'vitest';

import type { FlagListItemDto } from '../../api/dto';
import { detailRows, discrepancyOf } from './flagDetails';

const DAY = Date.UTC(2026, 6, 30);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

function flag(over: Partial<FlagListItemDto> = {}): FlagListItemDto {
  return {
    id: 1046,
    type: 'aircraft_overlap',
    status: 'open',
    aircraftId: 'SP-KLM',
    reg: 'SP-KLM',
    aircraftType: 'Cessna 208 Caravan',
    sessionUuids: ['sess-a', 'sess-b'],
    details: { openSessions: 2 },
    createdAt: new Date(DAY).toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    blocksExport: true,
    ...over,
  };
}

const rowValue = (rows: ReturnType<typeof detailRows>, key: string) =>
  rows.find((r) => r.key === key)!.value;

describe('aircraft_overlap — dwa telefony piszą do jednej MASZYNY', () => {
  it('liczy sesje bez zdania samolotu i mówi, że dotyczą tej maszyny', () => {
    const d = discrepancyOf(flag());
    expect(d.main).toBe('2 sesje bez day_close');
    expect(d.sub).toBe('2 sesje na tej maszynie');
  });

  it('brak `openSessions` w `details` nie udaje liczby', () => {
    // Flagi sprzed zmiany detektora zostają w bazie na zawsze — panel ma o nich mówić
    // to, co wie, a nie podstawiać zero.
    expect(discrepancyOf(flag({ details: {} })).main).toBe('sesje bez zdania samolotu');
  });
});

describe('pilot_overlap — jeden PILOT rzekomo na dwóch maszynach naraz', () => {
  const pilotFlag = (details: Record<string, unknown>) =>
    flag({ id: 1052, type: 'pilot_overlap', blocksExport: false, details });

  it('nazywa PARĘ MASZYN i wspólny odcinek czasu, a nie liczbę sesji', () => {
    // To jest cała różnica wobec `aircraft_overlap`: tam pytanie brzmi „ile strumieni
    // pisze do tej maszyny", tu „kiedy ten człowiek był w dwóch miejscach naraz".
    const d = discrepancyOf(pilotFlag({ aircraft: 'SP-ABC + SP-KLM', from: at(9, 12), to: at(10, 30) }));

    expect(d.main).toBe('SP-ABC + SP-KLM naraz');
    expect(d.sub).toBe('09:12 → 10:30 UTC');
  });

  it('nakładka, która TRWA, mówi „trwa" — bo `to` nie jest brakiem danych', () => {
    // `pilotOverlap.ts` dokłada `to` wyłącznie wtedy, gdy OBIE sesje są zamknięte.
    // Przy otwartej nakładka nie skończyła się i domyślanie się końca byłoby
    // twierdzeniem o przyszłości. To najczęstsza postać tej wady: zapomniane zdanie
    // poprzedniego samolotu.
    const d = discrepancyOf(pilotFlag({ aircraft: 'SP-ABC + SP-KLM', from: at(9, 12) }));
    expect(d.sub).toBe('09:12 → trwa UTC');

    const rows = detailRows(pilotFlag({ aircraft: 'SP-ABC + SP-KLM', from: at(9, 12) }));
    expect(rowValue(rows, 'Wspólny odcinek do')).toBe('trwa');
  });

  it('rozkład w szufladzie niesie maszyny, oba końce odcinka i liczbę sesji', () => {
    const rows = detailRows(
      pilotFlag({ aircraft: 'SP-ABC + SP-KLM', from: at(9, 12), to: at(10, 30) }),
    );

    expect(rowValue(rows, 'Maszyny')).toBe('SP-ABC + SP-KLM');
    expect(rowValue(rows, 'Wspólny odcinek od')).toBe('09:12 UTC');
    expect(rowValue(rows, 'Wspólny odcinek do')).toBe('10:30 UTC');
    expect(rowValue(rows, 'Sesje w sprawie')).toBe('2');
  });

  it('pusty `details` daje kreski i zdanie ogólne, nie wyjątek', () => {
    const d = discrepancyOf(pilotFlag({}));
    expect(d.main).toBe('dwie maszyny naraz');
    expect(d.sub).toBeNull();
    expect(rowValue(detailRows(pilotFlag({})), 'Maszyny')).toBe('—');
  });
});

describe('obie nakładki są ROZRÓŻNIALNE na pierwszy rzut oka', () => {
  it('opis maszynowy i opis grafiku nie brzmią tak samo', () => {
    // Gdyby brzmiały, administrator musiałby czytać kolumnę typu, żeby wiedzieć, czy
    // sprawa trzyma kartę arkusza, czy dotyczy wyłącznie planu pracy człowieka.
    const aircraft = discrepancyOf(flag());
    const pilot = discrepancyOf(
      flag({ type: 'pilot_overlap', details: { aircraft: 'SP-ABC + SP-KLM', from: at(9, 12) } }),
    );

    expect(aircraft.main).not.toBe(pilot.main);
    expect(aircraft.sub).not.toBe(pilot.sub);
  });
});
