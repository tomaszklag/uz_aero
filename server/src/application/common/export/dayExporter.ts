/**
 * UZ Aero (serwer) - eksporter karty arkusza (§4.7).
 *
 * ══ JEDNOSTKĄ KARTY JEST DOBA SAMOLOTU (decyzja 2026-08-07) ══
 * Do 2026-08-07 kartę budowała JEDNA sesja. Po skróceniu sesji (§3.6a) nazwa
 * `YYYY-MM-DD_SP-XXX` przestała być kluczem unikalnym - w typowym dniu skokowym tą samą
 * maszyną lata dwóch pilotów - więc druga karta nadpisywała pierwszą i podgląd porannej
 * zmiany pokazywał treść popołudniowej. Klub czyta dzień per samolot, nie per zmianę
 * pilota, więc jednostką jest doba, a sesje są jej wierszami (`daySheetContent.ts`).
 *
 * Wołany przez ingest PO transakcji przyjęcia zdarzeń, dla każdej sesji, która po
 * przetworzeniu jest zamknięta. Eksport to SKUTEK przyjęcia danych, nigdy warunek -
 * telefon dostał już 200 i uznał zdarzenia za dostarczone, więc błąd tutaj nie ma prawa
 * niczego cofnąć (wyjątki łapie wołający).
 *
 * ══ DOBĘ WYZNACZA CHWILA PRZEJĘCIA, NIE MELDUNEK ══
 * Przynależność sesji do karty liczymy z `session_claim` (`sessions.claim_time`,
 * decyzja 2026-08-07). Historyczny meldunek (`dutyStart`) najpierw stał się opcjonalny
 * (§3.6a) - oparcie na nim nazwy karty znaczyłoby, że po przebudowie flow nie
 * eksportuje się NIC - a od issue #23 (2026-08-11) nie istnieje w modelu w ogóle:
 * klamra służby odeszła razem z pojęciem służby.
 *
 * ══ TRZY BRAMKI, KAŻDA O CZYMŚ INNYM ══
 *  • **doba bez ani jednej sesji** (`no_events`) - nie ma z czego zrobić karty;
 *  • **żadna sesja doby nie została ZDANA** (`session_open`) - wyzwalaczem karty jest
 *    zdanie samolotu; doba, w której nikt jeszcze nie oddał maszyny, nie ma czego
 *    utrwalać. Wystarczy JEDNA zdana sesja, nie wszystkie: karta wychodzi po każdej
 *    zmianie i jest przebudowywana przy kolejnej;
 *  • **otwarta flaga blokująca** (`overlap_flag`) - ale WYŁĄCZNIE dla sesji nią objętych.
 *    Bramka zawęziła się z całej karty do sesji (§4.7, 2026-08-07): przy krótkich sesjach
 *    nakładki są częstsze, więc blokowanie doby całej maszyny z powodu jednej spornej
 *    zmiany uczyniłoby z bramki stan domyślny. Sesja wstrzymana wypada z karty, a karta
 *    niesie adnotację „Niekompletna".
 *
 * Spóźnione dane do doby już wyeksportowanej = ponowna budowa karty i NOWA rewizja
 * (dziennik jest append-only - historia zostaje).
 *
 * ══ ZNANA DZIURA: DOBA WYCOFANA W CAŁOŚCI (2026-08-31) ══
 * Unieważnienie sesji przebudowuje kartę bez niej. Gdy jednak wycofano JEDYNĄ sesję
 * doby, budować nie ma z czego (`no_events`), a karta zapisana wcześniej ZOSTAJE
 * w arkuszu z nieaktualną treścią. Wyczyszczenie jej wymaga decyzji, czego klub ma
 * się w tym miejscu dowiedzieć (pusta karta? adnotacja „wpis wycofany"?), a zgadywanie
 * treści dokumentu klubu nie jest robotą eksportera.
 *
 * Stan liczymy `projectSession` z pełnego strumienia każdej sesji - te same liczby co
 * ekran 10 telefonu; projekcja `sessions` daje wyłącznie SKŁAD doby (kto, kiedy przejął,
 * czy zdał), bo tabelę lotów i tak trzeba zbudować ze zdarzeń.
 */

import { projectSession, type FlagStatus, type FlagType } from '@uzaero/domain';

import {
  buildDaySheet,
  sheetDay,
  utcDayRange,
  type DaySheetExclusion,
  type DaySheetSession,
} from './daySheetContent.ts';
import type {
  Clock,
  Database,
  DaySheet,
  EventsStorePort,
  ExportLogPort,
  FlagsPort,
  PilotsPort,
  SessionsProjectionPort,
  SheetsPort,
} from '../ports.ts';

/**
 * Typy flag, które TRZYMAJĄ sesję poza kartą doby (§4.7).
 *
 * Lista jest jedna dla całego systemu i stoi przy bramce, która ją egzekwuje. Czytają
 * ją trzy miejsca: sama bramka niżej, kolumna „Skutek" skrzynki panelu
 * (`admin/flagListItem.ts`) i `ORDER BY` tej skrzynki (`pg/admin/flagsRepo.ts` - flagi
 * blokujące idą na górę). Powtórzenie warunku w którymkolwiek z nich dałoby stan,
 * w którym lista mówi „blokuje", a eksporter przepuszcza - i nikt by tego nie zauważył,
 * bo obie strony byłyby „poprawne" osobno.
 */
export const EXPORT_BLOCKING_FLAG_TYPES: readonly FlagType[] = ['aircraft_overlap'];

/** Czy TA flaga trzyma sesję poza kartą doby - status ma znaczenie tak samo jak typ. */
export function blocksExport(flag: { type: FlagType; status: FlagStatus }): boolean {
  return flag.status === 'open' && EXPORT_BLOCKING_FLAG_TYPES.includes(flag.type);
}

/**
 * Wynik próby eksportu. Do przekroju 1 panelu `exportSession` zwracał `void` i milczał
 * o powodzie odmowy - wystarczało to jedynemu wołającemu (ingest ignoruje wynik).
 * Panel musi umieć powiedzieć „arkusz odblokowany · rewizja 2" ALBO „nie da się, bo
 * maszyny nikt tej doby jeszcze nie zdał", więc powód wraca wartością.
 *
 * **Odmowa NIE jest błędem** - to poprawna odpowiedź o stanie świata. Rzucanie
 * wyjątku zmusiłoby wołającego do rozróżniania „nie było czego eksportować" od
 * „Google padło", a to są dwie zupełnie różne wiadomości.
 *
 * Nazwy powodów zostały BEZ ZMIAN przy przejściu na kartę doby, choć ich treść się
 * przesunęła: `ExportRefusalDto` (`admin/contracts/exports.ts`) i klient panelu
 * w `admin/` czytają dokładnie te napisy, a zmiana słownika byłaby osobną decyzją
 * dotykającą obu stron drutu. Co znaczą dzisiaj:
 *  • `no_events`     - doba tej maszyny nie ma ani jednej WAŻNEJ sesji: albo nie ma
 *                      żadnej, albo pytano o sesję spoza projekcji, albo wszystkie
 *                      zostały unieważnione (2026-08-31),
 *  • `no_preflight`  - sesja bez `session_claim`, czyli karty nie da się NAZWAĆ
 *                      (rejestr niekompletny - wg §4.4 nie powinno wystąpić),
 *  • `session_open`  - nikt tej doby jeszcze nie zdał samolotu,
 *  • `overlap_flag`  - ta sesja (albo wszystkie ZDANE sesje doby) jest wstrzymana
 *                      otwartą flagą blokującą.
 */
export type ExportOutcome =
  | { exported: true; tab: string; revision: number; url: string }
  | { exported: false; reason: 'no_events' | 'session_open' | 'no_preflight' | 'overlap_flag' };

/**
 * Rzucił ZAPIS KARTY, czyli `SheetsPort.writeDaySheet` - niedostępny Google, padnięta
 * baza kart, timeout transportu.
 *
 * ══ PO CO OSOBNY TYP BŁĘDU ══
 * Bo bez niego wołający ma do wyboru „złap wszystko" albo „nie łap nic", a oba są złe.
 * Panel łapał wszystko i nazywał to „Adapter arkuszy zgłosił awarię - spróbuj za chwilę"
 * (`admin/commands/exports.ts`), więc `TypeError` w `buildDaySheet` i przegrany wyścig
 * rewizji (`23505`) były raportowane jako awaria Google. Administrator dostawał wtedy
 * komunikat kierujący dokładnie w złą stronę: czekał, zamiast zgłosić błąd.
 *
 * Opakowujemy WYŁĄCZNIE wywołanie portu arkuszy. Wszystko poza nim - projekcja, budowa
 * karty, transakcja rewizji - leci dalej surowe i ma prawo być nieoczekiwane.
 */
export class SheetsAdapterError extends Error {
  constructor(readonly reason: unknown) {
    super('adapter arkuszy odmówił zapisu karty dziennej');
    this.name = 'SheetsAdapterError';
  }
}

export class DayExporter {
  constructor(
    private readonly db: Database,
    private readonly events: EventsStorePort,
    /** Skład doby: które sesje maszyny przejęto w tym dniu i czy zostały zdane. */
    private readonly sessions: SessionsProjectionPort,
    private readonly flags: FlagsPort,
    private readonly exportLog: ExportLogPort,
    private readonly sheets: SheetsPort,
    private readonly pilots: PilotsPort,
    private readonly clock: Clock,
  ) {}

  /**
   * Karta DOBY, do której należy ta sesja - jedyne wejście wołających (ingest, ponowienie
   * z panelu `A05`, re-eksport po rozwiązaniu flagi, korekta administratora).
   *
   * Adres pozostał sesyjny z rozmysłem: wszyscy czterej wołający wiedzą, co się właśnie
   * zmieniło (sesja), a nie którą kartę to dotyka. Przełożenie sesji na dobę jest REGUŁĄ
   * (`claim_time` → `sheetDay`) i ma mieszkać w jednym miejscu, a nie w czterech komendach.
   *
   * Sesja wstrzymana flagą odmawia TU, zamiast cicho przebudować kartę bez siebie:
   * pytanie wołającego brzmi „czy dane tej zmiany są w arkuszu", a odpowiedź
   * „karta ma nową rewizję" byłaby na nie nieprawdziwa.
   */
  async exportSession(sessionUuid: string): Promise<ExportOutcome> {
    const row = await this.sessions.get(this.db, sessionUuid);
    if (row == null) return { exported: false, reason: 'no_events' };
    if (row.claimTime == null) return { exported: false, reason: 'no_preflight' };

    return this.exportDay(sheetDay(row.claimTime), row.aircraftId, sessionUuid);
  }

  /**
   * Buduje i zapisuje kartę doby jednej maszyny.
   *
   * `requiredSession` (opcjonalna) = sesja, w imieniu której przyszło wywołanie; gdy jest
   * wstrzymana flagą, odmawiamy bez zapisu.
   */
  async exportDay(
    day: string,
    aircraftId: string,
    requiredSession?: string,
  ): Promise<ExportOutcome> {
    const all = await this.sessions.listByAircraftDay(this.db, aircraftId, utcDayRange(day));
    if (all.length === 0) return { exported: false, reason: 'no_events' };

    /*
     * SESJA UNIEWAŻNIONA NIE ISTNIEJE DLA KARTY (2026-08-30, dociągnięte 2026-08-31).
     *
     * Odsiewamy ją PRZED wszystkim innym, bo `voided` znaczy „tego lotu nie liczymy" -
     * a nie „liczymy go inaczej". Do 2026-08-31 filtru nie było i skutek był taki, że
     * unieważnienie działało wszędzie poza jedynym miejscem, w którym lot widzi klub:
     * bramki są napisane jako „musi być `closed`", więc wycofana sesja nie WYZWALAŁA
     * eksportu, ale przy karcie budowanej z innego powodu (druga zmiana tej maszyny,
     * ponowienie z panelu) wchodziła do dokumentu jak każda inna.
     *
     * Doba, w której wycofano wszystko, wygląda odtąd jak doba bez sesji (`no_events`) -
     * i tym właśnie jest. Nazwy powodów zostają bez zmian: czyta je panel (`A05`).
     */
    const rows = all.filter((r) => r.status !== 'voided');
    if (rows.length === 0) return { exported: false, reason: 'no_events' };
    // Wyzwalaczem jest ZDANIE SAMOLOTU - wystarczy jedno w całej dobie (§4.7).
    if (!rows.some((r) => r.status === 'closed')) return { exported: false, reason: 'session_open' };

    // Jedno zapytanie o flagi CAŁEJ maszyny zamiast jednego na sesję. Predykat sprawdza
    // też status, choć adapter zwraca wyłącznie otwarte - dzięki temu jest TĄ SAMĄ
    // funkcją, co w skrzynce panelu, gdzie na liście stoją również flagi rozwiązane.
    const blockedBy = new Map<string, number[]>();
    for (const flag of await this.flags.openForAircraft(this.db, aircraftId)) {
      if (!blocksExport(flag)) continue;
      for (const uuid of flag.sessionUuids) {
        blockedBy.set(uuid, [...(blockedBy.get(uuid) ?? []), flag.id]);
      }
    }
    if (requiredSession != null && blockedBy.has(requiredSession)) {
      return { exported: false, reason: 'overlap_flag' };
    }

    const included = rows.filter((r) => !blockedBy.has(r.sessionUuid));
    // Karta złożona wyłącznie z sesji NIEZDANYCH opisywałaby dzień w toku - a to jest
    // dokładnie ten stan, którego §4.7 w dokumencie klubu nie utrwala.
    if (!included.some((r) => r.status === 'closed')) {
      return { exported: false, reason: 'overlap_flag' };
    }

    const sessions: DaySheetSession[] = [];
    for (const row of included) {
      const stream = await this.events.sessionEvents(this.db, row.sessionUuid);
      if (stream.length === 0) continue;
      const state = projectSession(stream);
      sessions.push({
        sessionUuid: row.sessionUuid,
        state,
        crew: {
          pic: await this.codeOf(state.sessionPicId),
          dual: await this.codeOf(state.dualId),
        },
      });
    }

    /* Wykluczoną operację opisujemy jej biegiem silnika i załogą (issue #68), a nie
       uuid-em. Strumienia dla niej NIE wczytujemy - wszystko, czego adnotacja
       potrzebuje, stoi już w wierszu projekcji. */
    const excluded: DaySheetExclusion[] = [];
    for (const row of rows) {
      if (!blockedBy.has(row.sessionUuid)) continue;
      excluded.push({
        sessionUuid: row.sessionUuid,
        engineStartAt: row.engineStartAt,
        engineStopAt: row.engineStopAt,
        pic: await this.codeOf(row.picId),
        flagIds: blockedBy.get(row.sessionUuid) ?? [],
      });
    }

    const sheet = buildDaySheet({ day, aircraftId, sessions, excluded });
    // Nieosiągalne przy powyższych bramkach (`buildDaySheet` odmawia wyłącznie przy
    // pustej liście sesji) - zostaje jako zawężenie typu, nie gałąź do przetestowania.
    if (sheet == null) return { exported: false, reason: 'no_events' };

    const url = await this.write(sheet);

    // Wpis do dziennika DOPIERO po udanym zapisie karty - odwrotna kolejność
    // pokazałaby na ekranie 11 link do arkusza, którego nie ma.
    //
    // Nadanie rewizji jedzie JEDNĄ TRANSAKCJĄ z blokadą na dzienniku TEJ KARTY, bo
    // „odczytaj ostatnią → dodaj jeden → zapisz" jest sekwencją, nie operacją atomową.
    // Bez niej spóźniona paczka z telefonu i kliknięcie „Ponów" w panelu, trafione
    // w tę samą chwilę, zapisywały DWA komplety wierszy z tym samym numerem - a numer
    // rewizji jest jedyną osią, po której da się odtworzyć, co i kiedy poszło do arkusza
    // (pilnuje tego również `UNIQUE (day, aircraft_id, revision,
    // session_uuid)`). Blokada obejmuje ten sam klucz co rewizja: parę (doba, samolot).
    const revision = await this.db.transaction(async (tx) => {
      await this.exportLog.lock(tx, day, aircraftId);
      const next = (await this.exportLog.latestRevision(tx, day, aircraftId)) + 1;
      await this.exportLog.appendCard(tx, {
        day,
        aircraftId,
        sheetUrl: url,
        revision: next,
        exportedAt: this.clock.now(),
        sessionUuids: sessions.map((s) => s.sessionUuid),
      });
      return next;
    });

    return { exported: true, tab: sheet.tab, revision, url };
  }

  /**
   * Zapis karty przez port arkuszy, z awarią NAZWANĄ (`SheetsAdapterError`).
   *
   * Jedyne miejsce w tej klasie, które opakowuje wyjątek - i to jest cała reguła:
   * awaria TRANSPORTU do arkusza jest znanym trybem awarii („minie, spróbuj za chwilę"),
   * a wszystko inne, co może tu rzucić, jest błędem po naszej stronie i nie ma prawa
   * podawać się za tamto.
   */
  private async write(sheet: DaySheet): Promise<string> {
    try {
      return (await this.sheets.writeDaySheet(sheet)).url;
    } catch (err) {
      throw new SheetsAdapterError(err);
    }
  }

  /**
   * Wiersz sesji pokazuje KODY pilotów (jak ekrany 10/11), a zdarzenia niosą id.
   * Nieznany id wraca surowy - lepszy techniczny identyfikator niż pusta rubryka
   * w dokumencie klubu.
   */
  private async codeOf(pilotId: string | null): Promise<string | null> {
    if (pilotId == null) return null;
    return (await this.pilots.findById(pilotId))?.code ?? pilotId;
  }
}
