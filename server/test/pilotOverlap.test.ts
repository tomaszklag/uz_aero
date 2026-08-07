/**
 * UZ Aero (serwer) — nakładka CZASU PILOTA (`pilot_overlap`, §4.7).
 *
 * Sedno tego testu to przypadek, który po §3.6a przestał być anomalią: pilot zdaje jedną
 * maszynę i bierze drugą **co do minuty**. Stara flaga `session_overlap` nie umiała tego
 * odróżnić od prawdziwej nakładki, bo patrzyła wyłącznie na to, ile sesji jest otwartych.
 */

import { describe, expect, it } from 'vitest';

import { pilotOverlapFlags, type PilotSpan } from '../src/domain/pilotOverlap.ts';

const at = (h: number, m = 0): number => Date.UTC(2026, 7, 6, h, m);

const span = (o: Partial<PilotSpan> & { sessionUuid: string }): PilotSpan => ({
  aircraftId: 'SP-AXA',
  claimedAt: at(8),
  closedAt: at(11),
  ...o,
});

describe('pilot_overlap — grafik pilota, nie dane maszyny', () => {
  it('zdanie i przejęcie CO DO MINUTY nie jest nakładką', () => {
    // Dokładnie ten dzień, dla którego przebudowaliśmy model: SP-AXA do 11:20,
    // SP-KLM od 11:20. Jedna służba, dwie maszyny, zero anomalii.
    const flags = pilotOverlapFlags([
      span({ sessionUuid: 'a', aircraftId: 'SP-AXA', claimedAt: at(8), closedAt: at(11, 20) }),
      span({ sessionUuid: 'b', aircraftId: 'SP-KLM', claimedAt: at(11, 20), closedAt: at(15) }),
    ]);

    expect(flags).toEqual([]);
  });

  it('wspólny odcinek na DWÓCH maszynach → flaga z parą sesji', () => {
    const flags = pilotOverlapFlags([
      span({ sessionUuid: 'a', aircraftId: 'SP-AXA', claimedAt: at(8), closedAt: at(12) }),
      span({ sessionUuid: 'b', aircraftId: 'SP-KLM', claimedAt: at(11), closedAt: at(15) }),
    ]);

    expect(flags).toHaveLength(1);
    expect(flags[0]!.type).toBe('pilot_overlap');
    expect(flags[0]!.sessionUuids).toEqual(['a', 'b']);
    expect(flags[0]!.details).toMatchObject({ aircraft: 'SP-AXA + SP-KLM', from: at(11), to: at(12) });
  });

  it('dwie OTWARTE sesje na różnych maszynach nachodzą zawsze', () => {
    // Najczęstsza postać tej wady: pilot zapomniał zdać pierwszej maszyny.
    const flags = pilotOverlapFlags([
      span({ sessionUuid: 'a', aircraftId: 'SP-AXA', closedAt: null }),
      span({ sessionUuid: 'b', aircraftId: 'SP-KLM', claimedAt: at(10), closedAt: null }),
    ]);

    expect(flags).toHaveLength(1);
    // Nakładka trwa, więc końca wspólnego odcinka NIE ZMYŚLAMY.
    expect(flags[0]!.details).not.toHaveProperty('to');
  });

  it('dwie sesje na TEJ SAMEJ maszynie zostawiamy fladze maszyny', () => {
    // To jest `aircraft_overlap`. Podwójne flagowanie kazałoby administratorowi
    // rozstrzygać jedną rzecz dwa razy.
    const flags = pilotOverlapFlags([
      span({ sessionUuid: 'a', closedAt: null }),
      span({ sessionUuid: 'b', claimedAt: at(10), closedAt: null }),
    ]);

    expect(flags).toEqual([]);
  });

  it('sesja bez chwili przejęcia wypada z analizy, zamiast zgadywać odcinek', () => {
    const flags = pilotOverlapFlags([
      span({ sessionUuid: 'a', aircraftId: 'SP-AXA', claimedAt: null, closedAt: null }),
      span({ sessionUuid: 'b', aircraftId: 'SP-KLM', claimedAt: at(10), closedAt: null }),
    ]);

    expect(flags).toEqual([]);
  });

  /**
   * Znalezione 2026-08-07 przy przebudowie generatora demo (`scripts/demo/scenario.ts`).
   *
   * `sessionUuids` jest SORTOWANE alfabetycznie, bo to zbiór kanoniczny dla ograniczenia
   * `uq_flags_type_sessions` — i tak ma zostać. Ingest brał jednak z niego element `[1]`
   * jako „sesję późniejszą", żeby przypiąć flagę do maszyny, która została wzięta, gdy
   * poprzednia nie była zdana. Te dwa porządki nie mają ze sobą nic wspólnego.
   *
   * Wada spała, bo KAŻDY przypadek w tym pliku nazywał sesje `a`, `b`, `c` — czyli tak,
   * że porządek alfabetyczny pokrywał się z chronologicznym. Dopiero dane demo z prawdziwymi
   * identyfikatorami (`demo-kwa-…-ako` przejęte przed `demo-ank-…-ako`) pokazały flagę
   * przypiętą do maszyny ZDAWANEJ zamiast wziętej.
   */
  it('wskazuje sesję PÓŹNIEJSZĄ niezależnie od porządku alfabetycznego uuid', () => {
    const flags = pilotOverlapFlags([
      span({ sessionUuid: 'zulu', aircraftId: 'SP-AXA', claimedAt: at(8), closedAt: null }),
      span({ sessionUuid: 'alfa', aircraftId: 'SP-KLM', claimedAt: at(10), closedAt: null }),
    ]);

    expect(flags).toHaveLength(1);
    // Zbiór zostaje kanoniczny (UNIQUE w bazie działa na posortowanej tablicy)…
    expect(flags[0]!.sessionUuids).toEqual(['alfa', 'zulu']);
    // …a „która była później" jedzie osobnym polem, bo z tamtego nie da się jej odczytać.
    expect(flags[0]!.laterSessionUuid).toBe('alfa');
  });

  it('trzy nachodzące sesje dają trzy PARY — flaga opisuje parę, nie zbiór', () => {
    const flags = pilotOverlapFlags([
      span({ sessionUuid: 'a', aircraftId: 'SP-AXA', claimedAt: at(8), closedAt: null }),
      span({ sessionUuid: 'b', aircraftId: 'SP-KLM', claimedAt: at(9), closedAt: null }),
      span({ sessionUuid: 'c', aircraftId: 'SP-ANK', claimedAt: at(10), closedAt: null }),
    ]);

    expect(flags.map((f) => f.sessionUuids)).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
  });
});
