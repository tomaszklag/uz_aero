/**
 * UZ Aero — panel: MUTACJE ekranu konserwacji (`A11`).
 *
 * **Mutacja deklaruje swoje unieważnienia TUTAJ, nie na ekranie**
 * (`docs/architektura-panelu-frontend.md` §4.3).
 *
 * Czego tu NIE MA: **aktualizacji optymistycznych.** Obie operacje mają skutek, którego
 * panel nie umie przewidzieć (ile wierszy naprawdę się rozjechało, ile tokenów zdążyło
 * wygasnąć od ostatniego odczytu), więc optymistyczny UI musiałby się z tego wycofywać
 * i tłumaczyć. Przycisk pokazuje stan zajęty, UI przyjmuje odpowiedź serwera.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { RebuildReportDto, TokenPurgeReportDto } from '../api/dto';
import { purgeRefreshTokens, rebuildProjections } from '../api/maintenance';
import { keys } from './keys';

/**
 * Co przestaje być prawdą po NADPISANIU projekcji.
 *
 * Lista jest długa i to jest miara tej operacji: przebudowa nadpisuje wiersze `sessions`,
 * czyli źródło KAŻDEJ liczby, którą panel pokazuje poza rejestrem zdarzeń. Dni, karta
 * dnia, monitor eksportu (kolumna „Rewizja" czyta stan dnia), pulpit i liczniki
 * sidebara — wszystkie z nich.
 *
 * ══ CZEGO TA MUTACJA NIE UNIEWAŻNIA — I TO JEST JEJ NAJWAŻNIEJSZA WŁASNOŚĆ ══
 *  • **`maintenance.projections`** (porównanie). Do 2026-08-02 stało tu
 *    `keys.maintenance.all`, a `invalidateQueries` dopasowuje PREFIKSOWO i refetchuje
 *    zapytania AKTYWNE niezależnie od `staleTime`. Kliknięcie „Nadpisz" odpalało więc
 *    drugi pełny skan rejestru (~4 min dla 1291 sesji), którego wynik i tak lądował
 *    w koszu, bo ekran pokazuje po zapisie raport z ZAPISU. Skan jest zdjęty z automatu
 *    świadomie (`useMaintenance.ts`) i uruchamia go WYŁĄCZNIE człowiek — wywołanie go
 *    ubocznie kasowało tę decyzję. To ta sama pułapka, co `fleet.all` łapiący
 *    `fleet.tolerance`, i tym razem ma własny test.
 *  • **`maintenance.refreshTokens`** — przebudowa nie dotyka tabeli sesji.
 *  • **`maintenance.schema`** — migracje wprowadza START SERWERA, nie akcja panelu.
 *  • **`events`** — rejestr zdarzeń jest tym JEDYNYM, czego przebudowa nie dotyka.
 *    Dopisanie go tutaj sugerowałoby coś odwrotnego.
 *
 * Raport z porównania jest po zapisie NIEAKTUALNY i ekran o tym wie: pokazuje ten
 * z dwóch raportów, który jest ŚWIEŻSZY (`screens/maintenance/rebuildRun.ts`,
 * `currentReport`), a bramkę „Nadpisz" trzyma zamkniętą do kolejnego porównania.
 * Unieważnianie po to, żeby uniknąć nieaktualnej odpowiedzi, kosztowałoby cztery
 * minuty pracy bazy za rzecz, którą rozstrzyga stempel czasu.
 *
 * Eksportowana, żeby dało się ją sprawdzić na PRAWDZIWYM `QueryClient` bez renderu —
 * „co ta mutacja unieważnia" jest własnością kluczy, nie ekranu.
 */
export function invalidateAfterRebuild(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: keys.sessions.all });
  void qc.invalidateQueries({ queryKey: keys.exports.all });
  void qc.invalidateQueries({ queryKey: keys.audit.all });
  void qc.invalidateQueries({ queryKey: keys.dashboard });
}

/**
 * Co przestaje być prawdą po WYCZYSZCZENIU tokenów: wyłącznie karta tokenów i dziennik
 * audytu. Sesje lotne, karty i flagi nie mają z tą tabelą nic wspólnego, a unieważnienie
 * ich „na wszelki wypadek" byłoby serią żądań o dane, które się nie zmieniły.
 */
export function invalidateAfterPurge(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: keys.maintenance.refreshTokens });
  void qc.invalidateQueries({ queryKey: keys.audit.all });
  void qc.invalidateQueries({ queryKey: keys.dashboard });
}

export function useRebuildProjections() {
  return useMutationWith<RebuildReportDto, string>(
    (reason) => rebuildProjections(reason),
    invalidateAfterRebuild,
  );
}

export function usePurgeRefreshTokens() {
  return useMutationWith<TokenPurgeReportDto, void>(
    () => purgeRefreshTokens(),
    invalidateAfterPurge,
  );
}

/** Wspólny kształt obu mutacji — różnią się wejściem i listą unieważnień, niczym więcej. */
function useMutationWith<TResult, TInput>(
  run: (input: TInput) => Promise<TResult>,
  invalidate: (qc: QueryClient) => void,
) {
  const qc = useQueryClient();
  return useMutation<TResult, unknown, TInput>({
    mutationFn: run,
    onSuccess: () => invalidate(qc),
  });
}
