/**
 * UZ Aero — panel: CZEGO mutacja floty nie unieważnia.
 *
 * ══ DLACZEGO TO JEST TEST, A NIE KOMENTARZ ══
 * `useFleetCommands` deklarował w docblocku: „czego tu NIE MA — unieważnienia progu".
 * Kod robił coś innego: unieważniał `keys.fleet.all`, a `invalidateQueries` dopasowuje
 * PREFIKSOWO, więc `['fleet','tolerance',1100]` leciał razem z listami. Zdanie o kodzie
 * nie jest własnością kodu; ta asercja jest.
 *
 * Test idzie przez PRAWDZIWY `QueryClient`, bez atrapy sieci i bez renderu: pytanie
 * „czy klucz A unieważnia klucz B" jest własnością kluczy, więc `mutationFn` nie musi
 * się tu w ogóle wykonać (`docs/architektura-panelu-frontend.md` §8 — nie testujemy
 * hooków Query na zamockowanym `fetch`).
 */

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { keys } from './keys';
import { invalidateFleet } from './useFleetCommands';

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const invalidated = (qc: QueryClient, key: readonly unknown[]): boolean =>
  qc.getQueryState(key)?.isInvalidated ?? false;

describe('unieważnienia po zapisie konfiguracji floty', () => {
  it('LISTA floty się starzeje, a PRÓG nie — mimo wspólnego prefiksu `fleet`', () => {
    const qc = client();
    const list = keys.fleet.list({});
    const tolerance = keys.fleet.tolerance(1100);
    qc.setQueryData(list, { items: [], counts: null, scopes: null });
    qc.setQueryData(tolerance, { capacityL: 1100, fuelToleranceL: 55 });

    // Kontrola samego testu: przed wywołaniem żaden wpis nie jest unieważniony, więc
    // zielony wynik niżej nie może wziąć się ze stanu początkowego.
    expect(invalidated(qc, list)).toBe(false);
    expect(invalidated(qc, tolerance)).toBe(false);

    invalidateFleet(qc);

    expect(invalidated(qc, list)).toBe(true);
    // `max(10 L, 5% pojemności)` jest funkcją czystą — odpowiedź dla 1100 L nie starzeje
    // się od tego, że ktoś zapisał samolot. Unieważnienie kosztowałoby żądanie o liczbę,
    // która nie może się zmienić, i to w chwili, gdy szuflada zapisu stoi otwarta,
    // czyli gdy to zapytanie jest AKTYWNE.
    expect(invalidated(qc, tolerance)).toBe(false);
  });

  it('starzeją się też listy dni, dziennik audytu i pulpit', () => {
    // Wiersz `A02` niesie `reg` i `mhFormat` samolotu, `AuditedWrite` dopisał wpis tą
    // samą transakcją, a plakietki pulpitu kłamałyby zaraz po zmianie.
    const qc = client();
    const rest = [keys.sessions.all, keys.audit.all, keys.dashboard];
    for (const key of rest) qc.setQueryData(key, {});

    invalidateFleet(qc);

    for (const key of rest) expect(invalidated(qc, key)).toBe(true);
  });
});
