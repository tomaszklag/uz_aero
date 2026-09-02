/**
 * UZ Aero - panel 2.0: KOPERTY ODPOWIEDZI `/admin/api/*` jako własne typy.
 *
 * Dlaczego własne, a nie importowane z serwera: `server/` to workspace z `type: module`,
 * rozszerzeniami `.ts` w importach, typami Fastify i `pg`. Import stamtąd wciągnąłby
 * typy Node'a do bundla przeglądarki i przywiązałby panel do wewnętrznego podziału
 * warstw serwera. **Nigdy nie importujemy z `server/src`** - a kształty odpowiedzi
 * po stronie serwera przybijają jego własne testy tras.
 *
 * Byty domenowe biorzemy jako TYPY z `@uzaero/domain` (`import type`, nigdy wartości).
 *
 * == TEN PLIK OPISUJE TO, CZEGO PANEL 2.0 UZYWA ==
 * Serwer przysyła w tych samych kopertach WIĘCEJ, niż jest tu wymienione: przy kontach
 * `counts`, `scopes`, `daysFrom`/`daysTo` i `flyingDays`, przy flocie `counts`, `scopes`,
 * `claim`, `reading`, `lastEventAt`, `openFlags`. Panel 2.0 świadomie tego nie rysuje
 * (kafle i liczniki chipów opisują klub kilkunastoosobowy, a stan z telefonów to nie
 * konfiguracja) - a TypeScript ignoruje pola nadmiarowe, więc kontrakt zostaje spełniony.
 * Pole dopisuje się tutaj razem z ekranem, który je pokazuje, nigdy „na zapas".
 */

import type {
  Event,
  MhFormat,
  OperationType,
  ServiceStatus,
  SessionState,
  SessionTrackPayload,
} from '@uzaero/domain';

// -- sesja panelu (logowanie, `GET /me`) ----------------------------------------

/**
 * Role kont. LUSTRO `server/src/domain/roles.ts`, przybite `test/mirrors.test.ts`.
 *
 * Kopia, a nie import, bo panel nie widzi wnętrza serwera. Ta kopia NIE DECYDUJE
 * o niczym: mapa rola -> zdolności jest wyłącznie na serwerze i wyłącznie on ją
 * egzekwuje. Tu są nazwy do porównania, nie uprawnienia.
 *
 * `training_lead` wycofany 2026-08-30 (decyzja właściciela produktu, do rewizji
 * w kolejnej iteracji uprawnień). Zostają dwie role, a jedna z nich w ogóle nie
 * dotyczy panelu - więc każdy, kto tu wejdzie, ma dziś komplet zdolności.
 */
export type PilotRole = 'pilot' | 'admin';

/**
 * Zdolności. LUSTRO `server/src/domain/roles.ts`, przybite `test/mirrors.test.ts`.
 *
 * Panel 2.0 pyta o dwie z nich (`accounts.manage`, `fleet.manage`), ale unia musi być
 * KOMPLETNA: zdolność dodana na serwerze i nieznana panelowi zostaje po cichu pominięta
 * przy porównaniu, więc ekran zablokowałby akcję komuś, kto ma uprawnienie.
 */
export type Capability =
  | 'panel.access'
  | 'flags.resolve'
  | 'events.correct'
  | 'accounts.manage'
  | 'fleet.manage'
  | 'thresholds.manage'
  | 'audit.read'
  | 'maintenance.run';

/** Konto zalogowane w panelu - stopka nawigacji i decyzje o widoczności akcji. */
export interface PanelPilotDto {
  id: string;
  code: string;
  name: string;
  role: PilotRole;
}

/**
 * Odpowiedź `POST /admin/api/auth/login` i `GET /admin/api/me` - TEN SAM kształt.
 *
 * Tokenu tu nie ma i być nie może: sesja jedzie ciasteczkiem `HttpOnly`, którego
 * JavaScript panelu nie widzi. To nie jest niedopatrzenie kontraktu, tylko jego treść.
 */
export interface PanelSessionDto {
  pilot: PanelPilotDto;
  capabilities: Capability[];
}

// -- odmowy ---------------------------------------------------------------------

/**
 * Powód odmowy zmiany na koncie (`409 refused`).
 * LUSTRO `AccountRefusal` z `server/src/domain/accountGuards.ts`.
 */
export type PilotRefusalDto =
  | 'self_deactivate'
  | 'self_demote'
  | 'last_admin'
  | 'inactive_account'
  | 'self_delete'
  | 'account_active'
  | 'has_history';

/**
 * Powód odmowy zmiany konfiguracji samolotu (`409 refused`).
 * LUSTRO `FleetRefusal` z `server/src/domain/fleetGuards.ts`.
 *
 * Do 2.0 brakowało tu obu powodów oleju (issue #60) - panel pokazałby wtedy klientowi
 * surowe `oil_min_above_capacity`. Rozjazdu pilnuje odtąd `test/mirrors.test.ts`.
 */
export type FleetRefusalDto =
  | 'capacity_not_positive'
  | 'open_session'
  | 'oil_not_positive'
  | 'oil_min_above_capacity'
  | 'fuel_norm_not_positive'
  | 'initial_negative'
  | 'initial_fuel_over_capacity'
  | 'initial_oil_over_capacity'
  | 'aircraft_in_service'
  | 'has_history';

/** Ciało odmowy z tras panelu - `error` zawsze, reszta zależnie od powodu. */
export interface ApiErrorDto {
  error: string;
  /** 403 z bramy zdolności: KTOREJ zdolności zabrakło. */
  required?: Capability;
  /** 409 `conflict`: KTORE pole jest zajęte - bez tego formularz nie wie, co poprawić. */
  field?: 'code' | 'email' | 'reg';
  /** 409 `refused`: DLACZEGO odmówiono. Odmowa bez powodu każe zgadywać, czy to awaria. */
  reason?: PilotRefusalDto | FleetRefusalDto;
  /**
   * 422 `rule_violation`: naruszenia REGUŁ REJESTRU, po polsku i wprost od domeny.
   *
   * Nie tłumaczymy ich w panelu na własne zdania (inaczej niż odmowy `409 refused`):
   * te komunikaty są autorstwa domeny, czyta je też pilot na telefonie, a druga wersja
   * tego samego zdania rozjeżdża się przy pierwszej poprawce jednej z nich.
   */
  violations?: { code: string; message: string }[];
}

// -- konta pilotów --------------------------------------------------------------

/**
 * Jedno konto - wiersz `GET /admin/api/pilots`.
 *
 * Czego tu NIE MA i nie będzie: **hasła** (w bazie jest hash; jawne hasło istnieje
 * wyłącznie w odpowiedzi, która je wytworzyła) i **ostatniego logowania** (kolumny
 * nie ma w `pilots` i nikt jej nie zapisuje - wyliczenie jej z rotacji tokenów byłoby
 * inną wielkością pod tą samą etykietą).
 */
export interface PilotListItemDto {
  id: string;
  /** Etykieta w arkuszu klubu i przy wyborze drugiego pilota; działa też jako login. */
  code: string;
  name: string;
  /** `null` = konto bez e-maila; pilot loguje się kodem. To normalny stan. */
  email: string | null;
  active: boolean;
  role: PilotRole;
}

/** Lista kont. Bez kursora - klub ma kilkanaście kont, `limit` starcza na komplet. */
export interface PilotPageDto {
  items: PilotListItemDto[];
  /** Ile kont spełnia filtr - także wtedy, gdy `limit` obciął listę. */
  total: number;
}

/**
 * Odpowiedź akcji, która WYTWORZYŁA hasło (założenie konta, reset).
 *
 * `password` widzimy jeden jedyny raz: nie ma go w bazie, nie ma w dzienniku audytu
 * i nie ma trasy „pokaż ponownie". Panel nie ma prawa go nigdzie zapisać - pokazuje
 * i zapomina razem z zamknięciem formularza.
 */
export interface PilotSecretDto {
  pilot: PilotListItemDto;
  password: string;
}

/**
 * Odpowiedź zmiany konta bez hasła.
 *
 * **Wiersza z tej odpowiedzi NIE WSTAWIAMY do tabeli.** Serwer składa go skrótem
 * (`accountToWire` w `server/src/http/routes/admin/pilots.ts`) - mutacja oddaje
 * tożsamość i status konta, którego dotyczyła, a nie jego świeży wiersz listy.
 * Po zapisie unieważniamy listę i prawda przychodzi z niej.
 */
export interface PilotChangeDto {
  pilot: PilotListItemDto;
}

// -- flota ----------------------------------------------------------------------

/**
 * Jedna jednostka - wiersz `GET /admin/api/fleet`.
 *
 * `fuelToleranceL` LICZY SERWER i to jest treść tej trasy: próg flagi rozjazdu paliwa
 * to `max(10 L, 5% pojemności)`, a panelowi wolno importować z `@uzaero/domain` wyłącznie
 * TYPY. Gdyby serwer nie podawał wyniku, panel musiałby trzymać drugą kopię reguły.
 */
export interface AircraftListItemDto {
  id: string;
  /** Znaki na kadłubie - unikalne. Etykieta, nie klucz zdarzeń (te wiążą `id`). */
  reg: string;
  type: string;
  year: number | null;
  capacityL: number;
  /** Efektywny próg rozjazdu paliwa (L) dla tej pojemności - patrz wyżej. */
  fuelToleranceL: number;
  mhFormat: MhFormat;
  dualRequired: boolean;
  serviceStatus: ServiceStatus;
  /** Konfiguracja oleju (issue #60); `null` = nieprowadzony - moduł w telefonie milczy. */
  oilMinL: number | null;
  oilCapacityL: number | null;
  oilNormLPerH: number | null;
  /**
   * Spalanie z instrukcji użytkowania (L na godzinę PRACY SILNIKA, issue #66).
   * Obowiązuje, dopóki aplikacja nie policzy własnej normy z lotów tej maszyny.
   */
  fuelNormLPerH: number | null;
  /**
   * STAN POCZĄTKOWY - co pokazywały przyrządy przy wprowadzeniu jednostki (issue #66).
   * Podpowiedź dla PIERWSZEGO pilota; od pierwszej zdanej sesji nieużywany. Czy jeszcze
   * cokolwiek znaczy, mówi `reading.source`.
   */
  initialMh: number | null;
  initialFuelL: number | null;
  initialOilL: number | null;
  /**
   * Ostatni znany odczyt liczników - `null` = maszyna nie ma ani przekazania, ani
   * wpisanego stanu początkowego.
   */
  reading: AircraftReadingDto | null;
  /** Sesje bez zdania samolotu. Blokują wyłączenie ze służby - i tylko po to tu są. */
  openSessions: number;
}

/**
 * Ostatni znany odczyt jednostki - `source` mówi, czy stan początkowy jeszcze
 * kogokolwiek dotyczy (`handover`/`open_session` = maszynę prowadzą odczyty z lotów,
 * `initial` = pierwszy pilot dostanie to, co wpisano w panelu), a wartości wypełniają
 * pola „Aktualny stan" karty samolotu w trybie odczytu (uwagi do issue #66).
 */
export interface AircraftReadingDto {
  mh: number;
  fuelL: number;
  /** Epoch ms UTC. Przy `source: 'initial'` to chwila ZAPISU W PANELU, nie pomiaru. */
  at: number;
  /** `null` przy `source: 'initial'` - stanu początkowego nikt nie przekazał. */
  byPilotId: string | null;
  byPilotName: string | null;
  /**
   * Ostatni znany stan oleju (L): pomiar + dolewki po nim - SUMĘ liczy serwer, jak
   * `oilAfterL` na liście operacji. `null` = dziennik nie zna ani jednego pomiaru
   * i nie wpisano stanu początkowego oleju.
   */
  oilL: number | null;
  /** Ile z `oilL` to dolewki PO pomiarze - do podpisu pola. `null` razem z `oilL`. */
  oilAddedSinceL: number | null;
  /** Kiedy zmierzono olej - bywa dużo starszy niż `at`. `null` razem z `oilL`. */
  oilAt: number | null;
  source: 'handover' | 'open_session' | 'initial';
}

/** Lista floty. Bez kursora - klub ma kilka jednostek. */
export interface FleetPageDto {
  items: AircraftListItemDto[];
}

/** Odpowiedź zapisu konfiguracji - pełny, świeży wiersz listy (inaczej niż przy kontach). */
export interface AircraftChangeDto {
  aircraft: AircraftListItemDto;
}

/**
 * Próg rozjazdu paliwa rozwiązany dla pojemności, która NIE MUSI być w bazie -
 * odpowiedź `GET /admin/api/fleet/tolerance`.
 *
 * Jedyna droga, którą formularz dostaje liczbę „+/-55 L" dla wpisywanej wartości,
 * zamiast liczyć 5% po swojemu.
 */
export interface AircraftToleranceDto {
  /** `null` = pytanie bez pojemności; próg schodzi wtedy do podłogi 10 L. */
  capacityL: number | null;
  fuelToleranceL: number;
}

// -- dziennik: poziom 1 (flota w zakresie) --------------------------------------

/**
 * Jedna maszyna w zakresie dat - wiersz poziomu 1.
 *
 * Wszystkie liczby SUMUJE SERWER z kolumn projekcji. Panel niczego tu nie dodaje
 * ani nie dzieli - także „ile średnio na godzinę", bo takiej liczby nie zamówiono,
 * a policzona w przeglądarce rozjechałaby się z analityką zużycia.
 */
export interface LogAircraftDto {
  aircraftId: string;
  /** `null` = jednostki nie ma już w rejestrze floty; sesje historyczne zostają. */
  reg: string | null;
  aircraftType: string | null;
  mhFormat: MhFormat | null;

  sessions: number;
  /** Ile sesji jeszcze trwa - to jest jedyny sygnał „ta maszyna lata teraz". */
  openSessions: number;
  /** DNI pracy, nie liczba sesji: dwie zmiany jednego dnia to jeden dzień. */
  activeDays: number;

  flights: number;
  /** Liczniki ZDARZEŃ - z kręgami, więc większe od `flights` (issue #62). */
  takeoffs: number | null;
  landings: number | null;

  blockMs: number;
  flightMs: number;

  fuelAddedL: number | null;
  /** `null` = choć jedna sesja zakresu nie ma bilansu; `fuelUnknownSessions` mówi ile. */
  fuelConsumedL: number | null;
  fuelUnknownSessions: number;
  /** WYŁĄCZNIE dolewki - zużycia oleju nie ma, bo po locie się go nie mierzy. */
  oilAddedL: number | null;
  mhDeltaH: number | null;
  lastEngineStopAt: number | null;
}

export interface LogRangeDto {
  from: string;
  to: string;
  /** `true` = zakresu nie podano i serwer wybrał domyślny. */
  defaulted: boolean;
}

export interface LogReportDto {
  /** Chwila odpowiedzi z zegara SERWERA - panel kotwiczy nią szybkie filtry. */
  at: string;
  range: LogRangeDto;
  aircraft: LogAircraftDto[];
}


// -- dziennik: poziom 2 (sesje jednej maszyny) i poziom 3 (jedna sesja) ---------

/**
 * Jedna sesja - wiersz gridu poziomu 2 (`GET /admin/api/sessions`).
 *
 * Sesja to JEDEN bieg silnika (pivot 2026-08-10): od uruchomienia do zatrzymania,
 * a lotów w niej może być wiele albo ani jednego.
 *
 * == CZASY SA CZTERY I KAZDY ZNACZY CO INNEGO ==
 * `claimedAt`/`closeTime` to PRZEJECIE i ZDANIE maszyny, `engineStartAt`/`engineStopAt`
 * to praca śmigła, a `firstTakeoffAt`/`lastLandingAt` to koperta lotów w środku.
 * Pomylenie ich jest najłatwiejszym błędem tego ekranu: pilot bierze samolot rano,
 * uruchamia po południu, a zdaje wieczorem.
 */
export interface SessionListItemDto {
  sessionUuid: string;
  /**
   * SYGNATURA OPERACJI - „SP-AXA/2026-09-01/AKO/1" (issue #68). Liczy ją SERWER; panel
   * nigdy nie skleja jej u siebie, bo druga konwencja nazw znaczyłaby, że pilot
   * i administrator mówią o jednym locie dwoma napisami.
   *
   * `null` = nie ma jej z czego złożyć (samolot spoza rejestru, operacja bez biegu
   * silnika) - wiersz identyfikuje się wtedy datą, maszyną i godzinami, jak dotąd.
   */
  signature: string | null;
  aircraftId: string;
  reg: string | null;
  aircraftType: string | null;
  mhFormat: MhFormat | null;

  picId: string;
  picCode: string | null;
  picName: string | null;
  dualCode: string | null;
  dualName: string | null;

  /** `voided` = pilot unieważnił CAŁY wpis (issue #62); wiersz zostaje przekreślony. */
  status: 'active' | 'closed' | 'voided';
  operation: OperationType | null;
  client: string | null;

  claimedAt: number | null;
  closeTime: number | null;
  engineStartAt: number | null;
  engineStopAt: number | null;
  firstTakeoffAt: number | null;
  lastLandingAt: number | null;

  departureIcao: string | null;
  /** `null` bywa NORMĄ, nie brakiem: przy skokach drugiego lotniska nie ma z definicji. */
  arrivalIcao: string | null;

  blockMs: number;
  flightMs: number;
  flightsCount: number;
  takeoffCount: number | null;
  landingCount: number | null;

  mhStart: number | null;
  mhEnd: number | null;
  fuelStartL: number | null;
  fuelAddedL: number | null;
  fuelEndL: number | null;
  /** Pomiar oleju z PRZEJĘCIA; po locie oleju się nie mierzy (issue #60). */
  oilLevelL: number | null;
  oilAddedL: number | null;
  /** Stan oleju, z ktorym silnik ruszyl (pomiar + dolewka) - liczy DOMENA, nie panel. */
  oilAfterL: number | null;

  /** Sesja wpisana ręcznie po fakcie - plakietka przy dacie, nie przy wartościach. */
  manualEntry: boolean | null;
  updatedAt: string;
}

/**
 * Strona listy sesji.
 *
 * `nextCursor !== null` znaczy „lista jest PRZYCIĘTA" - i ekran musi to powiedzieć.
 * Lista ucięta po cichu wygląda jak komplet, a to najgorszy tryb awarii narzędzia,
 * które ma odpowiadać na pytanie „co ta maszyna robiła w sierpniu".
 */
export interface SessionPageDto {
  items: SessionListItemDto[];
  nextCursor: string | null;
  total: number;
}

/**
 * Jeden wiersz osi zdarzeń (poziom 3).
 *
 * Oś pokazuje strumień SUROWY - rejestr jest append-only, więc widać w nim wszystko,
 * łącznie ze zdarzeniami unieważnionymi. `Event` bierzemy jako TYP z domeny.
 */
export interface TimelineEntryDto {
  event: Event;
  /** `true` = unieważnione korektą; wiersz jest przekreślony, ale zostaje. */
  voided: boolean;
  /** Czas PO korekcie; `null` = czas zdarzenia jest oryginalny. */
  correctedTime: number | null;
  /** `true` = poprawił to administrator z panelu, a nie pilot w oknie 24 h. */
  adminCorrected: boolean;
}

/**
 * Szczegóły jednej sesji (poziom 3).
 *
 * `state` liczy SERWER (`projectSession`) na żądanie - to jedyne miejsce panelu,
 * w którym tak jest, i dzięki temu karta sesji nie ma jak pokazać innych liczb niż
 * ekran rozliczenia w telefonie.
 */
export interface SessionDetailDto {
  session: SessionListItemDto;
  state: SessionState;
  timeline: TimelineEntryDto[];
}

/**
 * Wynik unieważnienia całej sesji (`POST /sessions/:uuid/void`).
 *
 * `state` liczy SERWER - ta sama zasada, co przy karcie sesji: panel formatuje
 * i nic nie liczy sam.
 */
export interface SessionVoidResultDto {
  sessionUuid: string;
  voidUuid: string;
  recordedAt: string;
  state: SessionState;
  /**
   * O czym uprzedzić PO zapisie: pilot nadal prowadzi tę sesję albo ma otwarte własne
   * okno poprawek. Nie są powodem odmowy - wpis jest już wycofany.
   */
  warnings: { code: string; message: string }[];
  /** Przebudowa karty arkusza; `null` = arkusz nie odpowiedział. */
  reexport: { exported: boolean } | null;
}

/**
 * Ślad GPS sesji (poziom 3).
 *
 * Kształt bierzemy WPROST z domeny, zamiast przepisywać go tutaj na lustro. To nie jest
 * wyłom w zasadzie „DTO panelu ma swoje typy": lustra piszemy dla rzeczy, które panel
 * i serwer mogą rozumieć inaczej (role, powody odmowy) - i wtedy `test/mirrors.test.ts`
 * pilnuje, żeby nie rozjechały się w ciszy. `SessionTrackPayload` jest czymś innym:
 * to KOPERTA TRANSPORTOWA, zaprojektowana jako jeden kształt dla obu odbiorców, i jej
 * kopia w panelu tworzyłaby dokładnie ten rozjazd, przed którym miałaby chronić.
 */
export type SessionTrackDto = SessionTrackPayload;
