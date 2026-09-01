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

import type { Handover, OilHandover } from '@uzaero/domain';

import type { AircraftSeed, SessionRow } from './ports.ts';

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
  | 'initial';

export interface HandoverPick {
  handover: Handover;
  source: HandoverSource;
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
): Handover | null {
  return pickHandover(sessions, seed)?.handover ?? null;
}

/**
 * @param seed stan początkowy jednostki (issue #66) - używany WYŁĄCZNIE wtedy, gdy
 *   rejestr nie ma ani jednej zdanej sesji tej maszyny. Argument jest WYMAGANY, nie
 *   opcjonalny: wołający, który go nie ma (bo nie czyta konfiguracji floty), musi
 *   napisać `null` i tym samym zadeklarować, że pierwszy lot maszyny zobaczy „brak
 *   danych". Domyślna wartość zamieniłaby tę decyzję w przeoczenie.
 */
export function pickHandover(
  sessions: readonly SessionRow[],
  seed: AircraftSeed | null,
): HandoverPick | null {
  // Olej jest NIEZALEŻNY od tego, która sesja niesie przekazanie paliwa/MH:
  // pomiar biegnie własnym łańcuchem pomiar→pomiar (issue #60).
  const oil = latestOilHandover(sessions, { seed });

  const closed = sessions
    .filter((s) => s.status === 'closed' && s.mhEnd != null && s.fuelEndL != null)
    .sort((a, b) => (b.mhEnd ?? 0) - (a.mhEnd ?? 0) || (b.closeTime ?? 0) - (a.closeTime ?? 0));
  const closedBase = closed[0];

  /*
   * Zerowe ogniwo łańcucha: wpis z panelu wchodzi DOPIERO przy braku zdanej sesji
   * i tylko z KOMPLETEM pary (paliwo + licznik). Połówka nie jest przekazaniem -
   * `Handover.reading` niesie obie wielkości naraz, a zero udające drugą z nich
   * byłoby gorsze od milczenia (ta sama reguła, co przy filtrze sesji wyżej).
   */
  const seedBase =
    closedBase == null && seed != null && seed.fuelL != null && seed.mh != null
      ? { fuelL: seed.fuelL, mh: seed.mh, at: seed.enteredAt }
      : null;

  if (closedBase == null && seedBase == null) return null;

  // Od czego liczy się „nowsza sesja w toku": zdanie maszyny albo wpis w panelu.
  const baseAt = closedBase != null ? (closedBase.closeTime ?? 0) : seedBase!.at;

  const newerOpen = sessions
    .filter(
      (s) =>
        s.status === 'active' &&
        (s.claimTime ?? 0) > baseAt &&
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
    };
  }

  if (closedBase == null) {
    return {
      handover: {
        reading: { fuelL: seedBase!.fuelL, mh: seedBase!.mh },
        // Nikt tej maszyny nie przekazał - patrz docblock `Handover.byPilotId`.
        byPilotId: null,
        at: seedBase!.at,
        oil,
      },
      source: 'initial',
    };
  }

  return {
    handover: {
      reading: { fuelL: closedBase.fuelEndL!, mh: closedBase.mhEnd! },
      byPilotId: closedBase.picId,
      at: closedBase.closeTime ?? 0,
      oil,
    },
    source: 'handover',
  };
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
