/**
 * UZ Aero (serwer) - wybór claimu i przekazania z listy sesji samolotu (§4.4–4.5).
 *
 * Wydzielone z zapytania `aircraftState`, bo TE SAME reguły potrzebuje `GET /reference`
 * (audyt: cache referencyjny telefonu ma kolumny `claim_*`/`handover`, które bez tego
 * nigdy by się nie wypełniły). Dwa konsumenci - jedna definicja, zero rozjazdu.
 *
 * ══ DLACZEGO `common/`, A NIE `mobile/` ══
 * Do 2026-08-01 plik leżał w `application/mobile/`, bo obu jego konsumentów miał
 * telefon. Ekran floty panelu (`A07`) pyta o DOKŁADNIE TO SAMO - „kto trzyma samolot"
 * i „jaki jest ostatni znany odczyt" - więc od tej chwili moduł służy obu
 * powierzchniom, a `common/` znaczy w tym repo właśnie to (`CLAUDE.md`, reguła
 * z 2026-07-31). Przepisanie tych reguł drugi raz w adapterze panelu byłoby drugim
 * wyborem przekazania: `latestHandover` idzie po ŁAŃCUCHU MH, a nie po `closeTime`,
 * i to jest dokładnie ten szczegół, który przy kopiowaniu ginie pierwszy.
 *
 * Porządek wyboru przekazania idzie po ŁAŃCUCHU MH (§4.5: „timestampy są drugorzędne"):
 * bazą jest zamknięta sesja z najwyższym `mhEnd` - licznik jest monotoniczny i fizyczny,
 * a zegar telefonu bywa przestawiony (audyt wyłapał wybór po `closeTime`).
 */

import type { Event, EventOf, Handover, HandoverTrailEntry, OilHandover } from '@uzaero/domain';

import type { AdminReading, AircraftSeed, SessionRow } from './ports.ts';

export interface ActiveClaim {
  picId: string;
  since: number | null;
  /**
   * Sesja trzymająca claim. Telefon jej nie potrzebuje (pyta o „kto i od kiedy"),
   * ale panel tak: **wiersz floty `A07` prowadzi z niej wprost na kartę dnia `A02a`**
   * (`#/dni/<sessionUuid>`), a bez claimu - tylko na listę dni zawężoną do jednostki.
   * Bez tego pola link do trwającego dnia musiałby powstać z wyszukiwania po pilocie
   * i dacie, czyli ze zgadywania, którą sesję ma na myśli.
   *
   * Sprostowanie z 2026-08-01: docblock mówił „z kolumny »Claim teraz«" i opisywał
   * przejście, którego przez pierwszy przekrój nie było - przycisk wiersza pojawiał się
   * przy claimie, ale celował w listę dni. Jedyny konsument tego pola to dziś
   * `admin/src/screens/flota/flotaFilters.ts` (`dayLink`).
   */
  sessionUuid: string;
}

/**
 * Claim = sesja niezamknięta. Przy nakładce (dwie otwarte - §4.4) zwracamy świeższą:
 * to ona odpowiada temu, co dzieje się przy samolocie TERAZ; sam konflikt jest już
 * oflagowany i widoczny osobno.
 */
export function activeClaim(sessions: readonly SessionRow[]): ActiveClaim | null {
  const open = sessions
    .filter((s) => s.status === 'active')
    .sort((a, b) => (b.claimTime ?? 0) - (a.claimTime ?? 0));
  const first = open[0];
  return first != null
    ? { picId: first.picId, since: first.claimTime, sessionUuid: first.sessionUuid }
    : null;
}

/**
 * Skąd wzięty jest ostatni odczyt: z zamkniętego dnia (świadome przekazanie) czy
 * z dnia, który jeszcze trwa.
 *
 * Telefonowi to obojętne - dostaje wartości i pokazuje je jako podpowiedź. Panel
 * podpisuje nimi kolumnę („przekazanie · 1 dzień" vs „sesja otwarta", `A07`), a tej
 * różnicy nie da się odczytać z samego `Handover`: ten niesie liczby, nie ich
 * pochodzenie. Stąd druga funkcja obok, a nie drugie przejście po tych samych sesjach
 * w adapterze panelu.
 */
export type HandoverSource =
  | 'handover'
  | 'open_session'
  /**
   * STAN POCZĄTKOWY z panelu (issue #66) - rejestr nie ma czym odpowiedzieć, bo ta
   * maszyna jeszcze nie latała. Panel podpisuje tym kolumnę odczytu, a telefon poznaje
   * ten wariant po `Handover.byPilotId === null`.
   */
  | 'initial'
  /**
   * ODCZYT WPISANY RĘKĄ ADMINISTRATORA (issue #81) - nadrzędny stan z karty samolotu,
   * z komentarzem. Konkurent zdania w łańcuchu MH: wygrał, bo stoi w nim dalej niż
   * ostatnie zdanie (albo równie daleko, a jest późniejszy). Telefon poznaje ten
   * wariant po `Handover.origin === 'admin'`; `byPilotId` jest `null`, bo nikt tej
   * maszyny nie PRZEKAZAŁ - ktoś zdecydował, co pokazują przyrządy.
   */
  | 'admin';

export interface HandoverPick {
  handover: Handover;
  source: HandoverSource;
  /**
   * Sesja, z której pochodzi przekazanie - klucz do dociągnięcia jej strumienia
   * i zbudowania szlaku (`handoverTrail`). `null` przy stanie początkowym z panelu
   * (issue #66) i przy odczycie administratora (issue #81): wpis z panelu nie ma
   * historii, którą dałoby się opowiedzieć.
   */
  sessionUuid: string | null;
  /**
   * Konto administratora, które wpisało odczyt, i jego komentarz - WYŁĄCZNIE przy
   * `source: 'admin'` (panel podpisuje nimi pole „Aktualny stan"). Poza tym `null`.
   */
  enteredBy: string | null;
  note: string | null;
}

/**
 * Ostatnie znane odczyty jako przekazanie (§4.5) - RAZEM z pochodzeniem.
 *
 * Podstawą jest zamknięta sesja NAJDALSZA W ŁAŃCUCHU MH (day_close = świadome
 * przekazanie), ale gdy po niej trwa już kolejny dzień z nowszymi odczytami
 * (tankowanie podbija `fuelLast`), pokazujemy je - preflight ma podpowiadać stan
 * FAKTYCZNY, nie historyczny.
 */
export function latestHandover(
  sessions: readonly SessionRow[],
  seed: AircraftSeed | null,
  override: AdminReading | null,
): Handover | null {
  return pickHandover(sessions, seed, override)?.handover ?? null;
}

/**
 * @param seed stan początkowy jednostki (issue #66) - używany WYŁĄCZNIE wtedy, gdy
 *   rejestr nie ma ani jednej zdanej sesji tej maszyny. Argument jest WYMAGANY, nie
 *   opcjonalny: wołający, który go nie ma (bo nie czyta konfiguracji floty), musi
 *   napisać `null` i tym samym zadeklarować, że pierwszy lot maszyny zobaczy „brak
 *   danych". Domyślna wartość zamieniłaby tę decyzję w przeoczenie.
 * @param override ostatni odczyt wpisany ręką administratora (issue #81) - KONKURENT
 *   zdania samolotu: bazą przekazania zostaje ten, kto stoi dalej w łańcuchu MH
 *   (przy remisie licznika - późniejszy zegarem). Też WYMAGANY, z tego samego powodu.
 */
export function pickHandover(
  sessions: readonly SessionRow[],
  seed: AircraftSeed | null,
  override: AdminReading | null,
): HandoverPick | null {
  // Olej jest NIEZALEŻNY od tego, która sesja niesie przekazanie paliwa/MH:
  // pomiar biegnie własnym łańcuchem pomiar→pomiar (issue #60).
  const oil = latestOilHandover(sessions, { seed, override });

  const closed = sessions
    .filter((s) => s.status === 'closed' && s.mhEnd != null && s.fuelEndL != null)
    .sort((a, b) => (b.mhEnd ?? 0) - (a.mhEnd ?? 0) || (b.closeTime ?? 0) - (a.closeTime ?? 0));
  const closedSession = closed[0];

  /*
   * ODCZYT ADMINISTRATORA KONTRA ZDANIE (issue #81): porządek łańcucha MH, jak wszędzie
   * w tym pliku („timestampy są drugorzędne"). Wpis z wyższym licznikiem niż ostatnie
   * zdanie wyprzedza je; zdanie z wyższym licznikiem - wpis. Przy równym liczniku
   * rozstrzyga zegar, bo obie liczby opisują tę samą chwilę łańcucha i nowsza mówi
   * więcej. Wpis jest zawsze parą (kolumny NOT NULL), więc nie ma tu filtru połówek.
   */
  const closedBase: ChainBase | null =
    closedSession == null
      ? null
      : {
          kind: 'session',
          fuelL: closedSession.fuelEndL!,
          mh: closedSession.mhEnd!,
          at: closedSession.closeTime ?? 0,
          session: closedSession,
        };
  const adminBase: ChainBase | null =
    override == null
      ? null
      : { kind: 'admin', fuelL: override.fuelL, mh: override.mh, at: override.at, reading: override };
  const chainBase = furtherInChain(closedBase, adminBase);

  /*
   * Zerowe ogniwo łańcucha: wpis z panelu wchodzi DOPIERO przy braku zdanej sesji
   * (i braku odczytu administratora) i tylko z KOMPLETEM pary (paliwo + licznik).
   * Połówka nie jest przekazaniem - `Handover.reading` niesie obie wielkości naraz,
   * a zero udające drugą z nich byłoby gorsze od milczenia.
   */
  const base: ChainBase | null =
    chainBase ??
    (seed != null && seed.fuelL != null && seed.mh != null
      ? { kind: 'initial', fuelL: seed.fuelL, mh: seed.mh, at: seed.enteredAt }
      : null);

  if (base == null) return null;

  // Od czego liczy się „nowsza sesja w toku": zdanie maszyny albo wpis w panelu.
  const newerOpen = sessions
    .filter(
      (s) =>
        s.status === 'active' &&
        (s.claimTime ?? 0) > base.at &&
        s.fuelLastL != null &&
        s.mhLast != null,
    )
    .sort((a, b) => (b.claimTime ?? 0) - (a.claimTime ?? 0))[0];

  if (newerOpen != null) {
    return {
      handover: {
        reading: { fuelL: newerOpen.fuelLastL!, mh: newerOpen.mhLast! },
        byPilotId: newerOpen.picId,
        at: newerOpen.claimTime ?? 0,
        oil,
      },
      source: 'open_session',
      sessionUuid: newerOpen.sessionUuid,
      enteredBy: null,
      note: null,
    };
  }

  switch (base.kind) {
    case 'session':
      return {
        handover: {
          reading: { fuelL: base.fuelL, mh: base.mh },
          byPilotId: base.session.picId,
          at: base.at,
          oil,
        },
        source: 'handover',
        sessionUuid: base.session.sessionUuid,
        enteredBy: null,
        note: null,
      };
    case 'admin':
      return {
        handover: {
          reading: { fuelL: base.fuelL, mh: base.mh },
          // Nikt nie PRZEKAZAŁ - ktoś ZDECYDOWAŁ; patrz docblock `Handover.origin`.
          byPilotId: null,
          at: base.at,
          oil,
          origin: 'admin',
        },
        source: 'admin',
        sessionUuid: null,
        enteredBy: base.reading.byPilotId,
        note: base.reading.note,
      };
    case 'initial':
      return {
        handover: {
          reading: { fuelL: base.fuelL, mh: base.mh },
          // Nikt tej maszyny nie przekazał - patrz docblock `Handover.byPilotId`.
          byPilotId: null,
          at: base.at,
          oil,
          origin: 'initial',
        },
        source: 'initial',
        sessionUuid: null,
        enteredBy: null,
        note: null,
      };
  }
}

/** Kandydat na bazę przekazania - ogniwo łańcucha MH z jednego z trzech źródeł. */
type ChainBase =
  | { kind: 'session'; fuelL: number; mh: number; at: number; session: SessionRow }
  | { kind: 'admin'; fuelL: number; mh: number; at: number; reading: AdminReading }
  | { kind: 'initial'; fuelL: number; mh: number; at: number };

/** Które z dwóch ogniw stoi DALEJ w łańcuchu MH; przy remisie licznika - późniejsze. */
function furtherInChain(a: ChainBase | null, b: ChainBase | null): ChainBase | null {
  if (a == null) return b;
  if (b == null) return a;
  if (a.mh !== b.mh) return a.mh > b.mh ? a : b;
  return a.at >= b.at ? a : b;
}

/**
 * SZLAK PRZEKAZANIA (uwaga z urządzenia, 2026-09-02) - historia sesji, z której
 * pochodzi przekazanie, jako ogniwa osi czasu telefonu (`Handover.trail`).
 * Do tej pory pole istniało wyłącznie w typie i w mockupie 02A - serwer nigdy go
 * nie wypełniał, więc „ładna oś zdarzeń" nie miała na telefonie żadnych danych.
 *
 * Ogniwa od najstarszego:
 *  1. `claim`  - przejęcie sesji-źródła: licznik przed włączeniem (`mhStart`)
 *                i paliwo ZASTANE (`fuelStartL`), czyli to, co zostało z POPRZEDNIEGO
 *                przekazania. Dzień bez tankowania opowiada się w całości tym ogniwem
 *                i lotem („mogłem nie tankować, tylko lecieć na paliwie, które
 *                zostało z poprzednika - to powinno wynikać z ostatniego przekazania");
 *  2. `refuel` - każde tankowanie sesji, po czasie zdarzenia (`gpsTime ?? deviceTime`);
 *  3. `flight` - zdanie samolotu: czas blokowy i odczyty końcowe. Tylko dla sesji
 *                ZAMKNIĘTEJ - przekazanie z sesji w toku (`open_session`) kończy
 *                szlak na tankowaniach.
 *
 * Dane, nie zdania (docblock `HandoverTrailEntry`) - formatowanie należy do telefonu.
 * Tankowania wymagają STRUMIENIA sesji (projekcja niesie tylko ich sumę) - wołający
 * dociąga go przez `EventsStorePort.sessionStreams`, jednym zapytaniem dla całej
 * floty (wzorzec analityki, §7.7).
 */
export function handoverTrail(base: SessionRow, events: readonly Event[]): HandoverTrailEntry[] {
  const entries: HandoverTrailEntry[] = [];

  if (base.claimTime != null) {
    entries.push({
      kind: 'claim',
      at: base.claimTime,
      pilotId: base.picId,
      fuelDeltaL: null,
      fuelAfterL: base.fuelStartL,
      mhAfter: base.mhStart,
      durationMs: null,
    });
  }

  const refuels = events
    .filter((e): e is EventOf<'refuel'> => e.type === 'refuel')
    .map((e) => ({ at: e.gpsTime ?? e.deviceTime, pilotId: e.picId, payload: e.payload }))
    .sort((a, b) => a.at - b.at);
  for (const refuel of refuels) {
    entries.push({
      kind: 'refuel',
      at: refuel.at,
      pilotId: refuel.pilotId,
      fuelDeltaL: refuel.payload.addedL,
      fuelAfterL: refuel.payload.afterL,
      mhAfter: null,
      durationMs: null,
    });
  }

  if (base.status === 'closed' && base.closeTime != null) {
    entries.push({
      kind: 'flight',
      at: base.closeTime,
      pilotId: base.picId,
      fuelDeltaL: null,
      fuelAfterL: base.fuelEndL,
      // Czas blokowy, nie sam lot: paliwo schodzi przez cały bieg silnika i to jego
      // mianownikiem posługują się normy (§3.6b) - „latał 1:30" ma znaczyć operację.
      durationMs: base.blockMs,
      mhAfter: base.mhEnd,
    });
  }

  return entries;
}

/**
 * Ostatni znany POMIAR OLEJU floty (issue #60) - materiał podpowiedzi na kroku
 * liczników (`Handover.oil`).
 *
 * Kotwicą jest sesja z pomiarem NAJDALSZA W ŁAŃCUCHU MH (`mhStart` - licznik przy
 * przejęciu, czyli ta sama chwila, w której czyta się bagnet; §4.5: „timestampy są
 * drugorzędne"), a nie najświeższa zegarem. Dolewki zapisane PO pomiarze - para
 * z preflightów bez pomiaru i zdarzenia `oil_add` - wchodzą SUMĄ (`sessions.oil_added_l`
 * niesie jedno i drugie): rachunek telefonu to
 * `oczekiwane = pomiar + dolewki − stawka × ΔMH`. Dolewki sesji-kotwicy też się liczą:
 * padły PO jej pomiarze.
 */
export function latestOilHandover(
  sessions: readonly SessionRow[],
  opts: {
    /**
     * Pytaj o stan NA CHWILĘ, nie o „teraz" (issue #62, szósta tura). Wpis ręczny
     * opisuje czwartek, więc kotwicą ma być pomiar sprzed czwartku, a dolewki liczą się
     * do tej samej granicy - te zapisane później opisują stan, którego pilot wpisujący
     * ten lot nie mógł zastać. Pominięte = cała historia, czyli zachowanie sprzed #62.
     */
    asOf?: number;
    /**
     * Stan początkowy jednostki (issue #66) - kotwica ZASTĘPCZA, gdy żadna sesja nie
     * niesie pomiaru. Wchodzi z `atMh = seed.mh`, bo rachunek oczekiwania kotwiczy się
     * w liczniku, a nie w zegarze (`oilPreflight.expectation()`).
     */
    seed?: AircraftSeed | null;
    /**
     * Odczyt administratora (issue #81) - KONKURENT pomiaru z przejęcia, gdy niesie
     * olej: kotwicą zostaje ten, kto stoi dalej w łańcuchu MH (`override.mh` kontra
     * `mhStart` pomiaru; przy remisie - późniejszy zegarem). Wpis bez oleju nie bierze
     * udziału - kotwica zostaje przy rejestrze. Przy `asOf` liczy się tylko wpis sprzed
     * pytanej chwili, jak sesje.
     */
    override?: AdminReading | null;
  } = {},
): OilHandover | null {
  const inScope =
    opts.asOf == null
      ? sessions
      : sessions.filter((s) => s.claimTime != null && s.claimTime <= opts.asOf!);

  const measured = inScope
    .filter((s) => s.oilLevelL != null)
    .sort(
      (a, b) =>
        (b.mhStart ?? -Infinity) - (a.mhStart ?? -Infinity) ||
        (b.claimTime ?? 0) - (a.claimTime ?? 0),
    );
  const anchor = measured[0];

  const override =
    opts.override != null &&
    opts.override.oilL != null &&
    (opts.asOf == null || opts.override.at <= opts.asOf)
      ? opts.override
      : null;

  /*
   * ODCZYT ADMINISTRATORA WYGRYWA, gdy stoi dalej w łańcuchu niż pomiar z przejęcia
   * (albo równie daleko, a jest późniejszy) - lub gdy pomiaru nie ma wcale. Dolewki
   * „za" wpisem liczą się po liczniku przejęcia, a przy jego braku po zegarze - tą samą
   * regułą, którą liczy się sesje za kotwicą-pomiarem.
   */
  const overrideWins =
    override != null &&
    (anchor == null ||
      (anchor.mhStart ?? -Infinity) < override.mh ||
      ((anchor.mhStart ?? -Infinity) === override.mh && (anchor.claimTime ?? 0) <= override.at));
  if (override != null && overrideWins) {
    const after = (s: SessionRow): boolean =>
      s.mhStart != null ? s.mhStart > override.mh : (s.claimTime ?? 0) > override.at;
    return {
      levelL: override.oilL!,
      atMh: override.mh,
      at: override.at,
      byPilotId: null,
      addedSinceL: inScope.filter(after).reduce((sum, s) => sum + (s.oilAddedL ?? 0), 0),
    };
  }

  /*
   * Bez ani jednego pomiaru kotwicą jest wpis z panelu. Dolewki zapisane po nim liczą
   * się SUMĄ ze wszystkich sesji w zakresie - każda jest „za kotwicą", bo kotwica
   * poprzedza pierwszy lot maszyny z definicji.
   */
  if (anchor == null) {
    const seed = opts.seed;
    if (seed?.oilL == null) return null;
    return {
      levelL: seed.oilL,
      atMh: seed.mh,
      at: seed.enteredAt,
      byPilotId: null,
      addedSinceL: inScope.reduce((sum, s) => sum + (s.oilAddedL ?? 0), 0),
    };
  }

  // Sesja „za kotwicą" w łańcuchu: po liczniku, a przy remisie/braku - po zegarze.
  const chainAfter = (s: SessionRow): boolean => {
    if (s.mhStart != null && anchor.mhStart != null && s.mhStart !== anchor.mhStart) {
      return s.mhStart > anchor.mhStart;
    }
    return (s.claimTime ?? 0) > (anchor.claimTime ?? 0);
  };
  const addedAfter = inScope
    .filter((s) => s.sessionUuid !== anchor.sessionUuid && chainAfter(s))
    .reduce((sum, s) => sum + (s.oilAddedL ?? 0), 0);

  return {
    levelL: anchor.oilLevelL!,
    atMh: anchor.mhStart,
    at: anchor.claimTime ?? 0,
    byPilotId: anchor.picId,
    addedSinceL: (anchor.oilAddedL ?? 0) + addedAfter,
  };
}

/**
 * Znacznik zmienności stanu sesji - składnik ETagu `/reference`. Bez niego 304
 * zamrażałoby claimy: flota się nie zmienia, ale przejęcia i zamknięcia dni tak.
 */
export function sessionsStamp(sessions: readonly SessionRow[]): string {
  let newest = 0;
  for (const s of sessions) {
    if ((s.claimTime ?? 0) > newest) newest = s.claimTime ?? 0;
    if ((s.closeTime ?? 0) > newest) newest = s.closeTime ?? 0;
  }
  return `${sessions.length}-${newest}`;
}
