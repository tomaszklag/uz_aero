/**
 * UZ Aero (serwer) — zawartość dziennej karty arkusza (§4.7).
 *
 * Czysta funkcja: projekcje sesji (`projectSession` z @uzaero/domain) + kody pilotów
 * → `DaySheet`. Zero bazy i zero Google — dzięki temu treść karty testuje się na
 * liczbach kanonicznego dnia bez jednej atrapy, a adapter Sheets (gdy powstanie)
 * dostanie gotowe wiersze do wklejenia.
 *
 * ══ KARTA = DOBA SAMOLOTU, NIE SESJA (decyzja 2026-08-07) ══
 * Do 2026-08-07 kartę budowała JEDNA sesja i nazywała ją `YYYY-MM-DD_SP-XXX`. Po
 * skróceniu sesji (§3.6a) ta nazwa przestała być kluczem unikalnym: w typowym dniu
 * skokowym tą samą maszyną lata dwóch pilotów, więc druga karta NADPISYWAŁA pierwszą
 * i podgląd porannej zmiany pokazywał treść popołudniowej. Klub czyta dzień per
 * samolot, nie per zmianę pilota — więc jednostką jest DOBA, a sesje są jej wierszami.
 *
 * ══ KSZTAŁT KOLUMN I DLACZEGO TAKI ══
 * Karta ma sześć bloków, a spina je JEDNA rzecz: kolumna `Sesja` z etykietą `S1`, `S2`…
 * Etykiety są PORZĄDKOWE w obrębie karty (chronologicznie po chwili przejęcia), nie
 * globalne — nazwa sesji to uuid, którego w dokumencie klubu nikt nie czyta, a numer
 * zmiany jest tym, czym człowiek się posługuje („pierwsza zmiana", „druga zmiana").
 *
 *  1. **Nagłówek** — samolot, doba, ile zmian, czas blokowy doby. Plus adnotacja
 *     „Niekompletna", gdy któraś sesja jest wstrzymana flagą (§4.7: bramka obejmuje
 *     SESJĘ, nie całą kartę — inaczej jedna nakładka kasowałaby dzień całej maszyny).
 *  2. **Sesje doby** — kto, kiedy przejął i zdał, ile wylatał. To jest ten wiersz,
 *     po którym administrator poznaje, czyja jest reszta karty.
 *  3. **Loty** — `Sesja` PRZED numerem lotu. Numer lotu jest liczony w obrębie sesji
 *     (tak liczy go projekcja i tak widzi go pilot na ekranie 10), więc w dobie
 *     z dwiema zmianami powtórzy się — bez kolumny `Sesja` wiersz „1 · 08:25" i
 *     „1 · 17:20" wyglądałyby na sprzeczność zamiast na dwie zmiany.
 *  4. **Paliwo**, 5. **Motogodziny** — per sesja + wiersz `Doba`. Sumy doby NIE są
 *     sumą wszystkiego: paliwo startowe doby to odczyt PIERWSZEJ zmiany, a końcowe —
 *     OSTATNIEJ (poziom w zbiorniku nie jest wielkością addytywną), dolane i zużyte
 *     sumują się normalnie. MH tak samo: doba to RUCH LICZNIKA maszyny od pierwszego
 *     do ostatniego odczytu, a różnica między nim a sumą delt per sesja jest dokładnie
 *     tym, co ma zgłosić flaga `mh_gap` — karta nie ma prawa jej zamaskować sumowaniem.
 *  6. **Zrzuty** — wyłącznie gdy któraś zmiana była operacją Skoki (§3.7); dla ferry
 *     czy egzaminu sekcja pełna zer byłaby szumem, nie informacją.
 *
 * Liczby w arkuszu NIE MAJĄ PRAWA różnić się od telefonu: wszystko pochodzi z tej samej
 * projekcji, a formatery są wspólne (`@uzaero/format`, ekran 10 liczy tym samym kodem).
 *
 * Czasy w UTC i tak podpisane — domyślna strefa całego systemu (CLAUDE.md).
 */

import type { JumperCounts, SessionState } from '@uzaero/domain';
// Formaty WSPÓLNE z telefonem (2026-07-31). Wcześniej stały tu ręczne kopie
// z docblockami „lustro … z app/src/ui/format.ts" — czyli umowa utrzymywana
// dyscypliną, a nie kompilatorem. Karta arkusza musi pokazywać dokładnie te same
// napisy co ekran 10, bo pilot porównuje jedno z drugim.
import { hhmm, motoHours, timeUtc } from '@uzaero/format';

import type { DaySheet } from '../ports.ts';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Dzień karty jako `YYYY-MM-DD` (UTC) — prefiks nazwy karty i kolumna `export_log.day`. */
export function sheetDay(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Zakres doby UTC w milisekundach — `[fromMs, toMs]`, granice DOMKNIĘTE.
 *
 * Odpowiada na pytanie „które sesje należą do tej karty" i jest odwrotnością
 * `sheetDay`: przynależność wyznacza chwila PRZEJĘCIA samolotu (`session_claim`),
 * nie meldunek pilota. Meldunek jest od §3.6a opcjonalny i zwykle pusty, a doba
 * maszyny musi dać się wyznaczyć zawsze.
 *
 * Sesja rozpoczęta o 23:50 i zdana po północy zostaje w dobie SWOJEGO przejęcia —
 * ta sama reguła, co w projekcji służby (`projectDuty`: „przynależność sesji do doby
 * wyznacza czas uruchomienia silnika, nie zamknięcia").
 */
export function utcDayRange(day: string): { fromMs: number; toMs: number } {
  const fromMs = Date.parse(`${day}T00:00:00.000Z`);
  return { fromMs, toMs: fromMs + 24 * 60 * 60 * 1000 - 1 };
}

/**
 * Nazwa karty wg konwencji §4.7: `YYYY-MM-DD_SP-XXX` — DOBA i SAMOLOT.
 *
 * LUSTRO `sheetTabName` z `app/src/ui/screens/syncStatus.ts` — konwencja jest częścią
 * specyfikacji i telefon liczy ją u siebie (ekran 11 pokazuje cel eksportu zanim serwer
 * cokolwiek zapisze), więc oba końce muszą wyprodukować ten SAM napis bajt w bajt.
 * Rozjazd = telefon obiecuje inną kartę, niż serwer zapisał.
 */
export function sheetTab(day: string, aircraftId: string): string {
  return `${day}_${aircraftId}`;
}

/**
 * Nazwa karty doby, do której należy sesja przejęta w chwili `claimedAt`.
 *
 * Osobno od `sheetTab`, bo wołający są dwaj i mają w ręku co innego: eksporter zna
 * dobę jako napis (buduje kartę), a monitor panelu i telefon mają chwilę przejęcia
 * z projekcji. Jedna funkcja z parametrem „albo napis, albo liczba" byłaby zaproszeniem
 * do pomyłki w miejscu, w którym pomyłka znaczy „link do nieistniejącej karty".
 */
export function sheetTabName(claimedAt: number, aircraftId: string): string {
  return sheetTab(sheetDay(claimedAt), aircraftId);
}

/**
 * Litry bez jednostki — jedyny format, którego NIE bierzemy z `@uzaero/format`.
 *
 * Aplikacja pokazuje „88 L", bo etykieta stoi obok liczby w jednym wierszu. Komórka
 * arkusza niesie jednostkę w NAGŁÓWKU kolumny, więc powtórzenie „L" w każdej komórce
 * byłoby szumem, a przy okazji zepsułoby sumowanie po stronie czytającego arkusz.
 * Różnica jest zamierzona i dlatego ta funkcja została tu, zamiast udawać wspólną.
 */
function litres(value: number | null): string {
  return value == null ? '—' : String(Math.round(value));
}

/** „22 (12 tandem / 6 AFF / 4 solo)" — rozbicie jak w stopce mockupu 11; zera pomijamy. */
function jumpersCell(jumpers: JumperCounts, total: number): string {
  const parts = [
    jumpers.tandem > 0 ? `${jumpers.tandem} tandem` : null,
    jumpers.aff > 0 ? `${jumpers.aff} AFF` : null,
    jumpers.solo > 0 ? `${jumpers.solo} solo` : null,
  ].filter((p): p is string => p != null);
  return parts.length > 0 ? `${total} (${parts.join(' / ')})` : '0';
}

/**
 * Suma, która UMIE nie wiedzieć: `null` w którymkolwiek składniku daje `null`.
 *
 * Bilans doby złożony z sesji, w której odczytu zabrakło, nie jest bilansem tylko
 * mniejszym — jest nieznany. Zsumowanie znanych składników dałoby liczbę wyglądającą
 * na kompletną i o połowę za małą, czyli najgorszy możliwy wynik w dokumencie klubu.
 */
function sumOrNull(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value == null) return null;
    total += value;
  }
  return total;
}

/** Pierwsza znana wartość w kolejności chronologicznej (`null` = żadna sesja jej nie ma). */
function firstKnown(values: readonly (number | null)[]): number | null {
  return values.find((v) => v != null) ?? null;
}

/** Ostatnia znana wartość w kolejności chronologicznej. */
function lastKnown(values: readonly (number | null)[]): number | null {
  return firstKnown([...values].reverse());
}

/** Kody załogi do wiersza sesji (rozwiązane z id przez eksporter). */
export interface DaySheetCrew {
  pic: string | null;
  dual: string | null;
}

/** Jedna sesja jako WIERSZ karty doby. */
export interface DaySheetSession {
  sessionUuid: string;
  /** Projekcja tej sesji — te same liczby, które pilot widzi na ekranie 10. */
  state: SessionState;
  crew: DaySheetCrew;
}

/**
 * Sesja WYŁĄCZONA z karty przez otwartą flagę blokującą (§4.7).
 *
 * Karta wychodzi bez niej i mówi o tym wprost, zamiast nie wychodzić wcale: przy
 * krótkich sesjach (§3.6a) nakładki są częstsze, więc blokowanie CAŁEJ doby uczyniłoby
 * z bramki stan domyślny — jedna sporna zmiana kasowałaby dzień pracy całej maszyny.
 */
export interface DaySheetExclusion {
  sessionUuid: string;
  flagIds: readonly number[];
}

/** Wejście karty: doba jednej maszyny razem z jej sesjami. */
export interface DaySheetDay {
  /** `YYYY-MM-DD` (UTC). */
  day: string;
  aircraftId: string;
  /** Sesje wchodzące do karty, CHRONOLOGICZNIE po chwili przejęcia. */
  sessions: readonly DaySheetSession[];
  /** Sesje pominięte przez flagę — adnotacja „Niekompletna" w nagłówku. */
  excluded: readonly DaySheetExclusion[];
}

/**
 * Buduje kartę doby samolotu. `null` = nie ma z czego (doba bez ani jednej sesji
 * wchodzącej do karty) — eksporter wtedy nic nie zapisuje.
 *
 * Lot bez lądowania zostaje w tabeli z myślnikami — ukrycie go schowałoby dokładnie
 * ten wiersz, który wymaga korekty (ta sama decyzja co na ekranie 10). Tak samo sesja
 * jeszcze niezdana: jest w karcie ze stanem „w toku", bo karta ma odzwierciedlać
 * AKTUALNY stan doby, a nie tylko jej domkniętą część.
 */
export function buildDaySheet(input: DaySheetDay): DaySheet | null {
  if (input.sessions.length === 0) return null;

  const label = new Map<string, string>();
  input.sessions.forEach((s, i) => label.set(s.sessionUuid, `S${i + 1}`));
  const labelOf = (s: DaySheetSession): string => label.get(s.sessionUuid) ?? s.sessionUuid;

  // Format motogodzin jest własnością SAMOLOTU, więc dla wiersza „Doba" bierzemy
  // pierwszy zadeklarowany przez którąkolwiek sesję — rozjazd między sesjami znaczyłby
  // przekonfigurowanie maszyny w środku dnia i nie ma sensownej reprezentacji w karcie.
  const dayMhFormat = input.sessions.map((s) => s.state.mhFormat).find((f) => f != null) ?? null;

  const rows: string[][] = [
    ['UZ Aero — doba samolotu', `${input.day} (UTC)`],
    ['Samolot', input.aircraftId],
    ['Sesje', String(input.sessions.length)],
    ['Czas blokowy doby', hhmm(input.sessions.reduce((sum, s) => sum + s.state.blockTimeMs, 0))],
  ];

  for (const gap of input.excluded) {
    rows.push([
      'Niekompletna',
      `sesja ${gap.sessionUuid} poza kartą — ${gap.flagIds.map((id) => `flaga #${id}`).join(', ')}`,
    ]);
  }

  rows.push(
    [],
    ['Sesje doby · czasy UTC'],
    ['Sesja', 'PIC', 'Dual', 'Operacja', 'Przejęcie', 'Zdanie', 'Block', 'Stan'],
    ...input.sessions.map((s) => [
      labelOf(s),
      s.crew.pic ?? '—',
      s.crew.dual ?? '—',
      s.state.operation ?? '—',
      timeUtc(s.state.claimedAt),
      timeUtc(s.state.closedAt),
      hhmm(s.state.blockTimeMs),
      s.state.closed ? 'zdany' : 'w toku',
    ]),

    [],
    ['Loty · czasy UTC'],
    ['Sesja', '#', 'Takeoff', 'Landing', 'Block', 'Metoda'],
    ...input.sessions.flatMap((s) =>
      s.state.flights.map((f) => [
        labelOf(s),
        String(f.index),
        timeUtc(f.takeoffAt),
        f.landingAt != null ? timeUtc(f.landingAt) : '—',
        f.landingAt != null ? hhmm(f.durationMs) : '—',
        f.method === 'auto' ? 'AUTO' : 'RĘCZNIE',
      ]),
    ),

    [],
    ['Paliwo (L)'],
    ['Sesja', 'Start', 'Dolane', 'Zużyte', 'Koniec'],
    ...input.sessions.map((s) => [
      labelOf(s),
      litres(s.state.fuel.startL),
      litres(s.state.fuel.addedL),
      litres(s.state.fuel.consumedL),
      litres(s.state.fuel.endL),
    ]),
    [
      'Doba',
      litres(firstKnown(input.sessions.map((s) => s.state.fuel.startL))),
      litres(input.sessions.reduce((sum, s) => sum + s.state.fuel.addedL, 0)),
      litres(sumOrNull(input.sessions.map((s) => s.state.fuel.consumedL))),
      litres(lastKnown(input.sessions.map((s) => s.state.fuel.endL))),
    ],

    [],
    ['Motogodziny'],
    ['Sesja', 'Start', 'Koniec', 'Delta'],
    ...input.sessions.map((s) => [
      labelOf(s),
      motoHours(s.state.mh.start, s.state.mhFormat),
      motoHours(s.state.mh.end, s.state.mhFormat),
      motoHours(s.state.mh.deltaH, s.state.mhFormat),
    ]),
    mhDayRow(input.sessions, dayMhFormat),
  );

  // Strona przychodowa doby — tylko gdy którakolwiek zmiana była operacją Skoki (§3.7).
  if (input.sessions.some((s) => s.state.operation === 'skoki')) {
    rows.push(...dropRows(input.sessions, labelOf));
  }

  return { tab: sheetTab(input.day, input.aircraftId), rows };
}

/**
 * Wiersz `Doba` motogodzin — RUCH LICZNIKA maszyny, nie suma delt per sesja.
 *
 * Licznik jest fizycznym przyrządem samolotu (§4.5, łańcuch MH), więc doba to różnica
 * między pierwszym a ostatnim znanym odczytem. Rozjazd wobec sumy delt per sesja znaczy
 * dziurę w łańcuchu — czyli lot bez aplikacji albo błąd wpisu — i ma go zgłosić flaga
 * `mh_gap`, a nie zamaskować arytmetyka karty.
 */
function mhDayRow(sessions: readonly DaySheetSession[], format: SessionState['mhFormat']): string[] {
  const start = firstKnown(sessions.map((s) => s.state.mh.start));
  const end = lastKnown(sessions.map((s) => s.state.mh.end));
  const delta = start == null || end == null ? null : end - start;
  return ['Doba', motoHours(start, format), motoHours(end, format), motoHours(delta, format)];
}

/**
 * Blok zrzutów: wiersz na każdą zmianę skokową + suma doby + klienci.
 *
 * Klient jedzie WIERSZEM, nie kolumną, bo jest własnością zadania, a nie zrzutu: dwie
 * zmiany mogą latać dla tego samego klienta albo dla dwóch różnych, a powtarzanie
 * nazwy w każdym wierszu tabeli sugerowałoby rozliczenie per wyniesienie.
 */
function dropRows(
  sessions: readonly DaySheetSession[],
  labelOf: (s: DaySheetSession) => string,
): string[][] {
  const jumping = sessions.filter((s) => s.state.operation === 'skoki');
  const totals: JumperCounts = {
    tandem: jumping.reduce((n, s) => n + s.state.drops.jumpers.tandem, 0),
    aff: jumping.reduce((n, s) => n + s.state.drops.jumpers.aff, 0),
    solo: jumping.reduce((n, s) => n + s.state.drops.jumpers.solo, 0),
  };
  const clients = [...new Set(jumping.map((s) => s.state.client).filter((c) => c != null))];

  return [
    [],
    ['Zrzuty'],
    ['Sesja', 'Wyniesienia', 'Skoczkowie'],
    ...jumping.map((s) => [
      labelOf(s),
      String(s.state.drops.count),
      jumpersCell(s.state.drops.jumpers, s.state.drops.totalJumpers),
    ]),
    [
      'Doba',
      String(jumping.reduce((n, s) => n + s.state.drops.count, 0)),
      jumpersCell(totals, jumping.reduce((n, s) => n + s.state.drops.totalJumpers, 0)),
    ],
    ['Klient', clients.length > 0 ? clients.join(' / ') : '—'],
  ];
}
