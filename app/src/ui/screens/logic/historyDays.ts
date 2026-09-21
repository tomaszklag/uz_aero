/**
 * Ninerdeck - sesje z lokalnego strumienia → treść ekranu 12 (mockup `design/12-historia.html`).
 *
 * Ten sam podział co `statsDay.ts`/`syncStatus.ts`: logika prezentacji w czystych
 * funkcjach, testowalnych bez React Native.
 *
 * CO EKRAN POKAZUJE (issue #35, 2026-08-12): sesje z dni WCZEŚNIEJSZYCH. Dzisiejsze
 * stoją na „Mój dzień" (01), na takich samych kafelkach (issue #42, `sessionCard.ts`) -
 * powtórzone tutaj były drugą listą tych samych lotów, a ekran nazywa się
 * „Poprzednie dni". Doba liczy się
 * tak samo jak na 01: po URUCHOMIENIU silnika (`projectPilotDay`), więc sesja
 * rozpoczęta o 23:50 należy w całości do doby, w której wystartowała.
 *
 * Trzymany samolot też nie jest historią, tylko teraźniejszością - po restarcie
 * wznowienie prowadzi prosto do kokpitu (`navigation/resumeTarget.ts`).
 *
 * Podział na grupy robi okno korekty (decyzja 2026-07-23): w oknie → „Możesz jeszcze
 * poprawić" (karta prowadzi do korekty), po oknie → „Zamknięte" (karta prowadzi do
 * PODGLĄDU - ten sam ekran 10 bez elementów zapisu, mockup `10b`). Do issue #35 sesja
 * po oknie nie miała żadnego wejścia: pilot widział cztery liczby i nie mógł sprawdzić,
 * co właściwie zapisał.
 */

import {
  correctionWindow,
  isEmptyOperation,
  substanceFacts,
  utcDayStart,
  type SessionState,
} from '../../../domain';
import type { HistoryDay } from '../../../application';
import { dateUtcDayMonthLong, dateUtcLong } from '../../format';
import { type SessionCardVm, sessionStats, sessionTimes } from './sessionCard';
import { dateTimeUtcShort } from './statsDay';

/**
 * Stan wysyłki sesji - plakietka istnieje WYŁĄCZNIE wtedy, gdy coś czeka w kolejce.
 *
 * „Wysłane" zostało usunięte (issue #35 pkt 3): to stan domyślny, a plakietka świecąca
 * przy 99% kart uczy oko ignorować stopkę - dokładnie ta sama reguła, dla której
 * SyncChip online nie rysuje nic (issue #12).
 */
export interface UploadSpec {
  /** „Oczekuje na przesłanie · 8" / „W trakcie wysyłania · 8". */
  label: string;
  /** `queued` = kolejka czeka na okazję, `sending` = pętla synca właśnie pracuje. */
  state: 'queued' | 'sending';
}

/**
 * Karta sesji (mockup `.day-card`) - kształt wspólny z „Mój dzień" (`sessionCard.ts`,
 * issue #42), poszerzony o to, co istnieje wyłącznie w historii: stan wysyłki.
 *
 * Nagłówkiem kafelka jest tutaj DATA, bo lista biegnie przez wiele dni; na 01 w tym
 * samym miejscu stoi numer sesji w dobie.
 */
export interface DayCardSpec extends SessionCardVm {
  /** Zaległość wysyłki albo `null` = wszystko poszło (nie rysujemy nic). */
  upload: UploadSpec | null;
}

/**
 * Doba UTC, do której należy sesja - kotwicą jest URUCHOMIENIE silnika, a dopiero
 * w jego braku przejęcie maszyny.
 *
 * Reguła jest przepisana z `projectPilotDay` celowo: to ona decyduje, co stoi na 01,
 * a ekran 12 pokazuje „wszystko poza dniem dzisiejszym". Dwie różne kotwice zrobiłyby
 * przy sesji spod północy dziurę (sesja zniknęłaby z obu list) albo duplikat.
 * Sesja bez biegu silnika (zdanie bez lotu, 09C) na 01 nie ma wiersza - tutaj ma kartę,
 * bo maszyna była zajęta i jest to fakt do obejrzenia.
 */
export function sessionDay(state: SessionState): number | null {
  const anchor = state.legs[0]?.startedAt ?? state.claimedAt;
  return anchor != null ? utcDayStart(anchor) : null;
}

/**
 * Plakietka wysyłki sesji. `null` = nic nie czeka, czyli stan domyślny - bez napisu.
 *
 * @param pushing czy ostatni przebieg synca dosięgnął serwera. Aplikacja nie zna stanu
 *                „online" inaczej niż po wyniku ostatniej próby (§4.3), więc to jedyna
 *                uczciwa podstawa rozróżnienia „czeka na sieć" od „już leci".
 */
export function uploadSpec(pendingCount: number, pushing: boolean): UploadSpec | null {
  if (pendingCount <= 0) return null;
  return pushing
    ? { label: `W trakcie wysyłania · ${pendingCount}`, state: 'sending' }
    : { label: `Oczekuje na przesłanie · ${pendingCount}`, state: 'queued' };
}

function cardSpec(
  day: HistoryDay,
  pushing: boolean,
  regOf: (id: string) => string | null,
  signatureOf: (sessionUuid: string) => string | null,
  clubOf: (sessionUuid: string) => string | null,
): DayCardSpec {
  const { state, pendingCount } = day;
  const leg = state.legs[0];
  return {
    sessionUuid: state.sessionUuid ?? '',
    title: state.claimedAt != null ? dateUtcLong(state.claimedAt) : '-',
    // Nazwa operacji (issue #68) - ta sama, którą widzi administrator w panelu.
    // Data powtarza się w niej i w tytule świadomie: sygnatura czyta się jako JEDEN
    // napis-nazwę, a nie jako zestaw faktów do złożenia z osobna.
    signature: state.sessionUuid == null ? null : signatureOf(state.sessionUuid),
    // Znak, nie identyfikator - patrz `buildMyDay`. Kafelek jest ten sam, więc
    // i ta granica jest ta sama.
    aircraft: (state.aircraftId != null ? regOf(state.aircraftId) : null) ?? '-',
    // Godziny biegu silnika: bez nich dwie sesje tej samej doby na tej samej maszynie
    // są nie do odróżnienia. Sesja bez biegu (issue #75 pkt 3) pokazuje w tym miejscu
    // zajęcie maszyny (przejęcie → zdanie) - jedyną parę godzin, jaką ma; to te same
    // wartości, które wiersz tej operacji niesie na 01 (`projectPilotDay`).
    times: sessionTimes(
      leg?.startedAt ?? state.claimedAt,
      leg != null ? leg.stoppedAt : state.closedAt,
    ),
    // Loty / Blok / Lot - dokładnie to, co niesie kafelek sesji na „Mój dzień"
    // (issue #35 pkt 6; od issue #42 z tej samej funkcji). „Sesja" (czas trzymania
    // maszyny) i „Skoczków" wypadły: pierwsza była wielkością, o którą nikt nie pytał,
    // druga mieszka w szczegółach lotu, do których ta karta prowadzi.
    stats: sessionStats(state.flights.length, state.blockTimeMs, state.flightTimeMs),
    manual: state.manualEntry,
    adminClosed: state.closedByAdmin,
    // Klub operacji - to samo pole i ta sama droga, co na 01 (wspólny `SessionCardVm`).
    club: state.sessionUuid == null ? null : clubOf(state.sessionUuid),
    upload: uploadSpec(pendingCount, pushing),
  };
}

/**
 * Wiersz operacji w logu historii (makieta `24`).
 *
 * Ten sam model, co kafelek na Pulpicie i w rozliczeniu (`SessionCardVm`, issue #42) -
 * historia dokłada wyłącznie to, czego nie ma nigdzie indziej: stan wysyłki, termin
 * korekty i odpowiedź na pytanie, CO ZROBI tapnięcie.
 */
export interface HistoryOpVm extends DayCardSpec {
  /**
   * Okno korekty jest OTWARTE - wiersz prowadzi do edycji (ołówek), a nie do podglądu
   * (oko). Ikona po prawej niesie SKUTEK tapnięcia, który do 3.0.0 niósł pas akcji
   * kafelka: „OTWÓRZ I POPRAW" dokładało 44 px do każdej pozycji, choć cała karta
   * prowadziła w to samo miejsce.
   */
  editable: boolean;
  /** „Korekta do 19 WRZ 18:05" - plakietka WYŁĄCZNIE w oknie (stan odchylony). */
  deadline: string | null;
  /**
   * Trzy liczby BEZ ETYKIET: loty, blok, czas w powietrzu.
   *
   * Podpisy stały w nagłówku każdej grupy do 2026-09-19 i wyleciały uwagą właściciela:
   * powtarzały się przy każdym dniu, a kolejność tej trójki jest w aplikacji stała -
   * liczba całkowita to loty, dwa czasy to blok i lot (kafelek, stopka osi, rozliczenie).
   */
  nums: string[];
}

/** Dzień jako NAGŁÓWEK grupy - data pada raz, operacje są zwartymi wierszami. */
export interface HistoryDayVm {
  /** Północ UTC tej doby - klucz listy i podstawa sortowania. */
  day: number;
  /** „Dzisiaj · 19 WRZEŚNIA", „Wczoraj · 18 WRZEŚNIA", „11 SIERPNIA 2026". */
  label: string;
  ops: HistoryOpVm[];
  /**
   * Suma doby - WYŁĄCZNIE przy kilku operacjach. Przy jednej byłaby przepisaniem
   * wiersza tuż wyżej (decyzja właściciela 2026-09-19).
   */
  total: string[] | null;
}

export interface HistoryVm {
  /**
   * Dni z operacjami W OKNIE KOREKTY - widoczne od razu. Domyślnie widać TYLKO to,
   * co można poprawić: po to pilot tu wchodzi.
   */
  open: HistoryDayVm[];
  /** Reszta - za przyciskiem „Starsze operacje" (makieta `24a` = stan rozwinięty). */
  archive: HistoryDayVm[];
  /** Ile operacji czeka w archiwum - liczba przy przycisku. */
  archiveCount: number;
}

const DAY_MS = 86_400_000;

/**
 * Log historii: WSZYSTKIE operacje pilota, dzisiejsze i wcześniejsze.
 *
 * ══ DZIŚ JEST TUTAJ, I TO JEST ZMIANA WOBEC issue #35 ══
 * Do 3.0.0 dzisiejsze operacje mieszkały na ekranie domowym, a ten ekran nazywał się
 * „Poprzednie dni". Od Pulpitu (§9.1) ekran startowy pokazuje SAME SUMY, więc kafelek
 * operacji - jedyne drzwi do korekty w oknie 24 h (issue #23, #43) - musiał gdzieś
 * zamieszkać. Zamieszkał tu, a zakładka nazywa się HISTORIA właśnie dlatego, że
 * obejmuje odtąd obie strony doby.
 *
 * Odpadają, jak dotąd: operacje trzymane (mają kokpit), unieważnione (issue #75 pkt 1)
 * i puste zapisy (issue #75 pkt 2) - wiersz obiecywałby rozliczenie, w którym nic nie ma.
 *
 * @param now      teraz (epoch ms) - nazwy dób i stan okien korekty,
 * @param pushing  czy sync dosięga serwera (etykieta plakietki wysyłki),
 * @param regOf    identyfikator maszyny → jej ZNAK,
 * @param signatureOf identyfikator operacji → jej SYGNATURA,
 * @param clubOf   identyfikator operacji → NAZWA KLUBU (`null` przy jednym członkostwie).
 */
export function buildHistoryLog(
  days: HistoryDay[],
  now: number,
  pushing = false,
  regOf: (id: string) => string | null = () => null,
  signatureOf: (sessionUuid: string) => string | null = () => null,
  clubOf: (sessionUuid: string) => string | null = () => null,
): HistoryVm {
  const grupy = new Map<number, HistoryOpVm[]>();

  for (const day of days) {
    const { state } = day;
    if (state.sessionUuid == null || !state.closed) continue;
    if (state.voided) continue;
    if (isEmptyOperation(substanceFacts(state))) continue;

    const doba = sessionDay(state);
    if (doba == null) continue;

    const window = correctionWindow(state, now);
    const spec = cardSpec(day, pushing, regOf, signatureOf, clubOf);
    const lista = grupy.get(doba) ?? [];
    lista.push({
      ...spec,
      editable: window.open,
      deadline:
        window.open && window.closesAt != null
          ? `Korekta do ${dateTimeUtcShort(window.closesAt)}`
          : null,
      nums: spec.stats.map((stat) => stat.v),
    });
    grupy.set(doba, lista);
  }

  const dni = [...grupy.entries()]
    // Najnowsze na górze: pilot wchodzi po to, co poprawia, a to jest zawsze świeże.
    .sort((a, b) => b[0] - a[0])
    .map(([doba, ops]) => ({
      day: doba,
      label: dayLabel(doba, now),
      // Wewnątrz doby chronologicznie - tak samo jak oś operacji i lista na Pulpicie.
      ops: [...ops].sort((a, b) => (a.times ?? '').localeCompare(b.times ?? '')),
      total: ops.length > 1 ? dayTotal(ops) : null,
    }));

  const wOknie = (d: HistoryDayVm): boolean => d.ops.some((op) => op.editable);
  const open = dni.filter(wOknie);
  const archive = dni.filter((d) => !wOknie(d));
  return {
    open,
    archive,
    archiveCount: archive.reduce((suma, d) => suma + d.ops.length, 0),
  };
}

/**
 * Nazwa doby w nagłówku grupy.
 *
 * „Dzisiaj" i „Wczoraj" mają pierwszeństwo przed datą, bo to one padają na tym ekranie
 * najczęściej - a pilot szukający świeżego lotu nie przelicza w głowie, którego dziś
 * jest. Data stoi OBOK, nie zamiast: bez niej „Wczoraj" na telefonie otwartym po
 * północy znaczyłoby co innego niż przy wejściu wieczorem.
 */
export function dayLabel(day: number, now: number): string {
  const dzis = utcDayStart(now);
  if (day === dzis) return `Dzisiaj · ${dateUtcDayMonthLong(day)}`;
  if (day === dzis - DAY_MS) return `Wczoraj · ${dateUtcDayMonthLong(day)}`;
  return dateUtcLong(day);
}

/** Suma doby - ta sama trójka, co w wierszu: loty (liczba), blok i lot (czasy). */
function dayTotal(ops: HistoryOpVm[]): string[] {
  const loty = ops.reduce(
    (suma, op) => suma + (Number.parseInt(op.nums[0] ?? '0', 10) || 0),
    0,
  );
  return [String(loty), sumaCzasow(ops, 1), sumaCzasow(ops, 2)];
}

/**
 * Suma kolumny czasów „H:MM" z wierszy doby.
 *
 * Sumujemy NAPISY, a nie milisekundy, i to jest świadome: wiersz pokazuje już
 * zaokrąglony czas, więc suma policzona z surowych wartości potrafiłaby różnić się
 * o minutę od tego, co pilot widzi nad nią - a to jest dokładnie ten rodzaj
 * rozbieżności, którego nikt nie umie sobie wytłumaczyć. Kreska („- -") znaczy brak
 * pomiaru i do sumy nie wchodzi.
 */
function sumaCzasow(ops: HistoryOpVm[], kolumna: number): string {
  let minuty = 0;
  for (const op of ops) {
    const [h, m] = (op.nums[kolumna] ?? '').split(':');
    const godziny = Number.parseInt(h ?? '', 10);
    const reszta = Number.parseInt(m ?? '', 10);
    if (Number.isFinite(godziny) && Number.isFinite(reszta)) minuty += godziny * 60 + reszta;
  }
  return `${Math.floor(minuty / 60)}:${String(minuty % 60).padStart(2, '0')}`;
}
