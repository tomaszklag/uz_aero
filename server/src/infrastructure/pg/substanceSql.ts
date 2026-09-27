/**
 * Ninerdeck (serwer) - TREŚĆ OPERACJI w SQL: lustro `operationSubstance` z @ninerdeck/domain
 * (issue #75).
 *
 * Telefon liczy treść, pustość i kotwicę numeracji na projekcji (`SessionState`);
 * serwer musi policzyć TO SAMO na kolumnach projekcji `sessions`, bo ranga sygnatury
 * i filtry list żyją w zapytaniach. Dwa zapisy jednej reguły to znane ryzyko rozjazdu -
 * dlatego fragmenty są w JEDNYM module (rangę i filtry składa się z tych samych
 * napisów), a zgodność z domeną przybija test krzyżowy
 * (`server/test/operationSignature.test.ts`), ten sam, który pilnuje numeracji.
 *
 * Nie łamie reguły §7.1 („nie odtwarzaj projekcji SQL-em"): to PREDYKATY na kolumnach,
 * które projekcja już policzyła - porównania i koalescencje, żadnej nowej liczby dnia.
 *
 * Każda funkcja bierze ALIAS tabeli, bo ranga sygnatury porównuje dwa wiersze
 * (`s` pytany i `x` liczony) tym samym wyrażeniem.
 */

/** Treść operacji - lustro `hasOperationSubstance`: bieg, lot, dolewka albo zmiana odczytu. */
export const substanceSql = (t: string): string => `(
  ${t}.engine_start_at IS NOT NULL
  OR COALESCE(${t}.flights_count, 0) > 0
  OR COALESCE(${t}.fuel_added_l, 0) > 0
  OR COALESCE(${t}.oil_added_l, 0) > 0
  OR (${t}.fuel_start_l IS NOT NULL AND ${t}.fuel_end_l IS NOT NULL
      AND ${t}.fuel_start_l <> ${t}.fuel_end_l)
  OR (${t}.mh_start IS NOT NULL AND ${t}.mh_end IS NOT NULL
      AND ${t}.mh_start <> ${t}.mh_end)
)`;

/**
 * Kotwica numeracji operacji - lustro `operationAnchor`: uruchomienie silnika,
 * a przy zapisie bez biegu - przejęcie, tylko po zdaniu i tylko z treścią.
 */
export const anchorSql = (t: string): string => `(CASE
  WHEN ${t}.engine_start_at IS NOT NULL THEN ${t}.engine_start_at
  WHEN ${t}.status = 'closed' AND ${substanceSql(t)} THEN ${t}.claim_time
END)`;

/**
 * Pusty zapis - lustro `isEmptyOperation`: zdany, bez treści, z KOMPLETEM odczytów
 * potwierdzających pustość. Listy panelu i agregaty dziennika filtrują nim śmieci
 * (issue #75 pkt 2); adres bezpośredni (`byUuid`) go NIE używa - rejestr widzi wszystko.
 */
export const emptySessionSql = (t: string): string => `(
  ${t}.status = 'closed'
  AND NOT ${substanceSql(t)}
  AND ${t}.fuel_start_l IS NOT NULL AND ${t}.fuel_end_l IS NOT NULL
  AND ${t}.mh_start IS NOT NULL AND ${t}.mh_end IS NOT NULL
)`;

/**
 * NUMER OPERACJI W DOBIE PILOTA - ostatni człon sygnatury (issue #68), jako RANGA
 * wiersza `t` wśród sąsiadów po kolumnach projekcji. Do 3.2.0 wyrażenie stało wprost
 * w adapterze listy operacji; monitor kart dnia (P-D) pisze sygnaturę przy każdym
 * wierszu, więc ranga ma JEDNO źródło - druga kopia rozjechałaby się przy pierwszej
 * poprawce, a dwie sygnatury jednego lotu to dokładna odwrotność tego, po co ona jest.
 *
 * Reguła zgadza się co do znaku z `operationIndexes` (@ninerdeck/domain), bo telefon
 * liczy ten sam numer u siebie, offline: ten sam pilot, TEN SAM KLUB, bez unieważnionych,
 * wyłącznie operacje z kotwicą (`anchorSql`), doba i kolejność z kotwicy, remis po
 * `session_uuid`. Warunek dotyczy TEŻ wiersza pytanego: bez części o statusie operacja
 * unieważniona dostawała numer swojej poprzedniczki. Zgodność torów przybija
 * `server/test/operationSignature.test.ts`.
 */
export const dayIndexSql = (t: string): string => `(CASE
  WHEN ${anchorSql(t)} IS NULL OR ${t}.status = 'voided' THEN NULL
  ELSE (
    SELECT COUNT(*)
      FROM sessions x
     WHERE x.pic_id = ${t}.pic_id
       AND x.org_id = ${t}.org_id
       AND x.status <> 'voided'
       AND ${anchorSql('x')} IS NOT NULL
       AND ${anchorSql('x')} / 86400000 = ${anchorSql(t)} / 86400000
       AND (${anchorSql('x')}, x.session_uuid) <= (${anchorSql(t)}, ${t}.session_uuid)
  )
END)`;
