/**
 * UZ Aero — model widoku ekranu 01 „Mój dzień" (`design/01-moj-dzien.html`, §3.6a).
 *
 * Czysta warstwa między projekcją służby (`projectDuty`) a widokiem: bierze `DutyDay`
 * i oddaje gotowe napisy oraz stany, których ekran nie musi już wyliczać. Zero React,
 * zero zegara systemowego — `now` podaje wołający, tak jak w `liveBlockTimeMs`.
 *
 * REGUŁA, KTÓRĄ TEN MODUŁ CZYNI WIDOCZNĄ: służba jest KLAMRĄ wokół wzlotów, nie ich
 * kontenerem. Dlatego każda z dwóch godzin klamry niesie ze sobą informację, SKĄD się
 * wzięła — „poprawione" (deklaracja pilota) albo „z pierwszego wzlotu" (wyliczone).
 * Bez tego rozróżnienia ekran pokazywałby dwie identyczne liczby o zupełnie różnym
 * statusie, a pilot nie wiedziałby, czy ma co poprawiać.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * BRAKUJĄCY NOŚNIK DEKLARACJI (audyt 2026-08-08) — czytaj, zanim dopiszesz tu ołówek.
 *
 * Mockupy 01, 01A i 01B mają `.edit-btn` przy OBU wierszach klamry i arkusz godziny
 * (`design-notes.md`, „Klamra służby — meldunek i koniec"). Aplikacja umie dziś
 * zadeklarować tylko KONIEC i tylko przy zdawaniu maszyny, bo klamra jedzie w dwóch
 * opcjonalnych polach istniejących payloadów (§5.1): `preflight_confirm.dutyStart`
 * powstaje raz, w chwili przejęcia (drugiego preflightu nie wolno dopisać —
 * `PREFLIGHT_ALREADY_CONFIRMED`), a `day_close.dutyEnd` raz, przy zdaniu.
 *
 * Deklaracja „po fakcie" z §3.6a — a to jest jej JEDYNA przewidziana postać — nie ma
 * więc czym pojechać: po zdaniu samolotu sesja przyjmuje wyłącznie korekty
 * (`CORRECTION_EVENT_TYPES`), a doba bez ani jednej sesji (mockup 01A, ołówek meldunku
 * CZYNNY) nie ma nawet nagłówka zdarzenia, bo ten wymaga `session_uuid` i `aircraft_id`.
 * Stąd `BracketOrigin.declared` dla meldunku i `BracketVm.editable` dla wiersza meldunku
 * są dziś nieosiągalne z aplikacji — pojawiają się wyłącznie na strumieniach
 * `schemaVersion 1` i z korekt administratora.
 *
 * To NIE jest niedoróbka tego pliku ani rzecz do „dorobienia po cichu": wymaga decyzji
 * o nośniku (patrz raport audytu 2026-08-08).
 */

import { dateTimeUtcShort, duration, timeLocal, timeUtc } from '../../format';
import { CORRECTION_WINDOW_MS } from '../../../domain';
import type { DutyDay, DutySession, EpochMillis } from '../../../domain';

/** Skąd wzięła się godzina klamry — decyduje o podpisie i kolorze na ekranie. */
export type BracketOrigin =
  /** Pilot zadeklarował ją sam (arkusz godziny na 01). */
  | 'declared'
  /** Wyliczona z pierwszego/ostatniego wzlotu doby. */
  | 'derived'
  /** Nie ma jeszcze ani deklaracji, ani wzlotu. */
  | 'pending'
  /** Służba trwa — koniec ustali się na ostatnim wzlocie. */
  | 'running';

export interface BracketVm {
  /** Duża wartość: „07:10", „— : —" albo „TRWA". */
  value: string;
  /** Czas lokalny obok UTC — WYŁĄCZNIE tutaj (reguła strefy czasowej, CLAUDE.md). */
  localTime: string | null;
  /** Podpis mówiący, skąd ta godzina pochodzi. */
  hint: string;
  origin: BracketOrigin;
  /**
   * Czy tę godzinę da się teraz ustalić.
   *
   * Dla KOŃCA klamry odpowiada na pytanie „czy jest co domykać": pusta doba nie ma czego
   * (mockup 01A rysuje ten ołówek wygaszony — „Nie ma jeszcze czego domykać"), a doba
   * z pracującym silnikiem jeszcze nie ma. Czyta to `closeDayBlocker`.
   *
   * Dla MELDUNKU pole czeka na nośnik deklaracji (nota na górze pliku) — ekran nie rysuje
   * jeszcze tego ołówka, bo nie miałby czego zapisać.
   */
  editable: boolean;
}

export interface SessionRowVm {
  /**
   * Sesja, którą wiersz opisuje. Bez niej wiersz wie „kiedy", ale nie wie, KTÓRY
   * strumień otworzyć — a ślad (14) i korekta (04c) działają na konkretnej sesji.
   */
  sessionUuid: string;
  /** Numer w dobie — ciągiem przez samoloty, tak jak numeruje mockup. */
  index: number;
  /** „08:12 → 09:05" albo „13:40 → …" dla biegu jeszcze otwartego. */
  times: string;
  /** Liczba lotów sesji — kolumna „Loty" z mockupu 01 (model 2026-08-10). */
  flightsLabel: string;
  blockLabel: string;
  flightLabel: string;
}

/**
 * Grupa sesji jednej maszyny — CIĄGŁA w czasie, nie zbiorcza.
 *
 * Pilot, który wziął SP-AXA, potem SP-KLM, a potem znów SP-AXA, zobaczy TRZY grupy,
 * nie dwie. Dzień czyta się jako oś czasu i scalanie odległych odcinków w jedną kartę
 * kłamałoby o przebiegu dnia — a przy okazji uniemożliwiało pokazanie, kiedy maszyna
 * była zdana.
 */
export interface SessionGroupVm {
  aircraftId: string;
  /** Ostatnia sesja tej maszyny w grupie — adres rozliczenia (10). */
  sessionUuid: string;
  sessions: SessionRowVm[];
}

/**
 * Terminy okien korekty na wariancie 01B — **DWA, nie jedno** (§3.6a, 2026-08-07).
 *
 * Klamra służby i dane sesji to różne fakty o różnych momentach powstania, więc mają
 * osobne zegary. Ekran nie może obiecywać jednej daty dla wszystkiego: sesja zdana
 * rano wygasa wcześniej niż klamra domknięta wieczorem.
 */
export interface CorrectionWindowVm {
  /** „7 SIE 15:40" — 24 h od zamknięcia DNIA (deklaracji końca klamry). */
  dutyDeadline: string;
  /**
   * Sesja, której okno zamknie się PIERWSZE — z godziną startu (żeby pilot wiedział,
   * o którą chodzi) i terminem. `null`, gdy doba nie ma ani jednej zdanej sesji.
   *
   * Kotwicą jest ZDANIE samolotu (`day_close`, model 2026-08-10) — nie kolejność
   * lotów: sesja poranna zdana późno wygasa później niż popołudniowa zdana od ręki.
   */
  firstToExpire: { startedAt: string; deadline: string } | null;
}

export interface MyDayVm {
  start: BracketVm;
  end: BracketVm;
  groups: SessionGroupVm[];
  /**
   * Okno korekty — WYŁĄCZNIE dla dnia zamkniętego deklaracją (`01B`). Dzień w toku
   * niczego nie odlicza: klamra jeszcze się nie ustaliła, więc nie ma od czego liczyć
   * 24 h (§3.6a — niezamknięty dzień domyka się sam na ostatnim wzlocie).
   */
  correction: CorrectionWindowVm | null;
  /** Sumy doby — `null` tam, gdzie nie ma czego liczyć („— —", nigdy zero). */
  totals: {
    duty: string | null;
    block: string | null;
    flight: string | null;
    takeoffs: number;
    landings: number;
    aircraftCount: number;
  };
  sessionCount: number;
  /** Czy dzień jest pusty (ani sesji, ani deklaracji) — wariant 01A. */
  empty: boolean;
}

const DASH = '— —';

/**
 * Buduje model widoku ekranu 01.
 *
 * @param duty projekcja służby (`projectDuty`),
 * @param now  „teraz" do liczenia trwającej służby; podaje wołający.
 *
 * Parametru „trzymana maszyna" już nie ma (2026-08-10): kokpit jest modalny, więc
 * pilot z maszyną w ręce nie ogląda tego ekranu — stan „w ręce" był nieosiągalny.
 */
export function buildMyDay(duty: DutyDay, now: EpochMillis): MyDayVm {
  const groups = groupContiguously(duty.sessions);
  const empty =
    duty.sessions.length === 0 && duty.declaredStart == null && duty.declaredEnd == null;
  const end = endBracket(duty);

  return {
    start: startBracket(duty),
    end,
    groups,
    correction: end.origin === 'declared' ? correctionWindows(duty) : null,
    totals: {
      duty: dutyTotal(duty, now),
      block: duty.sessions.length > 0 ? duration(duty.blockTimeMs) : null,
      flight: duty.sessions.length > 0 ? duration(duty.flightTimeMs) : null,
      takeoffs: duty.takeoffCount,
      landings: duty.landingCount,
      // Liczba maszyn doby zasila podpis „2 samoloty" pod sumą bloku. Widok NIE ma tego
      // liczyć sam — `Set` w JSX byłby dokładnie tym obliczeniem, którego tu unikamy.
      aircraftCount: duty.aircraftIds.length,
    },
    sessionCount: duty.sessions.length,
    empty,
  };
}

/** „— —" zamiast liczby, gdy nie ma czego pokazać (ta sama zasada co na 01A). */
export function totalLabel(value: string | null): string {
  return value ?? DASH;
}

/**
 * Powód, dla którego „ZAMKNIJ DZIEŃ" nie zadziała; `null` = można zamykać.
 *
 * Trzeci warunek jest OGRANICZENIEM MODELU, nie regułą produktu, i tak trzeba go czytać:
 * klamra służby jedzie wyłącznie w `day_close.dutyEnd` (§5.1 — „dwie opcjonalne klamry
 * w istniejących payloadach"), a `day_close` powstaje tylko przy zdawaniu maszyny. Pilot,
 * który samolot już zdał, nie ma dziś CZYM zadeklarować końca służby; do 2026-08-08
 * przycisk prowadził go wtedy na ekran „NIE TRZYMASZ SAMOLOTU", czyli w ślepy zaułek.
 * Powód zamiast zaułka jest naprawą doraźną — właściwa wymaga nośnika deklaracji
 * niezwiązanego z sesją (decyzja właściciela projektu, patrz raport audytu 2026-08-08).
 */
export function closeDayBlocker(vm: MyDayVm, holdsAircraft: boolean): string | null {
  if (vm.sessionCount === 0) {
    return 'Nie ma jeszcze czego domykać — dzień zacznie się pierwszą sesją.';
  }
  // `end.editable` przy niezerowej liczbie sesji może być fałszywe wyłącznie z jednego
  // powodu: któryś silnik nadal pracuje.
  if (!vm.end.editable) return 'Sesja jeszcze trwa — najpierw wyłącz silnik.';
  if (!holdsAircraft) {
    return 'Dzień zamyka się razem ze zdaniem maszyny — teraz żadnej nie trzymasz.';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Klamra
// ─────────────────────────────────────────────────────────────────────────────

function startBracket(duty: DutyDay): BracketVm {
  const first = duty.sessions.length > 0 ? duty.sessions[0]!.startedAt : null;

  if (duty.declaredStart != null) {
    return {
      value: timeUtc(duty.startAt),
      localTime: timeLocal(duty.startAt),
      // Gdy deklaracja ZAWĘŻA klamrę, mówimy o tym wprost — pilot ma zobaczyć, że
      // wpisana godzina nie jest tą, którą system liczy (§3.6a: lot jest faktem).
      hint: duty.declarationNarrowsStart
        ? `wpisano ${timeUtc(duty.declaredStart)} · liczy się pierwsza sesja ${timeUtc(first)}`
        : first != null
          ? `poprawione · pierwsza sesja ${timeUtc(first)}`
          : 'poprawione',
      origin: 'declared',
      editable: true,
    };
  }

  if (first != null) {
    return {
      value: timeUtc(first),
      localTime: timeLocal(first),
      hint: 'z pierwszej sesji',
      origin: 'derived',
      editable: true,
    };
  }

  return {
    value: '— : —',
    localTime: null,
    hint: 'ustali się na pierwszej sesji',
    origin: 'pending',
    editable: true,
  };
}

/**
 * Koniec klamry — i jedyne miejsce, w którym widok NIE bierze wartości z projekcji wprost.
 *
 * `DutyDay.endAt` to klamra ROZSTRZYGNIĘTA: gdy wszystkie wzloty są zamknięte, projekcja
 * podaje czas ostatniego z nich, bo tak §3.6a każe domykać dzień, którego pilot nie zamknął.
 * Dla dnia, który WŁAŚNIE TRWA, to jednak nie jest odpowiedź na pytanie ekranu. Pilot
 * o 15:25 stoi przy samolocie, którego jeszcze nie zdał — jego służba nie skończyła się
 * o 15:10 tylko dlatego, że wtedy zgasł silnik.
 *
 * Rozstrzygnięcie: **dopóki pilot nie zadeklarował końca („Zamknij dzień" na 01B), koniec
 * pokazujemy jako TRWA, a długość liczymy do teraz.** Projekcja zostaje nietknięta i dalej
 * mówi prawdę o klamrze rozstrzygniętej — tego potrzebuje serwer, historia i arkusz.
 * Różnica jest prezentacyjna i tu jest jej miejsce.
 */
function endBracket(duty: DutyDay): BracketVm {
  const lastStop = latestStopSoFar(duty.sessions);
  const anyOpen = duty.sessions.some((s) => s.stoppedAt == null);
  // Domknąć klamrę da się tylko wtedy, gdy JEST co domykać i nic już nie leci.
  // Pusty dzień jest tu równie ważnym przypadkiem jak otwarty bieg: mockup 01A rysuje
  // ołówek końca wygaszonym („Nie ma jeszcze czego domykać"), a `!anyOpen` mówiło
  // o dobie bez sesji, że koniec da się wpisać.
  const editable = duty.sessions.length > 0 && !anyOpen;

  // Deklaracja + pracujący silnik = dzień OTWORZYŁ SIĘ Z POWROTEM (§3.6a: „nowa sesja
  // po zamknięciu otwiera dzień z powrotem i rozszerza klamrę"). Projekcja mówi to
  // przez `endAt == null`, więc widok nie ma prawa czytać tej wartości wprost — inaczej
  // pilot z zadeklarowanym końcem i drugą maszyną w powietrzu dostaje wielkie „—"
  // pod podpisem „potwierdzone".
  if (duty.declaredEnd != null && !anyOpen) {
    return {
      value: timeUtc(duty.endAt),
      localTime: timeLocal(duty.endAt),
      hint: duty.declarationNarrowsEnd
        ? `wpisano ${timeUtc(duty.declaredEnd)} · liczy się ostatnia sesja ${timeUtc(lastStop)}`
        : lastStop != null
          ? `potwierdzone · ostatnia sesja ${timeUtc(lastStop)}`
          : 'potwierdzone',
      origin: 'declared',
      editable,
    };
  }

  return {
    value: duty.sessions.length > 0 ? 'TRWA' : '— : —',
    localTime: null,
    hint: endRunningHint(duty, lastStop),
    origin: duty.sessions.length > 0 ? 'running' : 'pending',
    editable,
  };
}

/**
 * Podpis pod nierozstrzygniętym końcem klamry.
 *
 * Osobna gałąź dla dnia, który pilot ZAMKNĄŁ, a potem znów poleciał: wcześniejsza
 * deklaracja nie znika ze strumienia (append-only) i nie może zniknąć z ekranu — pilot
 * ma zobaczyć, że jego „koniec 15:40" zostanie rozszerzony przez trwającą sesję.
 */
function endRunningHint(duty: DutyDay, lastStop: EpochMillis | null): string {
  if (duty.declaredEnd != null) {
    return `wpisano ${timeUtc(duty.declaredEnd)} · sesja trwa, klamra się rozszerzy`;
  }
  return lastStop != null
    ? `ustali się na ostatniej sesji — ${timeUtc(lastStop)}`
    : 'ustali się na ostatniej sesji';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sesje
// ─────────────────────────────────────────────────────────────────────────────

function groupContiguously(sessions: readonly DutySession[]): SessionGroupVm[] {
  const groups: SessionGroupVm[] = [];

  for (const session of sessions) {
    const last = groups[groups.length - 1];
    const row: SessionRowVm = {
      sessionUuid: session.sessionUuid,
      index: session.index,
      times:
        session.stoppedAt != null
          ? `${timeUtc(session.startedAt)} → ${timeUtc(session.stoppedAt)}`
          : `${timeUtc(session.startedAt)} → …`,
      flightsLabel: String(session.flightCount),
      blockLabel: duration(session.blockMs),
      flightLabel: duration(session.flightMs),
    };

    if (last != null && last.aircraftId === session.aircraftId) {
      last.sessions.push(row);
      // Adres rozliczenia wskazuje OSTATNIĄ sesję grupy — ekran 10 opisuje sesję
      // ze store'u, a ta jest najświeższa.
      last.sessionUuid = session.sessionUuid;
    } else {
      groups.push({
        aircraftId: session.aircraftId,
        sessionUuid: session.sessionUuid,
        sessions: [row],
      });
    }
  }

  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sumy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Długość służby. Ta sama zasada, co przy końcu klamry: dopóki pilot nie zadeklarował
 * końca, liczymy DO TERAZ („8:15 · do teraz" w mockupie), a nie do ostatniego wzlotu.
 * Dzień zamknięty oddaje wartość rozstrzygniętą z projekcji.
 */
function dutyTotal(duty: DutyDay, now: EpochMillis): string | null {
  if (duty.startAt == null) return null;
  if (duty.declaredEnd != null && duty.durationMs != null) return duration(duty.durationMs);
  return duration(Math.max(0, now - duty.startAt));
}

/**
 * Terminy obu okien korekty dnia zamkniętego (`01B`).
 *
 * Kotwice bierzemy DOKŁADNIE te, którymi liczy je domena (`rules/sessionRules.ts`):
 * klamra od deklaracji końca, sesja od ZDANIA (`day_close`, model 2026-08-10).
 * Druga implementacja tej arytmetyki w widoku kończyłaby się ekranem obiecującym
 * termin, którego reguła nie honoruje.
 */
function correctionWindows(duty: DutyDay): CorrectionWindowVm | null {
  if (duty.declaredEnd == null) return null;

  let first: { startedAt: EpochMillis; closesAt: EpochMillis } | null = null;
  for (const session of duty.sessions) {
    if (session.releasedAt == null) continue;
    const closesAt = session.releasedAt + CORRECTION_WINDOW_MS;
    if (first == null || closesAt < first.closesAt) {
      first = { startedAt: session.startedAt, closesAt };
    }
  }

  return {
    dutyDeadline: dateTimeUtcShort(duty.declaredEnd + CORRECTION_WINDOW_MS),
    firstToExpire:
      first == null
        ? null
        : { startedAt: timeUtc(first.startedAt), deadline: dateTimeUtcShort(first.closesAt) },
  };
}

/**
 * Najpóźniejsze zatrzymanie doby — „ostatnia sesja" z podpisów klamry.
 *
 * NIE JEST tym samym co `lastClosedStop` w `projections/duty.ts`, choć do 2026-08-08
 * nazywało się identycznie. Tamta wersja zwraca `null`, gdy KTÓRAKOLWIEK sesja jest
 * otwarta (bo klamra jest wtedy nierozstrzygnięta); ta ignoruje otwarte i oddaje
 * najpóźniejsze zatrzymanie, jakie już jest — bo podpis „ustali się na ostatniej sesji
 * — 15:10" ma sens także w dniu, który trwa. Dwie różne odpowiedzi pod jedną nazwą to
 * pułapka dla następnego czytelnika, więc nazwa mówi teraz, którą z nich dostaje.
 */
function latestStopSoFar(sessions: readonly DutySession[]): EpochMillis | null {
  let last: EpochMillis | null = null;
  for (const session of sessions) {
    if (session.stoppedAt == null) continue;
    last = last == null || session.stoppedAt > last ? session.stoppedAt : last;
  }
  return last;
}
