/**
 * UZ Aero (serwer) — adapter zrzutu śladu kalibracyjnego na dysk (`TraceSinkPort`).
 *
 * NDJSON per sesja (`<dir>/<sessionUuid>.ndjson`; wpisy bez sesji → `_bez-sesji`):
 * jeden wiersz = jeden wpis, dopisywanie na końcu. Płaskie pliki zamiast Postgresa,
 * bo (a) wolumen jest strumieniowy (~30 tys. wierszy/dzień/samolot), (b) konsument
 * to skrypt `replay` czytający plik sekwencyjnie, (c) retencję załatwia `rm` —
 * ślad to materiał roboczy fazy 5, nie rejestr.
 *
 * `pilotId` dopisujemy do każdego wiersza — analiza chce wiedzieć, CZYJ telefon
 * nagrał ślad (różne uchwyty, różne telefony = różny szum GPS).
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { TraceSinkPort } from '../../application/common/ports.ts';
// Nazwa pliku liczy się TYM SAMYM kodem co przy odczycie (`fsTraceSource.ts`) —
// dwie kopie tej funkcji dałyby pusty ślad w panelu przy pliku leżącym na dysku.
import { safeName } from './safeName.ts';

export class FsTraceSink implements TraceSinkPort {
  constructor(private readonly dir: string) {}

  async append(pilotId: string, entries: Record<string, unknown>[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });

    // Grupowanie per sesja — jeden appendFile na plik, nie na wiersz.
    const bySession = new Map<string, string[]>();
    for (const entry of entries) {
      const file = safeName(entry.sessionUuid);
      const lines = bySession.get(file) ?? [];
      lines.push(JSON.stringify({ ...entry, pilotId }));
      bySession.set(file, lines);
    }

    for (const [file, lines] of bySession) {
      await appendFile(join(this.dir, `${file}.ndjson`), lines.join('\n') + '\n', 'utf8');
    }
  }
}
