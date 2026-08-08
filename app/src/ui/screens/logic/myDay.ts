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
import type { DutyDay, DutyLeg, EpochMillis } from '../../../domain';

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

export interface LegRowVm {
  /**
   * Sesja, do której wzlot należy. Bez niej wiersz wie „kiedy", ale nie wie, KTÓRY
   * strumień otworzyć — a ślad (14) i korekta (04c) działają na konkretnej sesji.
   */
  sessionUuid: string;
  /** Numer w dobie — ciągiem przez samoloty, tak jak numeruje mockup. */
  index: number;
  /** „08:12 → 09:05" albo „13:40 → …" dla wzlotu otwartego. */
  times: string;
  blockLabel: string;
  flightLabel: string;
  /** `false` → wiersz dostaje pasek „do potwierdzenia" prowadzący na 09. */
  confirmed: boolean;
}

/**
 * Grupa wzlotów jednej maszyny — CIĄGŁA w czasie, nie zbiorcza.
 *
 * Pilot, który wziął SP-AXA, potem SP-KLM, a potem znów SP-AXA, zobaczy TRZY grupy,
 * nie dwie. Dzień czyta się jako oś czasu i scalanie odległych odcinków w jedną kartę
 * kłamałoby o przebiegu dnia — a przy okazji uniemożliwiało pokazanie, kiedy maszyna
 * była zdana.
 */
export interface LegGroupVm {
  aircraftId: string;
  /** Sesja tej maszyny — adres rozliczenia (10) dla KAŻDEJ grupy, nie tylko ostatniej. */
  sessionUuid: string;
  legs: LegRowVm[];
  /** Czy ta grupa dotyczy maszyny nadal trzymanej (ostatnia grupa z otwartą sesją). */
  held: boolean;
}

/**
 * Terminy okien korekty na wariancie 01B — **DWA, nie jedno** (§3.6a, 2026-08-07).
 *
 * Klamra służby i dane wzlotu to różne fakty o różnych momentach powstania, więc mają
 * osobne zegary. Ekran nie może obiecywać jednej daty dla wszystkiego: wzlot zamknięty
 * rano wygasa wcześniej niż klamra domknięta wieczorem.
 */
export interface CorrectionWindowVm {
  /** „7 SIE 15:40" — 24 h od zamknięcia DNIA (deklaracji końca klamry). */
  dutyDeadline: string;
  /**
   * Wzlot, którego okno zamknie się PIERWSZE — z godziną startu (żeby pilot wiedział,
   * o który chodzi) i terminem. `null`, gdy doba nie ma ani jednego zamkniętego wzlotu.
   *
   * Mockup mówi „najstarszy", ale to skrót myślowy prawdziwy tylko wtedy, gdy pilot
   * potwierdzał wzloty po kolei. Kotwicą jest POTWIERDZENIE (`leg_close`), więc wzlot
   * poranny odłożony na „Potwierdzę później" wygasa PÓŹNIEJ niż popołudniowy zamknięty
   * na bieżąco. Liczy się termin, nie kolejność.
   */
  firstToExpire: { startedAt: string; deadline: string } | null;
}

export interface MyDayVm {
  start: BracketVm;
  end: BracketVm;
  groups: LegGroupVm[];
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
  legCount: number;
  /** Ile wzlotów czeka na potwierdzenie — zasila pasek amber. */
  unconfirmedCount: number;
  /** Czy dzień jest pusty (ani wzlotu, ani deklaracji) — wariant 01A. */
  empty: boolean;
}

const DASH = '— —';

/**
 * Buduje model widoku ekranu 01.
 *
 * @param duty projekcja służby (`projectDuty`),
 * @param now  „teraz" do liczenia trwającej służby; podaje wołający,
 * @param heldAircraftId samolot aktualnie trzymany przez pilota (`null`, gdy żaden).
 */
export function buildMyDay(
  duty: DutyDay,
  now: EpochMillis,
  heldAircraftId: string | null = null,
): MyDayVm {
  const groups = groupContiguously(duty.legs, heldAircraftId);
  const empty = duty.legs.length === 0 && duty.declaredStart == null && duty.declaredEnd == null;
  const end = endBracket(duty);

  return {
    start: startBracket(duty),
    end,
    groups,
    correction: end.origin === 'declared' ? correctionWindows(duty) : null,
    totals: {
      duty: dutyTotal(duty, now),
      block: duty.legs.length > 0 ? duration(duty.blockTimeMs) : null,
      flight: duty.legs.length > 0 ? duration(duty.flightTimeMs) : null,
      takeoffs: duty.takeoffCount,
      landings: duty.landingCount,
      // Liczba maszyn doby zasila podpis „2 samoloty" pod sumą bloku. Widok NIE ma tego
      // liczyć sam — `Set` w JSX byłby dokładnie tym obliczeniem, którego tu unikamy.
      aircraftCount: duty.aircraftIds.length,
    },
    legCount: duty.legs.length,
    unconfirmedCount: duty.unconfirmedLegCount,
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
  if (vm.legCount === 0) {
    return 'Nie ma jeszcze czego domykać — dzień zacznie się pierwszym wzlotem.';
  }
  // `end.editable` przy niezerowej liczbie wzlotów może być fałszywe wyłącznie z jednego
  // powodu: któryś silnik nadal pracuje.
  if (!vm.end.editable) return 'Wzlot jeszcze trwa — najpierw wyłącz silnik.';
  if (!holdsAircraft) {
    return 'Dzień zamyka się razem ze zdaniem maszyny — teraz żadnej nie trzymasz.';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Klamra
// ─────────────────────────────────────────────────────────────────────────────

function startBracket(duty: DutyDay): BracketVm {
  const firstLeg = duty.legs.length > 0 ? duty.legs[0]!.startedAt : null;

  if (duty.declaredStart != null) {
    return {
      value: timeUtc(duty.startAt),
      localTime: timeLocal(duty.startAt),
      // Gdy deklaracja ZAWĘŻA klamrę, mówimy o tym wprost — pilot ma zobaczyć, że
      // wpisana godzina nie jest tą, którą system liczy (§3.6a: lot jest faktem).
      hint: duty.declarationNarrowsStart
        ? `wpisano ${timeUtc(duty.declaredStart)} · liczy się pierwszy wzlot ${timeUtc(firstLeg)}`
        : firstLeg != null
          ? `poprawione · pierwszy wzlot ${timeUtc(firstLeg)}`
          : 'poprawione',
      origin: 'declared',
      editable: true,
    };
  }

  if (firstLeg != null) {
    return {
      value: timeUtc(firstLeg),
      localTime: timeLocal(firstLeg),
      hint: 'z pierwszego wzlotu',
      origin: 'derived',
      editable: true,
    };
  }

  return {
    value: '— : —',
    localTime: null,
    hint: 'ustali się na pierwszym wzlocie',
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
  const lastStop = latestStopSoFar(duty.legs);
  const anyLegOpen = duty.legs.some((l) => l.stoppedAt == null);
  // Domknąć klamrę da się tylko wtedy, gdy JEST co domykać i nic już nie leci.
  // Pusty dzień jest tu równie ważnym przypadkiem jak otwarty wzlot: mockup 01A rysuje
  // ołówek końca wygaszonym („Nie ma jeszcze czego domykać"), a `!anyLegOpen` mówiło
  // o dobie bez wzlotów, że koniec da się wpisać.
  const editable = duty.legs.length > 0 && !anyLegOpen;

  // Deklaracja + pracujący silnik = dzień OTWORZYŁ SIĘ Z POWROTEM (§3.6a: „nowy wzlot
  // po zamknięciu otwiera dzień z powrotem i rozszerza klamrę"). Projekcja mówi to
  // przez `endAt == null`, więc widok nie ma prawa czytać tej wartości wprost — inaczej
  // pilot z zadeklarowanym końcem i drugą maszyną w powietrzu dostaje wielkie „—"
  // pod podpisem „potwierdzone".
  if (duty.declaredEnd != null && !anyLegOpen) {
    return {
      value: timeUtc(duty.endAt),
      localTime: timeLocal(duty.endAt),
      hint: duty.declarationNarrowsEnd
        ? `wpisano ${timeUtc(duty.declaredEnd)} · liczy się ostatni wzlot ${timeUtc(lastStop)}`
        : lastStop != null
          ? `potwierdzone · ostatni wzlot ${timeUtc(lastStop)}`
          : 'potwierdzone',
      origin: 'declared',
      editable,
    };
  }

  return {
    value: duty.legs.length > 0 ? 'TRWA' : '— : —',
    localTime: null,
    hint: endRunningHint(duty, lastStop),
    origin: duty.legs.length > 0 ? 'running' : 'pending',
    editable,
  };
}

/**
 * Podpis pod nierozstrzygniętym końcem klamry.
 *
 * Osobna gałąź dla dnia, który pilot ZAMKNĄŁ, a potem znów poleciał: wcześniejsza
 * deklaracja nie znika ze strumienia (append-only) i nie może zniknąć z ekranu — pilot
 * ma zobaczyć, że jego „koniec 15:40" zostanie rozszerzony przez trwający wzlot.
 */
function endRunningHint(duty: DutyDay, lastStop: EpochMillis | null): string {
  if (duty.declaredEnd != null) {
    return `wpisano ${timeUtc(duty.declaredEnd)} · wzlot trwa, klamra się rozszerzy`;
  }
  return lastStop != null
    ? `ustali się na ostatnim wzlocie — ${timeUtc(lastStop)}`
    : 'ustali się na ostatnim wzlocie';
}

// ─────────────────────────────────────────────────────────────────────────────
// Wzloty
// ─────────────────────────────────────────────────────────────────────────────

function groupContiguously(legs: readonly DutyLeg[], heldAircraftId: string | null): LegGroupVm[] {
  const groups: LegGroupVm[] = [];

  for (const leg of legs) {
    const last = groups[groups.length - 1];
    const row: LegRowVm = {
      sessionUuid: leg.sessionUuid,
      index: leg.index,
      times:
        leg.stoppedAt != null
          ? `${timeUtc(leg.startedAt)} → ${timeUtc(leg.stoppedAt)}`
          : `${timeUtc(leg.startedAt)} → …`,
      blockLabel: duration(leg.blockMs),
      flightLabel: duration(leg.flightMs),
      confirmed: leg.confirmed,
    };

    if (last != null && last.aircraftId === leg.aircraftId) {
      last.legs.push(row);
    } else {
      groups.push({
        aircraftId: leg.aircraftId,
        sessionUuid: leg.sessionUuid,
        legs: [row],
        held: false,
      });
    }
  }

  // Trzymana jest co najwyżej OSTATNIA grupa — wcześniejsze maszyny pilot już zdał,
  // nawet jeśli wróci do tej samej rejestracji później w ciągu dnia.
  const last = groups[groups.length - 1];
  if (last != null && heldAircraftId != null && last.aircraftId === heldAircraftId) {
    last.held = true;
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
 * klamra od deklaracji końca, wzlot od `leg_close`, a przy braku potwierdzenia
 * awaryjnie od `engine_stop`. Druga implementacja tej arytmetyki w widoku kończyłaby
 * się ekranem obiecującym termin, którego reguła nie honoruje.
 */
function correctionWindows(duty: DutyDay): CorrectionWindowVm | null {
  if (duty.declaredEnd == null) return null;

  let first: { startedAt: EpochMillis; closesAt: EpochMillis } | null = null;
  for (const leg of duty.legs) {
    if (leg.stoppedAt == null) continue;
    const closesAt = (leg.confirmedAt ?? leg.stoppedAt) + CORRECTION_WINDOW_MS;
    if (first == null || closesAt < first.closesAt) first = { startedAt: leg.startedAt, closesAt };
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
 * Najpóźniejszy zamknięty wzlot doby — „ostatni wzlot" z podpisów klamry.
 *
 * NIE JEST tym samym co `lastClosedStop` w `projections/duty.ts`, choć do 2026-08-08
 * nazywało się identycznie. Tamta wersja zwraca `null`, gdy KTÓRYKOLWIEK wzlot jest
 * otwarty (bo klamra jest wtedy nierozstrzygnięta); ta ignoruje otwarte i oddaje
 * najpóźniejsze zamknięcie, jakie już jest — bo podpis „ustali się na ostatnim wzlocie
 * — 15:10" ma sens także w dniu, który trwa. Dwie różne odpowiedzi pod jedną nazwą to
 * pułapka dla następnego czytelnika, więc nazwa mówi teraz, którą z nich dostaje.
 */
function latestStopSoFar(legs: readonly DutyLeg[]): EpochMillis | null {
  let last: EpochMillis | null = null;
  for (const leg of legs) {
    if (leg.stoppedAt == null) continue;
    last = last == null || leg.stoppedAt > last ? leg.stoppedAt : last;
  }
  return last;
}
