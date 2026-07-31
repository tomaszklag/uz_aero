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

/** Nazwa pliku nie może przyjść z telefonu dosłownie — tniemy do bezpiecznego zbioru. */
function safeName(sessionUuid: unknown): string {
  const raw = typeof sessionUuid === 'string' && sessionUuid.length > 0 ? sessionUuid : '_bez-sesji';
  return raw.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
}

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
