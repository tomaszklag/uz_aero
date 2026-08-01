/**
 * UZ Aero — panel: CO unieważnia ponowienie eksportu.
 *
 * Test idzie przez PRAWDZIWY `QueryClient`, bez atrapy sieci i bez renderu: pytanie
 * „czy klucz A unieważnia klucz B" jest własnością kluczy, więc `mutationFn` nie musi
 * się tu w ogóle wykonać (`docs/architektura-panelu-frontend.md` §8 — nie testujemy
 * hooków Query na zamockowanym `fetch`).
 *
 * Rzecz, którą ten plik przybija: **korzeń `exports` obejmuje TAKŻE podgląd karty
 * i historię rewizji**. To nie jest oczywiste — przy flocie taki szeroki korzeń był
 * usterką, bo pod jednym prefiksem żyły dwa pytania o różnej naturze. Tutaj wszystkie
 * trzy starzeją się od tej samej rzeczy: od wysyłki karty. Wąskie unieważnienie
 * zostawiłoby otwarty podgląd pokazujący treść sprzed regeneracji.
 */

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { keys } from './keys';
import { invalidateAfterRetry } from './useRetryExport';

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const invalidated = (qc: QueryClient, key: readonly unknown[]): boolean =>
  qc.getQueryState(key)?.isInvalidated ?? false;

describe('unieważnienia po ponowieniu eksportu', () => {
  it('starzeje się lista, historia rewizji I podgląd karty', () => {
    const qc = client();
    const watched = [
      keys.exports.list({}),
      keys.exports.history('sess-1'),
      keys.exports.sheet('sess-1'),
    ];
    for (const key of watched) qc.setQueryData(key, {});

    // Kontrola samego testu: przed wywołaniem żaden wpis nie jest unieważniony, więc
    // zielony wynik niżej nie może wziąć się ze stanu początkowego.
    for (const key of watched) expect(invalidated(qc, key)).toBe(false);

    invalidateAfterRetry(qc);

    for (const key of watched) expect(invalidated(qc, key)).toBe(true);
  });

  it('starzeją się też listy dni, dziennik audytu i pulpit', () => {
    // Kolumna „Arkusz" na `A02` i nagłówek `A02a` niosą numer rewizji, `AuditedWrite`
    // dopisał wpis tą samą transakcją, a plakietki pulpitu kłamałyby zaraz po zmianie.
    const qc = client();
    const rest = [keys.sessions.all, keys.audit.all, keys.dashboard];
    for (const key of rest) qc.setQueryData(key, {});

    invalidateAfterRetry(qc);

    for (const key of rest) expect(invalidated(qc, key)).toBe(true);
  });

  it('NIE rusza flag ani kont — ponowienie ich nie dotyka', () => {
    // Ponowienie nie rozstrzyga flagi i nie omija bramki; skrzynka wygląda po nim
    // dokładnie tak samo. Odświeżanie jej sugerowałoby, że coś się w niej zmieniło.
    const qc = client();
    const untouched = [keys.flags.all, keys.pilots.all];
    for (const key of untouched) qc.setQueryData(key, {});

    invalidateAfterRetry(qc);

    for (const key of untouched) expect(invalidated(qc, key)).toBe(false);
  });
});
