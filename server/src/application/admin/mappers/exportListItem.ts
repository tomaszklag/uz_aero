/**
 * UZ Aero (serwer) — złączenie projekcji z dziennikiem eksportu → wiersz `A05`.
 *
 * Czysta funkcja, testowana bez bazy — ten sam wzorzec, co `sessionRowFrom` po stronie
 * zapisu i `sessionListItem` po stronie odczytu.
 *
 * ══ STAN KARTY: TU MIESZKA DEFINICJA DLA WIERSZA ══
 * `ExportState` nie jest kolumną — to wniosek z czterech faktów naraz. Do 2026-08-01
 * była to definicja JEDYNA, a zawężanie i liczenie chipów działo się nad już zmapowaną
 * tablicą. Kosztowało to ekran: tablica jest obcięta `LIMIT`-em, więc chip „Bez karty"
 * pokazywał zero nad rejestrem pełnym dni bez karty (`contracts/exports.ts`).
 *
 * Od 2026-08-01 bliźniacze wyrażenie `CASE` stoi w `infrastructure/pg/admin/exportsRepo.ts`
 * i obsługuje zawężanie oraz liczniki nad CAŁYM zakresem. Definicje są dwie, są nazwane
 * w obu plikach, a rozjazd między nimi łapie `test/adminExports.test.ts` — porównuje
 * liczniki z wierszami odpowiedzi i sprawdza, że `?state=X` oddaje dokładnie te dni,
 * którym ta funkcja przypisała `X`. **Zmieniasz kolejność albo warunek niżej — zmień
 * `CASE` w adapterze w tym samym commicie.**
 *
 * Kolejność sprawdzeń niżej jest treścią, nie stylem, i jest opisana przy każdym kroku.
 */

import { sheetDay, sheetTabName } from '../../common/export/daySheetContent.ts';
import type { AdminExportListItem, ExportState } from '../contracts/exports.ts';
import type { AdminExportJoin } from '../ports.ts';

/**
 * Stan karty dnia. Pierwsze dopasowanie wygrywa i **kolejność jest regułą**:
 *
 *  1. **`impossible` przed wszystkim** — sesja bez chwili przejęcia nie ma nawet nazwy
 *     karty, więc mówienie o niej „brakuje karty" sugerowałoby, że da się ją dorobić.
 *     Od migracji 21 to stan wyłącznie awaryjny: `session_claim` ma KAŻDA sesja (§4.4).
 *  2. **`waiting` przed `blocked`** — dzień, który jeszcze trwa, nie jest zablokowany
 *     przez flagę, tylko po prostu niegotowy; obie bramki są w eksporterze, ale tylko
 *     jedna wymaga decyzji człowieka.
 *  3. **`blocked` przed `missing`** — brak karty JEST tu skutkiem flagi, a nie osobnym
 *     zaniedbaniem. Wiersz ma prowadzić do flagi, nie do przycisku „Ponów", który
 *     i tak odbije się o tę samą bramkę.
 *  4. `missing` vs `current` — decyduje obecność wiersza w `export_log`.
 *
 * Stanu „karta nieaktualna" tu NIE MA i nie wolno go dopisać przez porównanie
 * `exportedAt` z `updatedAt`: to są stemple z DWÓCH RÓŻNYCH ZEGARÓW (`Clock` aplikacji
 * i `now()` Postgresa). Pełne uzasadnienie i warunek domknięcia — w nagłówku
 * `contracts/exports.ts`.
 */
export function exportState(join: AdminExportJoin): ExportState {
  if (join.claimedAt == null) return 'impossible';
  if (join.status !== 'closed') return 'waiting';
  if (join.blockingFlagIds.length > 0) return 'blocked';
  if (join.revision == null || join.exportedAt == null) return 'missing';
  return 'current';
}

export function exportListItem(join: AdminExportJoin): AdminExportListItem {
  // Nazwa karty liczona TĄ SAMĄ funkcją, którą eksporter nazywa kartę przy zapisie
  // (`daySheetContent.sheetTabName`) i którą telefon liczy u siebie na ekranie 11.
  // Druga konwencja nazw w monitorze znaczyłaby, że panel pokazuje link do karty,
  // której w bazie nie ma — a wyglądałoby to na awarię eksportu.
  const tab =
    join.claimedAt == null ? null : sheetTabName(join.claimedAt, join.aircraftId);

  return {
    sessionUuid: join.sessionUuid,
    tab,
    day: join.claimedAt == null ? null : sheetDay(join.claimedAt),
    claimedAt: join.claimedAt,

    aircraftId: join.aircraftId,
    reg: join.reg,
    aircraftType: join.aircraftType,

    picId: join.picId,
    picCode: join.picCode,
    picName: join.picName,

    sessionStatus: join.status,
    state: exportState(join),

    revision: join.revision,
    exportedAt: join.exportedAt?.toISOString() ?? null,
    sheetUrl: join.sheetUrl,

    blockingFlagIds: join.blockingFlagIds,
    updatedAt: join.updatedAt.toISOString(),

    // Fakt z dziennika, nie ocena: ktoś inny zapisał kartę o tej samej nazwie później.
    // Stan zostaje `current` — dziennik TEGO dnia ma własne rewizje i to jest prawda.
    // Nieprawdą byłoby dopiero milczenie o tym, że treść pod `tab` opisuje inny dzień
    // pracy; dlatego jedzie osobnym polem, a nie jako szósty stan.
    overwrittenBy:
      join.overwrittenBy == null
        ? null
        : {
            sessionUuid: join.overwrittenBy.sessionUuid,
            exportedAt: join.overwrittenBy.exportedAt.toISOString(),
          },
  };
}
