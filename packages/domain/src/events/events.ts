/**
 * UZ Aero - model zdarzenia (docs/_main.md.txt §5.1).
 *
 * Wszystko, co dzieje się w dniu lotnym, jest **zdarzeniem append-only** o wspólnym
 * nagłówku (§5.1) i payloadzie specyficznym dla typu. Payload jest modelowany jako
 * **discriminated union** po polu `type` - dzięki temu po zawężeniu `type` kompilator
 * zna dokładny kształt `payload` (zero rzutowań w projekcjach).
 *
 * Zasady twarde (CLAUDE.md §Offline-first):
 *  - strumień jest append-only - korekta to KOLEJNE zdarzenie, nigdy nadpisanie,
 *  - każde zdarzenie niesie DWA zegary: `deviceTime` (zegar telefonu) + `gpsTime`
 *    (z fixa GPS, null gdy brak) - rozjazd wyłapuje serwer flagą CLOCK_DRIFT (§4.5),
 *  - liczniki fizyczne (FOB, MH) są źródłem prawdy; wartości z serwera to podpowiedź.
 *
 * Uwaga o nullach: kolumny opcjonalne z §5.1 (`dual_id`, `gps_time`, `synced_at`)
 * są tu zawsze OBECNE jako właściwości typu `… | null` - wiersz w bazie zawsze ma
 * te kolumny, a `null` reprezentuje „brak". Dzięki temu projekcje są totalne (bez
 * `undefined`). Skrót `?` z opisu w dokumentacji = `| null` w tym modelu.
 */

import type { EpochMillis } from '../time';

/**
 * Wersja schematu payloadu - bump przy każdej zmianie kształtu payloadów (§5.1).
 *
 * WERSJA 1 = MODEL 2026-08-10 („sesja = jeden bieg silnika"). Licznik wrócił do 1
 * decyzją użytkownika z 2026-08-10: aplikacja nie była nigdzie wdrożona, więc
 * zgodność z wcześniejszymi kształtami (wersja 1 sprzed 2026-08-06 z obowiązkową
 * klamrą; wersja 2 z `leg_close`) została wyrzucona w całości, a kanoniczny dzień
 * 22 JUNE w `app/src/__tests__/projections.test.ts` jest odtąd wzorcem POPRAWNOŚCI
 * tego modelu, nie zgodności ze starym.
 */
export const CURRENT_SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Typy pomocnicze wspólne dla payloadów
// ─────────────────────────────────────────────────────────────────────────────

/** Pozycja z GPS w chwili zdarzenia. Wszystkie pola opcjonalne - GPS bywa niedostępny. */
export interface GpsPosition {
  /** Szerokość geograficzna (stopnie dziesiętne). */
  lat: number;
  /** Długość geograficzna (stopnie dziesiętne). */
  lon: number;
  /** Wysokość n.p.m. (stopy) - z GPS. */
  altitudeFt?: number;
  /** Prędkość względem ziemi (węzły) - z GPS. */
  groundSpeedKt?: number;
  /** Deklarowana dokładność pozycji (metry). */
  accuracyM?: number;
}

/**
 * Rodzaj operacji dnia (§3.1 - siatka kart z ikonami).
 *
 * Katalog jako TABLICA, a typ z niej wyprowadzony - ten sam wzorzec co `FLAG_TYPES`
 * i `PILOT_ROLES`, i z tego samego powodu: od 2026-07-31 wartość wraca z bazy
 * (kolumna `sessions.operation`, projekcja panelu) i filtry panelu muszą znać pełną
 * listę. Sama unia daje typ, ale nie daje ani listy do walidacji wejścia, ani
 * strażnika dla wartości spoza systemu - a przepisanie jej ręcznie w trzecim miejscu
 * byłoby dokładnie tym rozjazdem, który skończył `packages/domain/src/flags.ts`.
 */
export const OPERATION_TYPES = ['skoki', 'ferry', 'egzamin', 'techniczny', 'inne'] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

/** Strażnik wejścia z zewnątrz (kolumna `sessions.operation`, parametr filtra panelu). */
export function isOperationType(value: unknown): value is OperationType {
  return typeof value === 'string' && (OPERATION_TYPES as readonly string[]).includes(value);
}

/** Sposób wykrycia startu/lądowania (§3.3): auto (algorytm GPS) lub manual (pilot). */
export type DetectionMethod = 'auto' | 'manual';

/** Rola w załodze (§decyzja 2026-07-03): PIC prowadzi aplikację, Dual to drugi pilot. */
export type CrewRole = 'pic' | 'dual';

/**
 * Tryb rozpoczęcia/przejęcia sesji (§4.4):
 *  - `free`             - samolot był wolny,
 *  - `takeover_online`  - przejęcie z pełną wiedzą z serwera,
 *  - `takeover_offline` - przejęcie na danych z cache (ostrzeżenie słabsze, §4.4).
 */
export type SessionClaimMode = 'free' | 'takeover_online' | 'takeover_offline';

/** Format odczytu motogodzin - konfiguracja samolotu (§5.4). */
export type MhFormat = 'decimal' | 'hhmm';

/** Odczyt liczników fizycznych: paliwo (L) + motogodziny (wartość liczbowa). */
export interface FuelMhReading {
  /** Fuel on Board - odczyt paliwomierza (litry). */
  fuelL: number;
  /**
   * Motogodziny jako wartość liczbowa (godziny dziesiętne, np. 1238.5).
   * Format wyświetlania (`decimal`/`hhmm`) pochodzi z konfiguracji samolotu (§5.4)
   * i jest sprawą UI - w danych trzymamy zawsze godziny dziesiętne.
   */
  mh: number;
}

/** Wpis korekty odczytu w preflightcie (§3.1 - „Koryguj" z podaniem powodu). */
export interface PreflightCorrection {
  field: 'fuel' | 'mh';
  /** Wartość podpowiedziana (z przekazania/serwera). */
  from: number;
  /** Wartość wpisana przez pilota (staje się źródłem prawdy). */
  to: number;
  reason: string;
}

/** Rozbicie skoczków wg typu - strona przychodowa dnia (§decyzja 2026-07-23, §5.1 `drop`). */
export interface JumperCounts {
  tandem: number;
  aff: number;
  solo: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payloady per typ zdarzenia (§5.1 - kolumna „Payload")
// ─────────────────────────────────────────────────────────────────────────────

/** `session_claim` - tryb przejęcia (wolny / online / offline). */
export interface SessionClaimPayload {
  mode: SessionClaimMode;
  /** Kogo przejmujemy (z cache/serwera), gdy `mode` = takeover_*. */
  previousPicId?: string | null;
  /**
   * Sesja WPISANA RĘCZNIE po fakcie (ekran 15, przebudowa 2026-08-16) - jawny
   * znacznik na zdarzeniu, które sesję zakłada. Jawny, bo nie da się go wywieść:
   * `method: 'manual'` na starcie i lądowaniu niesie też zwykły lot z ręcznymi
   * przyciskami, a heurystyka po stemplach zapisu rozpadłaby się przy pierwszym
   * odtworzeniu rejestru z serwera. Czyta go plakietka „RĘCZNIE" na kafelku sesji
   * (01/12) i w nagłówku rozliczenia (10); pojedyncze wiersze osi znaczników NIE
   * dostają (issue #40 pkt 6 zostaje w mocy - przy wpisie ręcznym świeciłyby
   * wszystkie naraz). `undefined` = zapis z kokpitu.
   */
  manualEntry?: boolean;
}

/** `preflight_confirm` - trasa, operacja, odczyt FOB+MH, korekty z powodem. */
export interface PreflightConfirmPayload {
  operation: OperationType;
  /** ICAO startu (np. „EPKK"). */
  departureIcao?: string | null;
  /** ICAO lądowania planowanego. */
  arrivalIcao?: string | null;
  /*
   * `dutyStart` (czas meldowania) żyło tu do 2026-08-11 i zostało USUNIĘTE razem
   * z całą klamrą służby (issue #23): dzień pilota to lista sesji, godziny „od kiedy"
   * się nie deklaruje. Pole było opcjonalne od §3.6a i ekran 02 go nie wysyłał.
   */
  /** Odczyt liczników na start dnia - początek łańcucha MH (§4.5). */
  reading: FuelMhReading;
  /** Log korekt podpowiedzi (append-only, nie nadpisuje `reading`). */
  corrections?: PreflightCorrection[];
  /**
   * Dual PRZYPISANY CAŁEJ SESJI - pole dodane przy issue #43 (zgłoszenie z urządzenia).
   *
   * Do tej pory drugi pilot żył wyłącznie w NAGŁÓWKU zdarzeń (`Event.dualId`), a to
   * czyni go nieporawialnym: nagłówek opisuje chwilę zapisu, więc „poprawka" musiałaby
   * przepisać go we wszystkich zdarzeniach sesji - czyli złamać append-only. Tu leży
   * FAKT o składzie załogi i to on wygrywa w projekcji, gdy jest obecny.
   *
   * `undefined` (brak pola) = „nikt tego nie deklarował", więc obowiązuje nagłówek -
   * tak wygląda każda sesja sprzed tej zmiany i każda, w której nikt nie poprawiał
   * załogi. `null` = „w tej sesji NIE BYŁO Duala", i jest to deklaracja, nie brak.
   *
   * Nie myl tego z `crew_change`: tamto opisuje zmianę W TRAKCIE („od 11:00 leciał
   * kto inny") i dzieli sesję na odcinki. To pole odpowiada na inne pytanie -
   * „kto leciał TĄ sesją" - i działa wstecz na całość.
   */
  dualId?: string | null;
  /** Klient (operacja Skoki) - wiąże dzień z odbiorcą; dziedziczony przez `drop`. */
  client?: string | null;
  /**
   * Notatka pilota do dnia - wolny tekst, wielolinijkowy (issue #14).
   *
   * Nie jest to drugi „klient" ani pole rozliczeniowe: klient wiąże dzień z odbiorcą
   * i wchodzi do statystyk, notatka opisuje okoliczności („lot z uczniem", „pokaz
   * dla szkoły", „drugi zbiornik nie działa"). Zapisujemy ją razem z preflightem,
   * bo powstaje przy planowaniu dnia i ma być widoczna dla administratora obok
   * pozostałych danych sesji.
   */
  notes?: string | null;
  /** Format MH samolotu - zapamiętany dla spójnego wyświetlania w sesji. */
  mhFormat?: MhFormat;
  /**
   * Pomiar oleju z bagnetu przy przejęciu (L) - issue #60.
   *
   * W FLOW przejęcia (02a) pomiar jest krokiem WYMAGANYM (decyzja 2026-08-27) -
   * bramkę trzyma ekran (`preflightBlocker`), jak przy odczytach paliwa i MH.
   * POLE payloadu pozostaje mimo to opcjonalne, bo strumień musi przyjąć sesje,
   * które pomiaru legalnie nie mają: sprzed modułu oleju i z wpisu ręcznego
   * (ekran 15 - fakt lotu jest cenniejszy niż kompletność formularza).
   * Zdanie samolotu (09b) oleju NIE mierzy - bagnet tuż po locie kłamie; interwał
   * zużycia biegnie pomiar→pomiar przez wiele sesji, z licznikiem MH (`reading.mh`)
   * jako kotwicą rachunku. `undefined`/`null` = pomiaru nie było; zera NIE
   * podstawiamy, bo zero to odczyt.
   */
  oilL?: number | null;
  /**
   * Olej dolany przy przejęciu (L) - para z pomiarem, bo to jedna czynność przy
   * bagnecie: zmierz → jeśli mało, dolej. Stan po dolewce jest RACHUNKIEM
   * (`oilL + oilAddedL`), nie trzecim polem - inaczej niż trójka `refuel`, dzięki
   * czemu korekta `amend` jednej liczby nie rozjeżdża arytmetyki. Dolewka bez
   * pomiaru jest legalna (bagnet gorący, ale wiadomo ile dolano) - ogniwo łańcucha
   * słabsze, lecz prawdziwe. `undefined`/`null` = nie dolewano.
   */
  oilAddedL?: number | null;
  /**
   * Domyślny skład skoczków dla tej sesji (operacja Skoki, 2026-08-17) - ustawiany
   * na kroku „zadanie" (02e), zanim padnie pierwszy `boarding`.
   *
   * Podstawia liczniki KAŻDEGO załadunku bez własnej deklaracji (także po tym, jak
   * `drop` skonsumował poprzedni skład - `boarding` nie dziedziczy z siebie nawzajem,
   * tylko z tego pola) - patrz `boardingInitialJumpers` w `app/`. Nieedytowalny przez
   * `event_correction.amend`: to tylko WARTOŚĆ STARTOWA formularza, a rzeczywisty skład
   * każdego załadunku i zrzutu i tak zapisuje się (i poprawia) własnym zdarzeniem -
   * korekta defaultu z mocą wsteczną nie miałaby czego naprawić w rejestrze.
   * `null`/brak = nie ustawiono, liczniki startują od zera jak dotąd.
   */
  jumperDefaults?: JumperCounts | null;
}

/** `engine_start` - pozycja GPS + elewacja lotniska (baza dla detekcji S/L, §3.3). */
export interface EngineStartPayload {
  position?: GpsPosition | null;
  /** Elewacja lotniska = wysokość GPS w momencie START ENGINE (§3.3, §8 mitygacja). */
  fieldElevationFt?: number | null;
}

/** `engine_stop` - pozycja GPS w chwili wyłączenia. */
export interface EngineStopPayload {
  position?: GpsPosition | null;
}

/**
 * `taxi` - samolot ruszył w kierunku startu.
 *
 * Otwiera każdy lot w logu cyklu (mockup 05: „13:11 · Taxi · 0:13" przed „13:24 · Takeoff").
 * Zdarzenie zapada raz na lot: po uruchomieniu silnika albo zaraz po lądowaniu, gdy
 * samolot kołuje z powrotem.
 *
 * DLACZEGO ZDARZENIE, A NIE SAMA FAZA: faza lotu (`flightPhase`) jest wyliczana z bieżących
 * fixów i znika razem z nimi - po restarcie aplikacji albo w logu dnia nie ma po niej
 * śladu. Czas rozpoczęcia kołowania jest natomiast trwałą informacją: to od niego liczy
 * się czas przygotowania do startu, widoczny w logu jako „0:13".
 *
 * NIE wpływa na czas blokowy ani na czas lotu - te wyznaczają `engine_start`/`engine_stop`
 * i `takeoff`/`landing`. Fałszywe kołowanie dodaje wiersz w logu i nic poza tym, dlatego
 * (inaczej niż start i lądowanie) zapisuje się od razu, bez okna „COFNIJ".
 */
export interface TaxiPayload {
  method: DetectionMethod;
  position?: GpsPosition | null;
}

/**
 * Pola, które umie poprawić akcja `amend` (issue #43).
 *
 * BIAŁA LISTA, nie „dowolny fragment payloadu": korekta musi być czytelna dla wszystkich
 * konsumentów strumienia (projekcja, analityka zużycia, arkusz, panel), a każde pole,
 * które tu wpuszczamy, staje się częścią kontraktu. Dopuszczalność zależy od TYPU CELU
 * i pilnuje tego reguła `CORRECTION_FIELD_NOT_ALLOWED`:
 *  • `fuelL` / `mh` - `preflight_confirm.reading` i `day_close.finalReading`,
 *  • `oilL` / `oilAddedL` - `preflight_confirm` (issue #60; olej żyje tylko przy przejęciu),
 *  • `jumpers`      - `drop.jumpers`.
 *
 * `refuel` świadomie NIE MA `amend`: niesie spójną trójkę before/added/after, więc
 * poprawka jednej liczby rozjechałaby arytmetykę pilnowaną przez `FUEL_ARITHMETIC`.
 * Błędne tankowanie unieważnia się (`void`) i dopisuje na nowo.
 */
export interface CorrectionFields {
  /** Nowy odczyt paliwomierza (litry). */
  fuelL?: number;
  /** Nowy odczyt licznika motogodzin (godziny dziesiętne). */
  mh?: number;
  /** Nowy skład zrzutu; `null` = „skład niepodany" (nie zero), jak w `DropPayload`. */
  jumpers?: JumperCounts | null;
  /**
   * Nowy Dual CAŁEJ sesji (`preflight_confirm.dualId`); `null` = sesja jednoosobowa.
   *
   * Poprawka działa WSTECZ na całą sesję - czas blokowy w całości przypisuje się
   * wskazanej osobie. Zmianę załogi W TRAKCIE opisuje `crew_change`, nie to pole.
   */
  dualId?: string | null;
  /**
   * Nowy pomiar oleju (`preflight_confirm.oilL`, litry); `null` = „pomiaru nie było"
   * (kasowanie omyłkowego wpisu) - wartość, nie brak pola, jak przy notatce.
   */
  oilL?: number | null;
  /** Nowa dolewka oleju (`preflight_confirm.oilAddedL`, litry); `null` = nie dolewano. */
  oilAddedL?: number | null;
  /**
   * Nowa treść notatki (`preflight_confirm.notes`, `manual_log_entry.notes`);
   * `null` = notatkę skasowano.
   *
   * Notatka jest jedyną daną sesji pisaną ZDANIEM, a nie liczbą - i pierwszą, w której
   * literówkę widać gołym okiem. Do issue #43 nie dało się jej poprawić w ogóle: tekst
   * z kroku „zadanie" (02e) wracał do autora dopiero na ekranie sesji, i to wyłącznie
   * do czytania.
   */
  notes?: string | null;
}

/**
 * `session_void` - CAŁA SESJA UNIEWAŻNIONA (uwaga z urządzenia, 2026-08-30: „daj
 * możliwość usunięcia całego lotu").
 *
 * ══ DLACZEGO NOWE ZDARZENIE, A NIE `void` NA PRZEJĘCIU ══
 * Bo domena tego drugiego ODMAWIA i słusznie: `session_claim` jest tożsamością sesji,
 * a jego unieważnienie zostawiłoby strumień bez właściciela. Tak samo
 * `preflight_confirm` i `day_close` - unieważnienie któregokolwiek rozbiłoby sesję
 * w pół i zerwało łańcuch MH (§4.5). Skasowanie CAŁOŚCI jest więc innym faktem niż
 * skasowanie kawałka i musi mieć własny zapis, a nie obejście istniejących reguł.
 *
 * ══ REJESTR ZOSTAJE APPEND-ONLY ══
 * Nic nie znika z bazy. Sesja przestaje się LICZYĆ: wypada z dnia pilota, z historii,
 * z sum i z eksportu - ale jej strumień zostaje, razem z powodem i z tym, kto go
 * dopisał. Administrator ma widzieć, że wpis był i że został wycofany; zniknięcie bez
 * śladu byłoby w rejestrze lotniczym wadą, nie funkcją.
 */
export interface SessionVoidPayload {
  /**
   * Po co unieważniono; `null` = nie podano. OPCJONALNY, jak każdy powód korekty
   * (issue #43): wymagany byłby tarciem w polu, a bez niego administrator patrzący
   * na wycofany wpis nie ma jak się dowiedzieć dlaczego.
   */
  reason: string | null;
  /**
   * KTO unieważnił (issue #81). Do 2026-09-03 pola nie było, bo „telefon nie ma
   * ekranu, na którym różnica »kto wycofał« cokolwiek by zmieniła". Ma od issue #81:
   * unieważnienie z panelu KOŃCZY operację, którą pilot być może właśnie prowadzi -
   * telefon musi je odróżnić od własnego wycofania, żeby zejść z kokpitu, wstrzymać
   * outbox tej operacji i powiedzieć pilotowi, co się stało. Brak pola = `pilot`
   * (własne unieważnienie z arkusza 10L nie musi go wysyłać), jak przy korekcie.
   */
  source?: CorrectionSource;
}

/**
 * `session_close` - ZAKOŃCZENIE OPERACJI PRZEZ ADMINISTRATORA (issue #81, 2026-09-03).
 *
 * ══ DLACZEGO NOWE ZDARZENIE, A NIE `day_close` Z PANELU ══
 * `day_close` jest ZDANIEM samolotu przez pilota: niesie obowiązkowe odczyty
 * (przekazanie dla następnego), a domena pilnuje przy nim, że silnik stoi
 * (`ENGINE_RUNNING_AT_DAY_CLOSE`) i że licznik się nie cofnął (`MH_REGRESSION`).
 * Administrator zamyka operację OSIEROCONĄ - taką, której pilot nie zdał, bo telefon
 * padł, został w kabinie albo nigdy nie odzyskał zasięgu - i o stanie maszyny w tej
 * chwili nie wie nic pewnego: w rejestrze serwera silnik potrafi „pracować" od trzech
 * dni. Zdarzenie z fałszywymi odczytami byłoby zmyśleniem, a poluzowanie twardych
 * reguł `day_close` dla panelu złamałoby zasadę „twarde reguły są w obu trybach
 * IDENTYCZNE" (`writeAuthority.test.ts`). Stąd osobny fakt: „tę operację zakończył
 * administrator" - bez odczytów, z powodem.
 *
 * ══ SKUTKI ══
 *  • projekcja: `closed = true` (maszyna wolna, `activeClaim` jej nie widzi),
 *    `closedByAdmin = true`, `adminCloseReason`; odczyty końcowe zostają `null`,
 *    więc ogniwem łańcucha MH ta operacja NIE jest (`pickHandover` ją pomija) -
 *    stan maszyny ustawia administrator osobną akcją w karcie samolotu;
 *  • okno korekty pilota ZAMYKA SIĘ NATYCHMIAST (`correctionWindow`): operacji
 *    zakończonej administracyjnie pilot już nie poprawia, a jego zaległe zapisy
 *    do niej telefon wstrzymuje w outboksie (§4.9 - „wstrzymane zapisy");
 *  • na telefon wraca przez `GET /me/events` jak każde zdarzenie sesji.
 *
 * Tworzy je WYŁĄCZNIE panel (`commands/sessionClose.ts`); telefon nie ma komendy,
 * która by je składała, a `POST /events` odrzuca je w kopercie. To nie jest reguła
 * domeny (domena nie zna ról) - to własność POWIERZCHNI, jak `source: 'admin'`.
 */
export interface SessionClosePayload {
  /** Powód zakończenia - w panelu WYMAGANY (zamyka się cudzy lot); `null` = nie podano. */
  reason: string | null;
}

/**
 * `event_correction` - poprawka istniejącego zdarzenia (tryb edycji sesji, `design/10e`–`10g`).
 *
 * Rejestr jest append-only, więc korekta NIE edytuje celu: dopisujemy osobne zdarzenie,
 * a oryginalny odczyt zostaje. Projekcja nakłada korekty przed liczeniem (ostatnia
 * wygrywa), serwer scali obie wersje i pokaże poprawkę w arkuszu.
 *
 * Trzy akcje:
 *  • `retime` - zdarzenie zaszło, ale o innej godzinie (GPS wykrył za późno);
 *  • `void`   - zdarzenia NIE BYŁO (przelot nad pasem zaliczony jako lądowanie);
 *  • `amend`  - zdarzenie zaszło i o właściwej godzinie, ale niesie złą WARTOŚĆ
 *               (issue #43: odczyt paliwa i MH przy przejęciu/zdaniu, skład zrzutu).
 *
 * `void` nie usuwa wiersza z rejestru - wyłącza go z projekcji. Dzięki temu „cofnięcie"
 * pomyłki samo jest udokumentowane, a serwer widzi pełną historię decyzji.
 *
 * `reason` jest OPCJONALNY przy każdej akcji (issue #43): wymagany byłby tarciem w polu
 * - pilot poprawia literówkę w minucie, nie pisze uzasadnienia do protokołu - ale gdy
 * jest, administrator patrzący na zmieniony odczyt nie musi dzwonić i pytać. Trafia do
 * historii zmian (`correctionHistory`) i do osi zdarzeń w panelu.
 *
 * `source` mówi, KTO naniósł poprawkę - i jest jedynym sposobem, żeby to w ogóle
 * wiedzieć. Nagłówek zdarzenia niesie `picId` PIC-a sesji także wtedy, gdy korektę
 * zapisał administrator w panelu (single-writer §4.4: do jednej sesji pisze jedna
 * tożsamość, inaczej serwer odrzuciłby zapis jako `WRITER_MISMATCH`). Bez tego pola
 * historia zmian na telefonie pokazywałaby cudzą decyzję pod nazwiskiem pilota.
 * Brak pola = `pilot` - telefon nie musi go wysyłać przy własnych poprawkach.
 */
export type CorrectionSource = 'pilot' | 'admin';

export type EventCorrectionPayload = {
  targetUuid: string;
  reason?: string | null;
  source?: CorrectionSource;
} & (
  | { action: 'retime'; newTime: EpochMillis }
  | { action: 'void' }
  | { action: 'amend'; fields: CorrectionFields }
);

/** `takeoff` - metoda (auto/manual) + pozycja. */
export interface TakeoffPayload {
  method: DetectionMethod;
  position?: GpsPosition | null;
}

/** `landing` - metoda (auto/manual) + pozycja + ewentualne kręgi (touch and go). */
export interface LandingPayload {
  method: DetectionMethod;
  position?: GpsPosition | null;
  /**
   * KRĘGI ZAMKNIĘTE TYM LĄDOWANIEM - ile razy maszyna przyziemiła i wystartowała
   * ponownie MIĘDZY startem tego lotu a tym lądowaniem (uwaga z urządzenia, 2026-08-29).
   *
   * Brak pola i `0` znaczą to samo: zwykły lot, jedno przyziemienie. Wartość > 0
   * pojawia się WYŁĄCZNIE we wpisie ręcznym, gdzie pilot podaje kopertę czasu i liczbę
   * kręgów zamiast wyliczać każdą parę godzin z osobna:
   *
   *   „częściej będzie tak, że podaję godzinę uruchomienia, startu, ostatniego
   *    lądowania i wyłączenia oraz podaję ilość lotów - czyli wykonałem w tym czasie
   *    4 touch and go".
   *
   * ══ DLACZEGO LICZBA, A NIE PIĘĆ PAR GODZIN ══
   * Bo godzin pośrednich nikt nie zmierzył. Podzielenie koperty na równe odcinki dałoby
   * na osi pięć par minut nieodróżnialnych od zapisanych, a arkusz korekty pozwoliłby
   * je „poprawiać" jak fakty. Rejestr mówi więc prawdę o swojej dokładności: jedna
   * koperta czasu, którą pilot podał, i tyle lądowań, ile policzył.
   *
   * ══ DLACZEGO ROŚNIE OD TEGO TAKŻE LICZNIK STARTÓW ══
   * Touch and go JEST lądowaniem, po którym natychmiast następuje start - więc
   * `touchAndGo: 4` znaczy 5 lądowań i 5 startów w tym locie (start otwierający plus
   * cztery po kręgach). Arytmetykę trzyma `projectSession`, nie czytelnicy.
   *
   * ══ DETEKCJA GPS TEGO POLA NIE USTAWIA ══
   * I nie ma potrzeby: w locie automatycznym każdy krąg produkuje własną, PRAWDZIWĄ
   * parę zdarzeń z własnymi godzinami. Pole jest opcjonalne właśnie po to, żeby ścieżka
   * automatyczna liczyła się dokładnie tak, jak przed jego dołożeniem.
   */
  touchAndGo?: number;
}

/** `drop` - numer zrzutu, wysokość, rozbicie skoczków; klient dziedziczony z preflightu. */
export interface DropPayload {
  /** Kolejny numer wyniesienia w dniu (1-based). */
  dropNumber: number;
  /** Wysokość zrzutu (stopy) - średnia z okna GPS (`detection/dropAltitude.ts`). */
  altitudeFt?: number | null;
  /**
   * Skład w rozbiciu na typy (przychód dnia) - OPCJONALNY od issue #21 pkt 5:
   * zrzut jest znacznikiem FAKTU wyniesienia, a raportowanie liczby skoczków bywa
   * odłożone albo pominięte. `null`/brak = „skład niepodany", NIE zero - dokładnie
   * ta sama zasada, co `noFlightReason` (brak ≠ wartość) i `boarding.jumpers`.
   */
  jumpers?: JumperCounts | null;
  /** Klient dziedziczony z `preflight_confirm` (denormalizacja dla arkusza). */
  client?: string | null;
  position?: GpsPosition | null;
}

/**
 * `boarding` - załadunek skoczków na pokład (issue #21 pkt 7).
 *
 * Znacznik FAKTU w logu: skoczkowie weszli na pokład - na ziemi, przed startem serii
 * albo po wykołowaniu z pasa między lotami. Skład jest OPCJONALNY: `null` znaczy
 * „załadunek był, składu nie zadeklarowano" - zero nigdy nie udaje pomiaru.
 *
 * Zadeklarowany skład staje się PREFILL-em arkusza zrzutu (05e): w locie pilot tylko
 * potwierdza gotową listę zamiast klikać liczniki (issue #21 pkt 5). Konsumuje go
 * pierwszy `drop` - projekcja czyści wtedy stan załadunku, bo ci skoczkowie już wyszli.
 */
export interface BoardingPayload {
  /** Skład w rozbiciu na typy; `null`/brak = załadunek bez deklaracji liczby. */
  jumpers?: JumperCounts | null;
}

/** `refuel` - przed / dolano / po + wyliczone zużycie (§3.4). */
export interface RefuelPayload {
  /** Stan przed tankowaniem (L) - podpowiada bieżący FOB. */
  beforeL: number;
  /** Ilość dolana (L). */
  addedL: number;
  /** Stan po tankowaniu (L) - walidacja UI: ≤ capacity_l. */
  afterL: number;
  /** Średnie zużycie L/h od ostatniego tankowania (punkt kontrolny, §3.4). */
  consumptionLPerH?: number | null;
}

/**
 * `oil_add` - dolewka oleju z kokpitu (issue #60, decyzja 2026-08-27: dolewka zdarza
 * się także PO przejęciu, więc sam `preflight_confirm.oilAddedL` nie wystarcza).
 *
 * Jak tankowanie: przy zatrzymanym śmigle, przed uruchomieniem i po wyłączeniu.
 * Inaczej niż tankowanie niesie JEDNĄ liczbę, nie trójkę - poziomu po dolewce nie ma
 * jak uczciwie zmierzyć (silnik zwykle gorący), a rachunek interwału olejowego i tak
 * traktuje dolewkę jako SKŁADNIK, nie granicę (pomiar→pomiar + suma dolewek).
 * Korekty: `retime` i `void`; `amend`-a NIE MA świadomie (parytet z `refuel`):
 * błędną dolewkę unieważnia się i dolewa ponownie - kokpit stoi otwarty do zdania,
 * a po zdaniu służy temu arkusz „Dodaj wpis" (10h).
 */
export interface OilAddPayload {
  /** Ilość dolana (L). */
  addedL: number;
}

/** `crew_change` - rola + pilot schodzący/wchodzący (§3.5). */
export interface CrewChangePayload {
  role: CrewRole;
  /** Pilot schodzący (null przy dodaniu Duala tam, gdzie go nie było). */
  pilotOutId?: string | null;
  /** Pilot wchodzący (null przy usunięciu Duala). */
  pilotInId?: string | null;
}

/** `manual_log_entry` - ręczny wzlot (fallback GPS, §3.8). Czasy w UTC (epoch ms). */
export interface ManualLogEntryPayload {
  offBlock?: EpochMillis | null;
  takeoff?: EpochMillis | null;
  landing?: EpochMillis | null;
  onBlock?: EpochMillis | null;
  notes?: string | null;
}

/**
 * `day_close` - ZDANIE SAMOLOTU: końcowy FOB+MH (przekazanie dla następnego pilota).
 *
 * Nazwa typu jest historyczna i zostaje, bo strumień jest append-only - miliony zdarzeń
 * w bazie nie zmienią nazwy dlatego, że zmieniło się jej znaczenie. Od 2026-08-06 (§3.6)
 * to zdarzenie **nie kończy dnia pilota**, tylko jego pracę z TĄ maszyną: służba liczy się
 * dalej, a kolejny samolot wchodzi do tej samej doby.
 */
/**
 * Powód zdania samolotu BEZ ANI JEDNEGO WZLOTU (ekran 09C) - silnik nie ruszył.
 *
 * Identyfikatory po angielsku, napisy dla pilota składa ekran: ta sama zasada, którą
 * `OperationType` trzyma od issue #13 (`ferry` to identyfikator, nie napis).
 */
export type NoFlightReason = 'weather' | 'malfunction' | 'cancelled' | 'other';

/** Lista powodów (runtime) - walidacja przy odczycie i siatka kart na 09C. */
export const NO_FLIGHT_REASONS: readonly NoFlightReason[] = [
  'weather',
  'malfunction',
  'cancelled',
  'other',
];

export interface DayClosePayload {
  /** Odczyt końcowy = przekazanie dla kolejnego pilota (ogniwo łańcucha MH). */
  finalReading: FuelMhReading;
  /**
   * Powód, dla którego nie było wzlotu - **tylko dla sesji bez cyklu silnika** (09C).
   *
   * Bez niego rejestr mówi „samolot był zajęty 1:15 i nikt nigdzie nie poleciał", co dla
   * administratora jest pytaniem, nie informacją. Pole jest opcjonalne, bo przy sesji ze
   * wzlotami nie ma o co pytać, a strumienie schemaVersion 1 go nie niosą - brak przy
   * sesji bez wzlotu daje miękką flagę (`NO_FLIGHT_WITHOUT_REASON`), nigdy odrzucenie:
   * fakt zajęcia maszyny jest cenniejszy niż kompletność formularza.
   */
  noFlightReason?: NoFlightReason | null;
  /**
   * Komentarz do powodu - OPCJONALNY, wolny tekst (uwaga z urządzenia, 2026-09-03:
   * „może warto dać opcjonalne pole z komentarzem doszczegóławiającym, dlaczego nie
   * wykonano lotu"). Cztery karty powodu odpowiadają na „co", nie na „co dokładnie" -
   * „usterka" bez słowa, KTÓRA, jest dla administratora pytaniem. Pusty tekst nie
   * wchodzi do payloadu (brak klucza = null); pole ma sens tylko przy sesji bez lotu,
   * jak `noFlightReason`.
   */
  noFlightNote?: string | null;
  /*
   * `dutyEnd` (godzina zakończenia służby) żyło tu do 2026-08-11 i zostało USUNIĘTE
   * razem z całą klamrą służby (issue #23) - zdanie samolotu kończy pracę z maszyną,
   * a dzień pilota nie jest bytem, który się zamyka.
   */
}

/*
 * `leg_close` (potwierdzenie wzlotu) ISTNIAŁO tu między 2026-08-06 a 2026-08-10
 * i zostało USUNIĘTE razem z całym pojęciem „wzlotu": sesja = jeden bieg silnika,
 * a jednostką potwierdzenia jest SESJA, zatwierdzana odczytami przy zdaniu
 * (`day_close.finalReading`). Nie ma migracji - aplikacja nie była wdrożona,
 * strumienie z `leg_close` nie istnieją poza testami i demo.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Rejestr typ → payload i typ zdarzenia
// ─────────────────────────────────────────────────────────────────────────────

/** Mapowanie typu zdarzenia na kształt jego payloadu (jedyne źródło prawdy). */
export interface EventPayloadMap {
  session_claim: SessionClaimPayload;
  preflight_confirm: PreflightConfirmPayload;
  engine_start: EngineStartPayload;
  engine_stop: EngineStopPayload;
  taxi: TaxiPayload;
  takeoff: TakeoffPayload;
  landing: LandingPayload;
  drop: DropPayload;
  boarding: BoardingPayload;
  refuel: RefuelPayload;
  oil_add: OilAddPayload;
  crew_change: CrewChangePayload;
  manual_log_entry: ManualLogEntryPayload;
  day_close: DayClosePayload;
  session_void: SessionVoidPayload;
  session_close: SessionClosePayload;
  event_correction: EventCorrectionPayload;
}

/** Unia typów zdarzeń (§5.1). */
export type EventType = keyof EventPayloadMap;

/** Lista wszystkich typów zdarzeń (runtime) - walidacja przy odczycie z bazy. */
export const EVENT_TYPES: readonly EventType[] = [
  'session_claim',
  'preflight_confirm',
  'engine_start',
  'engine_stop',
  'taxi',
  'takeoff',
  'landing',
  'drop',
  'boarding',
  'refuel',
  'oil_add',
  'crew_change',
  'manual_log_entry',
  'day_close',
  'session_void',
  'session_close',
  'event_correction',
];

// ─────────────────────────────────────────────────────────────────────────────
// Zdarzenie (wiersz w tabeli `events`, §5.1 + `synced_at` z §5.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Wspólny nagłówek zdarzenia - pola niezależne od typu (§5.1). */
interface EventHeader {
  /** UUID - klucz idempotencji (dedup na serwerze, §4.1). */
  uuid: string;
  /** Sesja (od `session_claim` do `day_close`). */
  sessionUuid: string;
  /** Samolot. */
  aircraftId: string;
  /** PIC w chwili zdarzenia (jedyny piszący, single-writer §4.1). */
  picId: string;
  /** Dual w chwili zdarzenia (null gdy jednoosobowo). */
  dualId: string | null;
  /** Zegar telefonu (UTC, epoch ms). */
  deviceTime: EpochMillis;
  /** Czas z fixa GPS (UTC, epoch ms) - null gdy brak fixa. */
  gpsTime: EpochMillis | null;
  /** Wersja schematu payloadu. */
  schemaVersion: number;
  /** Znacznik wysyłki: null = w outboxie (§4.3), wartość = potwierdzone przez serwer. */
  syncedAt: EpochMillis | null;
}

/**
 * Zdarzenie jako **discriminated union**: `type` zawęża `payload`.
 * Kształt buduje się mapując `EventPayloadMap` - jedno źródło prawdy dla par typ↔payload.
 */
export type Event = {
  [K in EventType]: EventHeader & { type: K; payload: EventPayloadMap[K] };
}[EventType];

/** Zawężony typ zdarzenia konkretnego rodzaju (np. `EventOf<'refuel'>`). */
export type EventOf<K extends EventType> = Extract<Event, { type: K }>;

// ─────────────────────────────────────────────────────────────────────────────
// Wejście do zapisu (repo wypełnia resztę)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dane do `EventsRepo.appendEvent`. Repo dopełnia:
 *  - `uuid` (v4) - chyba że podany (idempotentny retry),
 *  - `deviceTime` z zegara - chyba że podany (backfill / testy),
 *  - `gpsTime` z ostatniego fixa - chyba że podany jawnie (null = brak fixa),
 *  - `schemaVersion` = CURRENT_SCHEMA_VERSION - chyba że podany,
 *  - `syncedAt` = null (zawsze trafia najpierw do outboxa).
 */
export type AppendEventInput = {
  [K in EventType]: {
    type: K;
    payload: EventPayloadMap[K];
    sessionUuid: string;
    aircraftId: string;
    picId: string;
    dualId?: string | null;
    /** Idempotencja / retry - gdy pominięty, repo generuje v4. */
    uuid?: string;
    /** Nadpisanie zegara telefonu (domyślnie `clock.now()`). */
    deviceTime?: EpochMillis;
    /** Nadpisanie czasu GPS (domyślnie z `clock.gpsTime()`; `null` = jawny brak fixa). */
    gpsTime?: EpochMillis | null;
    /** Nadpisanie wersji schematu (domyślnie CURRENT_SCHEMA_VERSION). */
    schemaVersion?: number;
  };
}[EventType];
