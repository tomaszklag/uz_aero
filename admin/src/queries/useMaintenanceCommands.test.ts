/**
 * UZ Aero — panel: CZEGO mutacje konserwacji nie unieważniają.
 *
 * ══ DLACZEGO TEN PLIK POWSTAŁ DOPIERO PO WADZIE ══
 * `useFleetCommands` deklarował w docblocku „czego tu NIE MA", a kod robił co innego —
 * i dostał za to test (`useFleetCommands.test.ts`). `useMaintenanceCommands` powtórzył
 * dokładnie ten sam błąd: unieważniał `keys.maintenance.all`, a `invalidateQueries`
 * dopasowuje PREFIKSOWO, więc razem z nim leciało `['maintenance','projections']` —
 * czyli PORÓWNANIE PROJEKCJI, pełny skan rejestru zdarzeń liczony w minutach.
 *
 * Cena była wyższa niż przy flocie. Tam unieważniano zapytanie o liczbę, która nie może
 * się zmienić; tutaj kliknięcie „Nadpisz" odpalało drugi czterominutowy skan bazy,
 * którego wynik i tak lądował w koszu (po zapisie ekran pokazuje raport z ZAPISU).
 * A skan jest zdjęty z automatu ŚWIADOMIE — `useMaintenance.ts` mówi wprost, że
 * uruchamianie go samoczynnie „zamieniłoby ekran diagnostyczny w generator obciążenia".
 * Unieważnienie ubocznie kasowało tę decyzję.
 *
 * Docblock `invalidateAfterRebuild` obiecywał, że funkcja jest eksportowana po to, żeby
 * dało się ją sprawdzić na PRAWDZIWYM `QueryClient`. Obietnica nie miała pokrycia —
 * ten plik ją realizuje: bez renderu i bez atrapy sieci, bo pytanie „czy klucz A
 * unieważnia klucz B" jest własnością kluczy (`docs/architektura-panelu-frontend.md` §8).
 */

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { keys } from './keys';
import { invalidateAfterPurge, invalidateAfterRebuild } from './useMaintenanceCommands';

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const invalidated = (qc: QueryClient, key: readonly unknown[]): boolean =>
  qc.getQueryState(key)?.isInvalidated ?? false;

/** Wszystkie trzy pytania ekranu konserwacji, wypełnione czymkolwiek. */
function seedMaintenance(qc: QueryClient): void {
  qc.setQueryData(keys.maintenance.projections, { mode: 'dry_run', rowsDiffering: 0 });
  qc.setQueryData(keys.maintenance.refreshTokens, { total: 52, expired: 37, valid: 15 });
  qc.setQueryData(keys.maintenance.schema, { schemaVersion: 3, applied: 3, pending: 0 });
}

describe('unieważnienia po NADPISANIU projekcji', () => {
  it('PORÓWNANIE nie starzeje się od zapisu — mimo wspólnego prefiksu `maintenance`', () => {
    const qc = client();
    seedMaintenance(qc);

    // Kontrola samego testu: przed wywołaniem nic nie jest unieważnione, więc zielony
    // wynik niżej nie może wziąć się ze stanu początkowego.
    expect(invalidated(qc, keys.maintenance.projections)).toBe(false);

    invalidateAfterRebuild(qc);

    // ══ TO JEST TA ASERCJA ══
    // Porównanie czyta strumień KAŻDEJ sesji w rejestrze. Unieważnienie go tutaj znaczy
    // drugi taki przebieg odpalony ubocznie, w chwili gdy zapytanie jest AKTYWNE (ekran
    // konserwacji stoi otwarty — to z niego przyszła mutacja), a jego wynik i tak jest
    // wyrzucany, bo po zapisie ekran pokazuje raport z zapisu.
    expect(invalidated(qc, keys.maintenance.projections)).toBe(false);
    // Przebudowa nie dotyka tabeli sesji ani schematu bazy.
    expect(invalidated(qc, keys.maintenance.refreshTokens)).toBe(false);
    expect(invalidated(qc, keys.maintenance.schema)).toBe(false);
  });

  it('starzeje się to, co przebudowa NAPRAWDĘ zmieniła: dni, eksporty, audyt, pulpit', () => {
    // `sessions` to źródło każdej liczby panelu poza rejestrem; monitor eksportu czyta
    // stan dnia; `AuditedWrite` dopisał wpis tą samą transakcją; plakietki pulpitu
    // kłamałyby zaraz po nadpisaniu.
    const qc = client();
    const stale = [keys.sessions.all, keys.exports.all, keys.audit.all, keys.dashboard];
    for (const key of stale) qc.setQueryData(key, {});

    invalidateAfterRebuild(qc);

    for (const key of stale) expect(invalidated(qc, key), String(key)).toBe(true);
  });

  it('REJESTR ZDARZEŃ zostaje nietknięty — bo przebudowa go nie dotyka', () => {
    // Unieważnienie `events` sugerowałoby, że przebudowa mogła coś w rejestrze zmienić.
    // Nie mogła: `events` jest append-only i pilnuje tego test architektury serwera.
    const qc = client();
    qc.setQueryData(keys.events.all, {});

    invalidateAfterRebuild(qc);

    expect(invalidated(qc, keys.events.all)).toBe(false);
  });
});

describe('unieważnienia po WYCZYSZCZENIU wygasłych tokenów', () => {
  it('starzeje się karta tokenów, audyt i pulpit — i nic poza tym', () => {
    const qc = client();
    seedMaintenance(qc);
    for (const key of [keys.audit.all, keys.dashboard, keys.sessions.all, keys.exports.all]) {
      qc.setQueryData(key, {});
    }

    invalidateAfterPurge(qc);

    expect(invalidated(qc, keys.maintenance.refreshTokens)).toBe(true);
    expect(invalidated(qc, keys.audit.all)).toBe(true);
    expect(invalidated(qc, keys.dashboard)).toBe(true);

    // Sesje lotne, karty arkusza i porównanie projekcji nie mają z tabelą tokenów nic
    // wspólnego — unieważnienie „na wszelki wypadek" byłoby serią żądań o dane, które
    // się nie zmieniły, a w przypadku porównania: o czterominutowy skan rejestru.
    expect(invalidated(qc, keys.sessions.all)).toBe(false);
    expect(invalidated(qc, keys.exports.all)).toBe(false);
    expect(invalidated(qc, keys.maintenance.projections)).toBe(false);
    expect(invalidated(qc, keys.maintenance.schema)).toBe(false);
  });
});
