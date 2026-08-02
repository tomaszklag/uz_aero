/**
 * UZ Aero (serwer) — PRZELICZENIE I PORÓWNANIE projekcji `sessions` ze strumieniem.
 *
 * ══ DLACZEGO TO STOI OBOK KOMENDY, A NIE W NIEJ ══
 * Ekran `A11` opisuje przebudowę jako DWA KROKI: najpierw „Przelicz i porównaj — bez
 * zapisu", potem „Przelicz i nadpisz". Krok pierwszy nie ma prawa iść przez
 * `AuditedWrite`: tamta brama wymusza w TYPIE wpis do `admin_audit`, a dziennik nadzoru
 * nie może opisywać rzeczy, które się nie wydarzyły. Krok drugi bez tej bramy istnieć
 * nie może. Skoro drogi są dwie, a ocena ma być JEDNA, ocena mieszka tutaj — dokładnie
 * ten sam układ, co `correctionCandidate.ts` między komendą a podglądem korekty (`A02b`).
 *
 * Podgląd meldujący różnicę, po którym zapis widzi inną, byłby gorszy niż brak podglądu.
 *
 * ══ CZEGO TEN MODUŁ NIE ROBI ══
 * **Nie dotyka rejestru `events`.** Czyta strumień i porównuje go z wierszem projekcji;
 * jedyny zapis w całej rodzinie plików to `SessionsProjectionPort.upsert` w komendzie.
 * Pilnuje tego `test/architecture.test.ts` (`events` append-only w całym `src/`).
 */

import { sheetDay } from '../common/export/daySheetContent.ts';
import { sessionRowFrom } from '../common/mappers/sessionRow.ts';
import type { EventsStorePort, Queryable, SessionsProjectionPort } from '../common/ports.ts';
import type { ProjectionRowDiff } from './contracts/maintenance.ts';
import { projectionDiff } from './mappers/projectionDiff.ts';
import type { MaintenanceAdminPort } from './ports.ts';

/** Porty, których potrzebuje przeliczenie — te same po obu stronach (zapytanie i komenda). */
export interface ProjectionScanPorts {
  maintenance: MaintenanceAdminPort;
  events: EventsStorePort;
  sessions: SessionsProjectionPort;
}

/**
 * Ile ROZJECHANYCH sesji opisuje jeden raport — i, co za tym idzie, ile sesji nadpisuje
 * jeden przebieg zapisu. Jeden limit obsługuje trzy różne rzeczy, bo wszystkie trzy
 * wybuchają na tym samym scenariuszu: zmiana reguły liczenia w wydaniu domeny sprawia,
 * że różni się KAŻDA sesja w bazie (1291 w skali mockupu), a nie „typowo zero albo kilka".
 *
 *  1. **Blokady advisory w JEDNEJ transakcji.** Zapis bierze `pg_advisory_xact_lock`
 *     na każdą nadpisywaną sesję i trzyma ją do COMMIT-u. Domyślny
 *     `max_locks_per_transaction` (64) razy `max_connections` (100) daje ~6400 slotów
 *     we WSPÓLNEJ tablicy blokad całego klastra — 1291 blokad z jednej transakcji zjada
 *     jej piątą część i kończy się realnym `out of shared memory`. 200 to ~3%, więc
 *     zostaje miejsce dla ingestu, który bierze po jednej blokadzie na paczkę.
 *  2. **Czas, przez który zablokowane sesje nie przyjmują zdarzeń.** Każda sesja pod
 *     blokadą jest zamknięta dla telefonów aż do COMMIT-u, czyli — bez limitu — przez
 *     cały ~4-minutowy przebieg. Limit skraca to do ułamka i rozkłada na wywołania,
 *     między którymi ingest ma czas przejść.
 *  3. **Objętość odpowiedzi i tabeli.** Raport bez granicy to kilkumegabajtowy JSON
 *     i tysiące wierszy w jednym renderze — na ekranie, po który sięga się przy awarii.
 *
 * **Limit NIE jest cichy.** `RebuildReport.remaining` mówi, ile zostało; ekran to
 * pokazuje, a administrator uruchamia przebudowę ponownie. To jest ta sama zasada, co
 * `matched`/`truncated` na `A05`: bezpiecznik wolno mieć, udawać całości nie wolno.
 */
export const PROJECTION_DIFF_LIMIT = 200;

export interface ProjectionScan {
  /** Ile sesji znaleziono w REJESTRZE (nie w projekcji — to jest cały sens). */
  sessions: number;
  /** Ile wierszy się rozjechało — liczba PEŁNA, ponad limit raportu. */
  rowsDiffering: number;
  /** Ile pól się rozjechało — również liczba pełna, ponad limit. */
  fieldsDiffering: number;
  /** Najwyżej `PROJECTION_DIFF_LIMIT` pozycji, w kolejności napotkania. */
  diffs: ProjectionRowDiff[];
  /** `rowsDiffering - diffs.length` — ile różnic nie zmieściło się w raporcie. */
  remaining: number;
}

/**
 * Przelicza projekcję KAŻDEJ sesji obecnej w rejestrze i zbiera różnice.
 *
 * Zwraca wyłącznie RAPORT — niczego nie zapisuje i nie bierze blokad. Zapis (razem
 * z szeregowaniem wobec ingestu) należy do komendy, bo tylko ona ma bramę audytu.
 *
 * **Skan idzie do końca nawet po wypełnieniu `diffs`.** Liczby (`rowsDiffering`,
 * `fieldsDiffering`) mają opisywać CAŁY rejestr, a nie okno raportu — inaczej
 * werdykt „2 wiersze się różnią" znaczyłby „2 wiersze zmieściły się w limicie",
 * czyli dokładnie ten rodzaj cichego kłamstwa, który ten ekran ma wykrywać.
 */
export async function scanProjections(
  db: Queryable,
  ports: ProjectionScanPorts,
): Promise<ProjectionScan> {
  const uuids = await ports.maintenance.sessionUuids(db);
  const diffs: ProjectionRowDiff[] = [];
  let rowsDiffering = 0;
  let fieldsDiffering = 0;

  for (const sessionUuid of uuids) {
    const stream = await ports.events.sessionEvents(db, sessionUuid);
    // Rejestr jest źródłem listy, więc pusty strumień znaczy tylko tyle, że sesja
    // zniknęła między zapytaniami — nie ma z czego liczyć projekcji.
    if (stream.length === 0) continue;

    const computed = sessionRowFrom(sessionUuid, stream);
    const stored = await ports.sessions.get(db, sessionUuid);

    const fields = stored == null ? [] : projectionDiff(stored, computed);
    if (stored != null && fields.length === 0) continue;

    rowsDiffering += 1;
    fieldsDiffering += fields.length;
    if (diffs.length < PROJECTION_DIFF_LIMIT) {
      diffs.push({
        sessionUuid,
        aircraftId: computed.aircraftId,
        day: computed.claimTime == null ? null : sheetDay(computed.claimTime),
        // `true` = wiersza projekcji NIE MA w ogóle, choć sesja jest w rejestrze.
        // Najcięższy przypadek dryfu i powód, dla którego listę bierzemy z `events`.
        missing: stored == null,
        fields,
      });
    }
  }

  return {
    sessions: uuids.length,
    rowsDiffering,
    fieldsDiffering,
    diffs,
    remaining: rowsDiffering - diffs.length,
  };
}
