/**
 * UZ Aero (serwer) — odczyt śladu jednej sesji z plików NDJSON (`TraceSourcePort`).
 *
 * Bliźniak `FsTraceSink`: ten sam katalog, ta sama konwencja nazw, przeciwny kierunek.
 * Nazwa pliku powstaje TĄ SAMĄ funkcją `safeName` co przy zapisie — gdyby te dwie
 * ścieżki rozjechały się choćby o jeden znak, panel czytałby pusty ślad dla sesji,
 * której zapis leży na dysku obok.
 *
 * Czytamy CAŁY plik sesji naraz i to jest świadomy wybór, nie niedopatrzenie: dzień
 * lotny to ~30 tys. wierszy (kilka MB), odczyt jest rzadki (administrator otwiera mapę),
 * a strumieniowanie kosztowałoby złożoność, której nie ma czym uzasadnić przy tej skali.
 * Gdyby ślady kiedyś urosły o rząd wielkości, to jest miejsce, w którym trzeba wrócić.
 *
 * Wiersz nieparsowalny POMIJAMY zamiast wywracać odczyt: NDJSON jest dopisywany
 * współbieżnie przez wiele telefonów, więc obcięty ostatni wiersz po nagłym zamknięciu
 * procesu jest scenariuszem realnym — i nie jest powodem, żeby cały lot przestał się
 * rysować. Ślad to materiał badawczy; jeden zgubiony fix nic nie znaczy.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { TraceSourcePort } from '../../application/common/ports.ts';
import { safeName } from './safeName.ts';

export class FsTraceSource implements TraceSourcePort {
  constructor(private readonly dir: string) {}

  async read(sessionUuid: string): Promise<Record<string, unknown>[]> {
    const file = join(this.dir, `${safeName(sessionUuid)}.ndjson`);

    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      // Brak pliku = sesja bez zapisu GPS. To normalny stan (lot ręczny, telefon
      // jeszcze nie wysłał), więc pusty wynik, a nie wyjątek.
      return [];
    }

    const entries: Record<string, unknown>[] = [];
    for (const line of raw.split('\n')) {
      if (line.length === 0) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          entries.push(parsed as Record<string, unknown>);
        }
      } catch {
        // Wiersz obcięty przy współbieżnym dopisywaniu — pomijamy (patrz nagłówek).
      }
    }
    return entries;
  }
}
