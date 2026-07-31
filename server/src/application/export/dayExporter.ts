/**
 * UZ Aero (serwer) — eksporter dziennej karty arkusza (§4.7).
 *
 * Wołany przez komendę ingest PO transakcji przyjęcia zdarzeń, dla każdej sesji,
 * która po przetworzeniu jest zamknięta. Eksport to SKUTEK przyjęcia danych, nigdy
 * warunek — telefon dostał już 200 i uznał zdarzenia za dostarczone, więc błąd tutaj
 * nie ma prawa niczego cofnąć (wyjątki łapie wołający).
 *
 * Dwie bramki przed zapisem:
 *  • sesja NIEZAMKNIĘTA — dnia w toku nie eksportujemy (karta powstaje po `day_close`);
 *  • OTWARTA flaga `session_overlap` — §4.7: nakładające się sesje trafiają do arkusza
 *    dopiero po rozwiązaniu flagi przez administratora; wcześniejszy zapis utrwaliłby
 *    w dokumencie klubu wersję, o której już wiadomo, że jest sporna.
 *
 * Spóźnione dane do sesji już wyeksportowanej = ponowna budowa karty i NOWY wpis
 * w `export_log` z rewizją +1 (dziennik jest append-only — historia zostaje).
 *
 * Stan liczymy `projectSession` z pełnego strumienia — te same liczby co ekran 10
 * telefonu; projekcja `sessions` nie jest tu potrzebna (i tak trzeba wczytać
 * zdarzenia, żeby zbudować tabelę lotów, a nie tylko sumy).
 */

import { projectSession } from '@uzaero/domain';

import { buildDaySheet, sheetDay } from './daySheetContent.ts';
import type {
  Clock,
  Database,
  EventsStorePort,
  ExportLogPort,
  FlagsPort,
  PilotsPort,
  SheetsPort,
} from '../ports.ts';

/**
 * Wynik próby eksportu. Do przekroju 1 panelu `exportSession` zwracał `void` i milczał
 * o powodzie odmowy — wystarczało to jedynemu wołającemu (ingest ignoruje wynik).
 * Panel musi umieć powiedzieć „arkusz odblokowany · rewizja 2" ALBO „nie da się, bo
 * dzień jest wciąż otwarty", więc powód wraca wartością.
 *
 * **Odmowa NIE jest błędem** — to poprawna odpowiedź o stanie świata. Rzucanie
 * wyjątku zmusiłoby wołającego do rozróżniania „nie było czego eksportować" od
 * „Google padło", a to są dwie zupełnie różne wiadomości.
 */
export type ExportOutcome =
  | { exported: true; tab: string; revision: number; url: string }
  | { exported: false; reason: 'no_events' | 'session_open' | 'no_preflight' | 'overlap_flag' };

export class DayExporter {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    private readonly flags: FlagsPort,
    private readonly exportLog: ExportLogPort,
    private readonly sheets: SheetsPort,
    private readonly pilots: PilotsPort,
    private readonly clock: Clock,
  ) {}

  async exportSession(sessionUuid: string): Promise<ExportOutcome> {
    const stream = await this.events.sessionEvents(this.db, sessionUuid);
    if (stream.length === 0) return { exported: false, reason: 'no_events' };

    const state = projectSession(stream);
    if (!state.closed) return { exported: false, reason: 'session_open' };
    if (state.dutyStart == null || state.aircraftId == null) {
      return { exported: false, reason: 'no_preflight' };
    }

    const open = await this.flags.openForSession(this.db, sessionUuid);
    if (open.some((f) => f.type === 'session_overlap')) {
      return { exported: false, reason: 'overlap_flag' };
    }

    const sheet = buildDaySheet(state, {
      pic: await this.codeOf(state.sessionPicId),
      dual: await this.codeOf(state.dualId),
    });
    // Nieosiągalne przy powyższych bramkach (`buildDaySheet` odmawia dokładnie przy
    // braku duty startu i samolotu) — zostaje jako zawężenie typu, nie jako gałąź
    // do przetestowania.
    if (sheet == null) return { exported: false, reason: 'no_preflight' };

    const { url } = await this.sheets.writeDaySheet(sheet);

    // Wpis do dziennika DOPIERO po udanym zapisie karty — odwrotna kolejność
    // pokazałaby na ekranie 11 link do arkusza, którego nie ma.
    const previous = await this.exportLog.latest(this.db, sessionUuid);
    const revision = (previous?.revision ?? 0) + 1;
    await this.exportLog.append(this.db, {
      sessionUuid,
      day: sheetDay(state.dutyStart),
      aircraftId: state.aircraftId,
      sheetUrl: url,
      revision,
      exportedAt: this.clock.now(),
    });

    return { exported: true, tab: sheet.tab, revision, url };
  }

  /**
   * Nagłówek karty pokazuje KODY pilotów (jak ekrany 10/11), a zdarzenia niosą id.
   * Nieznany id wraca surowy — lepszy techniczny identyfikator niż pusta rubryka
   * w dokumencie klubu.
   */
  private async codeOf(pilotId: string | null): Promise<string | null> {
    if (pilotId == null) return null;
    return (await this.pilots.findById(pilotId))?.code ?? pilotId;
  }
}
