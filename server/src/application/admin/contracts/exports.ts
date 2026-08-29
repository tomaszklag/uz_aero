/**
 * UZ Aero (serwer) - KONTRAKT monitora eksportu kart dziennych (`A05`).
 *
 * Wyłącznie typy; jedyny dozwolony import to `@uzaero/domain` (pilnuje
 * `test/architecture.test.ts`). Stąd `ExportOutcomeDto` niżej jest osobną deklaracją,
 * a nie reeksportem `ExportOutcome` z `application/common/export/dayExporter.ts` -
 * kontrakt nie ma prawa sięgnąć do wnętrza serwera, a kształt jest identyczny i przybija
 * go test trasy.
 *
 * ══ DWIE TABELE, DWA RÓŻNE ZADANIA - I EKRAN MA TO POKAZAĆ ══
 * `export_log` jest append-only: każda regeneracja dopisuje wiersz z podbitą rewizją.
 * To jedyny ślad, którym da się wyjaśnić rozjazd między arkuszem a rejestrem.
 * `exported_sheets` trzyma wyłącznie treść BIEŻĄCĄ (UPSERT po `tab`), bo czytelnik linku
 * z ekranu 11 ma widzieć aktualny stan dnia, tak jak widziałby arkusz. Dlatego
 * `AdminExportHistory` niesie N rewizji i JEDNĄ kartę - sklejenie tych dwóch liczb
 * skasowałoby całą treść tego ekranu.
 *
 * ══ CZEGO W TYM KONTRAKCIE ŚWIADOMIE NIE MA ══
 *  1. **Historii PORAŻEK eksportu** („próba 3/6", „następna 14:38", `sheets_write_timeout`
 *     z mockupu). Wiersz `export_log` powstaje DOPIERO po udanym zapisie karty -
 *     odwrotna kolejność pokazywałaby na ekranie 11 link do arkusza, którego nie ma.
 *     Nieudana próba nie zostawia więc śladu NIGDZIE: nie ma tabeli kolejki, licznika
 *     prób ani zapisanej treści błędu. Podanie tych pól wymagałoby najpierw decyzji
 *     o kolejce ponowień (`A11-konserwacja.html`), a nie mappera.
 *  2. **Opóźnienia eksportu wobec `day_close`** („mediana 4 min" z mockupu). `sessions`
 *     nie ma stempla SERWEROWEGO przyjęcia `day_close` - `close_time` jest czasem
 *     zdarzenia z telefonu, a ten bywa starszy od przyjęcia o całą dobę bez zasięgu.
 *     Różnica `exported_at − close_time` nazywałaby się „opóźnieniem eksportu",
 *     a mierzyłaby długość ciszy telefonu.
 *  3. **Stanu „karta nieaktualna"** (`NIEAKTUALNY` z `ANALIZA` A07). Wymagałby porównania
 *     `export_log.exported_at` z `sessions.updated_at`, a to są stemple z DWÓCH RÓŻNYCH
 *     ZEGARÓW: pierwszy nadaje `Clock` aplikacji, drugi `now()` Postgresa. W produkcji
 *     zwykle się zgadzają, w testach różnią o dwa miesiące - czyli własność byłaby
 *     „prawdziwa, dopóki nikt nie sprawdza". Zamknięcie tego uczciwie wymaga znacznika
 *     w `export_log` mówiącego, DO KTÓREGO miejsca strumienia karta została zbudowana
 *     (jedna kolumna, jeden zegar) - czyli decyzji o schemacie, a nie gałęzi w mapperze.
 *     Mockup `A05` tego stanu zresztą nie ma: rozróżnia „W arkuszu" i „Rewizja N",
 *     a jedno i drugie wynika wprost z numeru rewizji.
 *
 * ══ NADPISANIE KARTY PRZEZ DRUGĄ SESJĘ: BYŁO OD 2026-08-01, ZAMKNIĘTE 2026-08-07 ══
 * Nazwa karty niesie DZIEŃ i SAMOLOT, a nie sesję - dwie zamknięte zmiany na tym samym
 * samolocie tego samego dnia (poranna i popołudniowa) budowały więc kartę o tej SAMEJ
 * nazwie, a `exported_sheets` jest po `tab` UPSERT-owane. Druga karta nadpisywała
 * pierwszą. Flaga `aircraft_overlap` tego nie łapała i nie miała prawa łapać: dotyczy
 * sesji NIEZAMKNIĘTYCH, a tu obie były zamknięte poprawnie. Panel umiał ten stan
 * najwyżej NAZWAĆ (`overwrittenBy`), bo scalenie kart było decyzją produktową
 * dotykającą obu końców drutu (konwencja nazw jest lustrem
 * `app/src/ui/screens/syncStatus.ts`).
 *
 * **Decyzja zapadła 2026-08-07: karta jest DOBĄ SAMOLOTU** (§4.7). Zmiana poranna
 * i popołudniowa są WIERSZAMI jednego dokumentu, a rewizja należy do pary (doba,
 * samolot) - więc wada zniknęła z konstrukcji, a nie została opisana. `overwrittenBy`
 * zostaje w kontrakcie z dwóch powodów: dalej ma realną treść dla sesji WYŁĄCZONEJ
 * z karty otwartą flagą (doba idzie dalej bez niej, więc treść pod `tab` przestaje ją
 * opisywać), a poza tym jest sygnalizatorem - zapalenie się go dla dwóch sesji tej samej
 * doby znaczyłoby, że znów powstają dwie karty jednego dokumentu.
 */

/** Powód, dla którego eksporter ODMÓWIŁ zbudowania karty - nie błąd, tylko stan świata. */
export type ExportRefusalDto = 'no_events' | 'session_open' | 'no_preflight' | 'overlap_flag';

/**
 * RODZAJ awarii próby eksportu - jedzie razem z `outcome: null`.
 *
 * Do 2026-08-01 komenda ponowienia łapała KAŻDY wyjątek i zwracała `null`, a panel
 * mówił na to „Adapter arkuszy zgłosił awarię". Czyli `TypeError` w `buildDaySheet`
 * albo przegrany wyścig rewizji (`23505`) były raportowane jako awaria Google - czyli
 * jako rzecz, która „minie sama, spróbuj za chwilę". Administrator dostawał komunikat
 * kierujący dokładnie w złą stronę.
 *
 *  • `sheets_adapter` - rzucił ZAPIS KARTY (`SheetsPort.writeDaySheet`). Znany tryb
 *    awarii: niedostępny Google, padnięta baza kart. Ponowienie za chwilę ma sens.
 *  • `unexpected` - rzuciło cokolwiek innego po naszej stronie. Ponowienie samo z siebie
 *    tego nie naprawi i panel ma tak powiedzieć, zamiast obiecywać, że minie.
 */
export type ExportFailureDto = 'sheets_adapter' | 'unexpected';

/** Wynik próby eksportu - lustro `ExportOutcome` z `application/common/export/dayExporter.ts`. */
export type ExportOutcomeDto =
  | { exported: true; tab: string; revision: number; url: string }
  | { exported: false; reason: ExportRefusalDto };

/**
 * Stan karty dnia - jedyna wielkość tego ekranu, która nie stoi w żadnej kolumnie.
 *
 * Wnioskuje ją serwer (`mappers/exportListItem.ts`) z czterech faktów naraz, żeby panel
 * nie musiał ich składać po swojemu:
 *
 *  • `waiting`    - ta zmiana jeszcze trwa (brak `day_close`). Karta doby powstaje po
 *                   zdaniu samolotu, więc brak własnej rewizji nie jest usterką. Uwaga:
 *                   od 2026-08-07 taka sesja MOŻE być w karcie (wiersz „w toku"), jeśli
 *                   inna zmiana tej doby już maszynę oddała - stan opisuje SESJĘ, a nie
 *                   dokument.
 *  • `blocked`    - otwarta flaga `aircraft_overlap`. Bramka `DayExporter` zawęziła się
 *                   2026-08-07 z całej karty do SESJI: sporna zmiana wypada z karty,
 *                   a doba reszty maszyny idzie do arkusza z adnotacją „Niekompletna".
 *  • `impossible` - sesja bez `session_claim`, czyli bez daty i bez samolotu (rejestr
 *    niekompletny - wg §4.4 nie powinno wystąpić).
 *                   `buildDaySheet` zwraca `null` - karty nie da się nawet NAZWAĆ.
 *  • `missing`    - dzień zamknięty i eksportowalny, a w `export_log` zero wierszy.
 *                   Jedyna droga do tego stanu to AWARIA eksportu: karta jest skutkiem,
 *                   nie warunkiem, więc nieudany zapis nie cofa niczego i nie zostawia
 *                   śladu - ten wiersz jest jedynym miejscem, w którym go widać.
 *  • `current`    - karta jest w arkuszu. Numer rewizji mówi resztę: `1` to pierwszy
 *                   eksport, `> 1` to spóźnione dane albo korekta administratora.
 *
 * Stanu „karta nieaktualna" tu NIE MA - uzasadnienie w nagłówku pliku.
 */
export type ExportState = 'waiting' | 'blocked' | 'impossible' | 'missing' | 'current';

/** Jeden dzień lotny w monitorze eksportu. */
export interface AdminExportListItem {
  sessionUuid: string;

  /**
   * Nazwa karty wg konwencji §4.7 (`YYYY-MM-DD_SP-XXX`), policzona `sheetTabName` -
   * TĄ SAMĄ funkcją, którą eksporter nazywa kartę przy zapisie i którą telefon liczy
   * u siebie na ekranie 11. `null` = sesja bez chwili przejęcia, czyli karty nie da się nazwać.
   *
   * Nazwa jedzie także dla dni jeszcze niewyeksportowanych, bo pytanie tego ekranu
   * brzmi „której karty brakuje", a nie „które karty są".
   */
  tab: string | null;
  /** Dzień karty `YYYY-MM-DD` (UTC z chwili przejęcia); `null` razem z `tab`. */
  day: string | null;
  /** Chwila przejęcia (epoch ms UTC) - kolumna „Dzień". `null` = rejestr bez claimu. */
  claimedAt: number | null;

  aircraftId: string;
  /** `null` = samolotu nie ma już w rejestrze floty; dzień zostaje widoczny. */
  reg: string | null;
  aircraftType: string | null;

  picId: string;
  picCode: string | null;
  picName: string | null;

  /** `active` = brak `day_close` w rejestrze. NIE znaczy „w locie" (patrz `A02`). */
  sessionStatus: 'active' | 'closed';
  state: ExportState;

  /** Ostatnia rewizja karty; `null` = nigdy nie eksportowano. */
  revision: number | null;
  /** ISO 8601 UTC - chwila OSTATNIEJ UDANEJ wysyłki; `null` razem z `revision`. */
  exportedAt: string | null;
  /** Adres karty (`GET /sheets/:tab`); `null` razem z `revision`. */
  sheetUrl: string | null;

  /** Otwarte flagi trzymające kartę poza arkuszem - link „Do flagi" w wierszu. */
  blockingFlagIds: number[];
  /** ISO 8601 UTC - ostatnia przyjęta paczka tej sesji („kiedy ostatni sync"). */
  updatedAt: string;

  /**
   * INNA sesja zapisała kartę o tej samej nazwie PÓŹNIEJ - czyli treść leżąca dziś
   * w `exported_sheets` pod `tab` opisuje tamten dzień pracy, nie ten wiersz.
   *
   * To jest FAKT z dziennika, nie ocena: `export_log` ma wiersz o tym samym `(day,
   * aircraft_id)`, innym `session_uuid` i późniejszym `exported_at`. Powstaje wtedy,
   * gdy jeden samolot ma tego dnia dwie ZAMKNIĘTE zmiany (poranna i popołudniowa) -
   * `sheetTabName` nie niesie sesji, a `exported_sheets` jest UPSERT-owane po `tab`.
   *
   * `null` = ten wiersz jest ostatnim autorem swojej karty (albo karty jeszcze nie ma).
   */
  overwrittenBy: {
    /** Sesja, której eksport nadpisał tę kartę - wiersz ma do niej prowadzić. */
    sessionUuid: string;
    /** ISO 8601 UTC - chwila tamtego, PÓŹNIEJSZEGO zapisu. */
    exportedAt: string;
  } | null;
}

/**
 * Liczniki kafli i chipów `A05`, po jednym na stan.
 *
 * ══ OPISUJĄ CAŁY ZAKRES ZAPYTANIA, NIE WIDOCZNE OKNO ══
 * Do 2026-08-01 liczyła je czysta funkcja nad tablicą, którą trasa i tak zwracała -
 * czyli nad wierszami PO obcięciu `LIMIT`-em. Brzmiało to jak gwarancja („liczba i lista
 * z tej samej tablicy"), a było odwrotnością gwarancji: klub z 250 zamkniętymi dniami
 * dostawał 200 najnowszych, kafel „Bez karty" pokazywał 0, a dzień z awarią eksportu
 * sprzed dziewięciu miesięcy nie był ani widoczny, ani policzony. Monitor, którego
 * jedynym pytaniem jest „czy KAŻDY dzień ma arkusz", odpowiadał o dwustu dniach
 * i milczał o reszcie.
 *
 * Liczby jadą więc drugim zapytaniem BEZ `LIMIT`-u, dokładnie jak `total` w skrzynce
 * flag (`contracts/flags.ts`: „twardy limit i dokładny `total` mówią prawdę o tym, ile
 * jeszcze zostało"). Cena jest jedna i nazwana: stan karty ma teraz DWA wyrażenia -
 * `mappers/exportListItem.ts` (dla wiersza) i `CASE` w adapterze (dla liczenia
 * i zawężania). Rozjazd między nimi pilnuje `test/adminExports.test.ts`, który porównuje
 * liczniki z policzonymi wierszami odpowiedzi i sprawdza, że `?state=X` oddaje dokładnie
 * te dni, które mają `state: 'X'`. Alternatywą było liczenie po obcięciu, czyli ekran,
 * który kłamie - a to nie jest tańsze, tylko ciche.
 */
export interface AdminExportCounts {
  /** Wszystkie dni w zakresie filtra - NIEZALEŻNIE od zawężenia chipem stanu. */
  total: number;
  current: number;
  blocked: number;
  missing: number;
  waiting: number;
  impossible: number;
  /**
   * Karty z rewizją WIĘKSZĄ niż 1 - regeneracje.
   *
   * Liczone WYŁĄCZNIE po numerze rewizji, bez oglądania się na stan: dzień z rewizją 3
   * i otwartą później flagą jest tu tak samo jak dzień z rewizją 3 i kartą w arkuszu.
   * Chip „Rewizje" w panelu zawęża dokładnie tak samo (`eksportyRows.narrowToScope`),
   * więc liczba na chipie jest obietnicą „tyle wierszy zobaczysz po kliknięciu".
   * (Do 2026-08-01 proza w trzech miejscach twierdziła, że chip pyta o `current`
   * i zawęża „wśród kart istniejących" - kod nigdy tak nie działał.)
   */
  revised: number;
  /**
   * Dni, których karta została NADPISANA przez inną sesję tego samego dnia i samolotu
   * (`AdminExportListItem.overwrittenBy`). Wymiar, nie stan - taki dzień ma w dzienniku
   * własne rewizje, więc jest `current`; nadpisana jest TREŚĆ w `exported_sheets`.
   */
  overwritten: number;
}

/**
 * Strona monitora. **Bez kursora i to jest celowe**: ekran jest z natury zawężony do
 * ZAKRESU DAT (mockup wchodzi z `?dni=7`), a zakres w skali klubu to kilkadziesiąt dni
 * lotnych. Kursor keyset dokłada się tam, gdzie lista rośnie bez granicy - dziennik
 * audytu i rejestr zdarzeń. Tu granicę stawia kalendarz.
 *
 * Ale kalendarza panel jeszcze nie ma, a rejestr rośnie - więc `limit` musi być
 * BEZPIECZNIKIEM WIDOCZNYM, nie cichym. Stąd `matched` i `truncated`: lista przycięta
 * po cichu jest najgorszym trybem awarii narzędzia nadzoru, bo wygląda na komplet.
 */
export interface AdminExportPage {
  items: AdminExportListItem[];
  counts: AdminExportCounts;
  /**
   * Ile dni pasuje do zapytania RAZEM z zawężeniem po stanie - także tych, których
   * `limit` nie zmieścił. Bez zawężenia równe `counts.total`.
   */
  matched: number;
  /** `true` = `limit` obciął listę (`matched > items.length`). Ekran ma o tym powiedzieć. */
  truncated: boolean;
}

/** Jedna wysyłka karty - wiersz `export_log`. */
export interface AdminExportRevisionItem {
  revision: number;
  day: string;
  sheetUrl: string;
  /** ISO 8601 UTC - chwila wysyłki wg zegara serwera. */
  exportedAt: string;
}

/**
 * Historia rewizji jednej karty - rozwinięcie wiersza (`GET /admin/api/exports/:uuid`).
 *
 * `sheetRows` to liczba wierszy w `exported_sheets` opisujących tę kartę: 1 albo 0.
 * Jedzie osobno OD `revisions.length` i to jest cała treść tego ekranu - „3 wiersze
 * dziennika, 1 wiersz karty". Gdyby regeneracja nadpisywała wiersz dziennika, nie dałoby
 * się już odpowiedzieć, co widział klub w chwili zamykania miesiąca.
 */
export interface AdminExportHistory {
  sessionUuid: string;
  tab: string | null;
  state: ExportState;
  revisions: AdminExportRevisionItem[];
  sheetRows: number;
  /**
   * Ten sam FAKT, co w wierszu listy (`AdminExportListItem.overwrittenBy`), i jedzie
   * tu z konkretnego powodu: rozwinięcie pokazuje TREŚĆ karty. Gdy inna sesja zapisała
   * ją później, podgląd wyświetla cudzy dzień pod nazwą tego dnia - i musi to
   * powiedzieć, zamiast wyglądać na treść wiersza, który się właśnie kliknęło.
   */
  overwrittenBy: { sessionUuid: string; exportedAt: string } | null;
}

/** Treść karty tak, jak leży w `exported_sheets` - dosłowne wiersze dokumentu. */
export interface AdminSheetPreview {
  tab: string;
  /** `string[][]` - karta jest dokumentem w kształcie Excela, nie projekcją do liczenia. */
  rows: string[][];
  /** ISO 8601 UTC - kiedy treść ostatnio nadpisano. */
  updatedAt: string;
}

/**
 * Odpowiedź `POST /admin/api/exports/:sessionUuid/retry`.
 *
 * **Nieudane ponowienie to POPRAWNA odpowiedź 200 z powodem, nie 500.** Administrator
 * ma zobaczyć, czego brakuje („dzień jeszcze otwarty", „flaga #1046 trzyma kartę"),
 * a nie „coś poszło nie tak" - to jest dokładnie ta chwila, w której człowiek sięga
 * po `UPDATE` w psql.
 *
 * `revisionBefore` i `revisionAfter` stoją obok siebie, bo pytanie po kliknięciu brzmi
 * „czy w arkuszu jest teraz coś nowego". Równe numery przy `exported: true` nie powstają;
 * `revisionAfter: null` znaczy „nic nie wysłano" i wtedy `outcome` nie jest sukcesem.
 *
 * **`outcome: null` znaczy „eksport RZUCIŁ"** - awarię adaptera arkuszy łapiemy tak samo
 * jak ingest (§4.7: karta to skutek, nie warunek) i tak samo jak re-eksport po
 * rozwiązaniu flagi (`ExportAttempt.outcome`). To jest jedyny stan, w którym mockupowa
 * „Błąd regeneracji" ma pokrycie w danych - i widać go WYŁĄCZNIE w odpowiedzi na próbę,
 * bo nieudany eksport nie zostawia po sobie wiersza w żadnej tabeli.
 *
 * Towarzyszy mu ZAWSZE `failure` mówiące, CO rzuciło (`ExportFailureDto`). Sam `null`
 * nie wystarczał: „adapter arkuszy padł" i „nasz kod rzucił `TypeError`" prowadzą
 * człowieka w dwie różne strony, a panel do 2026-08-01 nazywał oba pierwszym z nich.
 */
export interface AdminExportRetryResult {
  sessionUuid: string;
  tab: string | null;
  revisionBefore: number | null;
  revisionAfter: number | null;
  outcome: ExportOutcomeDto | null;
  /** `null` ⟺ `outcome != null`. Rodzaj awarii, gdy próba RZUCIŁA - patrz wyżej. */
  failure: ExportFailureDto | null;
  /** ISO 8601 UTC - chwila próby wg zegara serwera. */
  retriedAt: string;
}
