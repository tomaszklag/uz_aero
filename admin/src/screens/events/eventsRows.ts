/**
 * UZ Aero — panel: WIERSZ REJESTRU, DTO → treść komórek (moduł CZYSTY).
 *
 * Porządek listy jest własnością SERWERA (`received_at, uuid` pod `idx_events_received`)
 * — ta funkcja MAPUJE i nie sortuje. Lista jest przycinana kursorem po stronie bazy,
 * więc przesortowanie tego, co przyszło, przestawiłoby wiersze wewnątrz przypadkowego
 * wycinka.
 *
 * ══ CO TU JEST NAJWAŻNIEJSZE ══
 * Nie plakietki, tylko UCZCIWOŚĆ WOBEC BRAKÓW — i to w miejscu, w którym brak jest
 * treścią, a nie usterką:
 *
 *  • **brak fixa GPS to „brak fixa", nie zero i nie milcząca kreska.** Kolumna
 *    `Δ zegarów` istnieje dlatego, że z tej różnicy bierze się flaga `CLOCK_DRIFT`
 *    i że rozstrzyga się nią korekta administratora. Zero powiedziałoby, że zegary
 *    się zgadzały — czyli wpisałoby telefonowi dokładność, której nie miał;
 *  • **typ spoza katalogu** jedzie dosłownie, z tonem neutralnym i podpisem;
 *  • **samolot i pilot bez wiersza w rejestrze** zostają z samym identyfikatorem.
 *
 * Każde „—" w tym pliku ma obok siebie zdanie, co znaczy.
 */

import { dateUtcShort, timeUtcSeconds } from '@uzaero/format';

import type { EventEntryDto } from '../../api/dto';
import { eventTypeView, isCorrectable, type EventTypeView } from './eventCatalog';

/** Ton komórki = NAZWA KLASY modyfikatora, nie kolor (kolory tylko w CSS). */
export type CellTone = 'amber' | 'red' | 'dim';

export interface EventRow {
  uuid: string;
  sessionUuid: string;
  /**
   * Skrót uuid-a SESJI — kolumna „Dzień lotny".
   *
   * **To jest DWUNASTA kolumna, dołożona wobec `A04-zdarzenia.html`** (mockup ma
   * jedenaście). Powód jest tym samym powodem, dla którego ekran istnieje: rejestr
   * to narzędzie śledcze, a pytanie „do którego dnia lotnego należy to zdarzenie"
   * pada przy każdym dochodzeniu — bez tej kolumny odpowiedź wymagałaby rozwinięcia
   * każdego wiersza z osobna. Dodanie jest odnotowane sprostowaniem W MOCKUPIE
   * (`SPROSTOWANIE 2026-08-02`), bo mockup jest specyfikacją i to on ma być prawdą.
   */
  shortSession: string;
  /** Kiedy SERWER przyjął — po tym idzie porządek listy. */
  received: { text: string; sub: string };
  /** Zegar telefonu; ton bursztynowy, gdy to on się rozjechał. */
  device: { text: string; tone: CellTone | null };
  /**
   * Zegar z fixa GPS — wartość SUROWA, plus ślad korekty, jeśli jakaś to zdarzenie
   * ruszała. `className` jest PEŁNY (reguła: `.tsx` nie skleja nazw klas), a `note`
   * jest podpisem `.cell-sub` pod wartością.
   */
  gps: { text: string; className: string | null; note: string | null };
  /**
   * Różnica zegarów. `text` to napis do wypisania, a `missing` mówi, że różnicy
   * NIE MA CZEGO liczyć — to dwa różne stany i ekran ma je pokazać inaczej.
   */
  drift: { text: string; tone: CellTone | null; missing: boolean };
  type: EventTypeView;
  aircraft: { reg: string; sub: string | null };
  pilot: { name: string; sub: string };
  /** `fromPanel` = TEN WIERSZ zapisał panel; o korekcie mówi `adminCorrected`. */
  sourceDevice: { text: string; fromPanel: boolean };
  schemaVersion: number;
  /** Skrót uuid-a do rozpoznania wiersza; pełna wartość jest w rozwinięciu. */
  short: string;
  /** Korekta unieważniła zdarzenie — wiersz ZOSTAJE, ale przekreślony. */
  voided: boolean;
  /** Zdarzenie RUSZAŁA korekta — z istnienia zapisu, nie z nierówności wartości. */
  corrected: boolean;
  /** Czas nadany korektą (`retime`), sformatowany; `null` = czasu nie nadano. */
  correctedTime: string | null;
  adminCorrected: boolean;
  /** Czy zdarzenie tego typu w ogóle podlega korekcie administratora (`A02b`). */
  correctable: boolean;
}

/**
 * Skrócenie uuid-a do rozpoznania wiersza (`9f2c…41ab`) — dokładnie jak w mockupie.
 * Pełna wartość zostaje w rozwinięciu i w adresie po kliknięciu; tu chodzi o szerokość
 * kolumny, a nie o ukrycie danych. Napisy krótkie zostają w całości.
 */
export function shortUuid(value: string): string {
  return value.length > 16 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

/**
 * Różnica zegarów w sekundach, tak jak nazywa ją flaga `CLOCK_DRIFT` („720 s").
 *
 * Zaokrąglamy do pełnych sekund, bo do tego progu odnosi się reguła domeny, a ułamki
 * milisekundy w kolumnie o szerokości pięciu znaków nie odpowiadają na żadne pytanie.
 */
export function driftSeconds(ms: number): string {
  return `${Math.round(ms / 1000)} s`;
}

/**
 * Próg, powyżej którego rozjazd jest OSTRZEŻENIEM, przychodzi z SERWERA — panel go
 * wypisuje, a nie zna. Druga kopia progu w panelu rozjechałaby się z regułą przy
 * pierwszym strojeniu tolerancji, a rozjazd byłby cichy: kolor po prostu przestałby
 * odpowiadać skrzynce flag.
 */
/**
 * Ślad korekty w komórce `gps_time` — tam, gdzie korekta `retime` FAKTYCZNIE ląduje
 * (domena wpisuje nowy czas w `gpsTime`).
 *
 * Bez tego zdarzenie z korektą było w tabeli nieodróżnialne od nietkniętego: kolumny
 * pokazywały wartości surowe, a jedyna wzmianka mieszkała w rozwinięciu, które trzeba
 * otworzyć osobno dla każdego wiersza. Przekreślamy więc wartość, która przestała być
 * prawdą, i dopisujemy pod nią tę, którą liczy projekcja.
 *
 * Klasy są PEŁNYMI literałami, bo nazwa klasy nie ma prawa powstawać przez sklejenie
 * w `.tsx` — recenzent grepuje po niej mockup i arkusz naraz.
 */
function gpsCell(entry: EventEntryDto): EventRow['gps'] {
  const text = entry.gpsTime == null ? '—' : timeUtcSeconds(entry.gpsTime);

  if (entry.correctedTime != null) {
    return {
      text,
      className: entry.gpsTime == null ? 'clock-val red struck' : 'clock-val struck',
      note: `korekta → ${timeUtcSeconds(entry.correctedTime)}`,
    };
  }
  if (entry.voided) {
    return { text, className: entry.gpsTime == null ? 'clock-val red' : null, note: 'unieważnione korektą' };
  }
  if (entry.corrected) {
    // Para `void` → `retime` na czas pierwotny nie zmienia ani jednej liczby, a mimo to
    // zdarzenie ma za sobą dwie decyzje administratora. Milczenie o tym byłoby tym
    // samym błędem, co przekreślenie: wiersz wyglądałby na nietknięty.
    return {
      text,
      className: entry.gpsTime == null ? 'clock-val red' : null,
      note: 'korekta · czas bez zmiany',
    };
  }
  return { text, className: entry.gpsTime == null ? 'clock-val red' : null, note: null };
}

export function eventsRows(
  items: readonly EventEntryDto[],
  driftThresholdMs: number | null,
): EventRow[] {
  return items.map((entry) => {
    const over = driftThresholdMs != null && entry.driftMs != null && entry.driftMs > driftThresholdMs;
    const received = Date.parse(entry.receivedAt);

    return {
      uuid: entry.uuid,
      sessionUuid: entry.sessionUuid,
      shortSession: shortUuid(entry.sessionUuid),
      received: {
        // `NaN` z niepoprawnego stempla nie ma prawa wypisać „Invalid Date" — wiersz
        // zostaje, a kolumna mówi, że czasu nie da się odczytać.
        text: Number.isNaN(received)
          ? '—'
          : `${dateUtcShort(received)} ${timeUtcSeconds(received)}`,
        sub: Number.isNaN(received) ? 'stempel nieczytelny' : 'przyjęto',
      },
      device: {
        text: timeUtcSeconds(entry.deviceTime),
        // Bursztyn NA ZEGARZE TELEFONU, nie na obu: to on się rozjechał, a GPS jest
        // odniesieniem. Odwrotne pomalowanie sugerowałoby błąd fixa.
        tone: over ? 'amber' : null,
      },
      gps: gpsCell(entry),
      drift:
        entry.driftMs == null
          ? // Nie „0 s" i nie sama kreska: bez fixa nie ma DRUGIEGO zegara, więc
            // różnica nie istnieje — a projekcja spadła na czas z telefonu.
            { text: 'brak fixa', tone: 'red', missing: true }
          : { text: driftSeconds(entry.driftMs), tone: over ? 'amber' : 'dim', missing: false },
      type: eventTypeView(entry.type),
      aircraft: {
        // Rejestr jest prawdą; brak wiersza w tabeli floty odbiera NAZWĘ, nie fakt.
        reg: entry.reg ?? entry.aircraftId,
        sub: entry.reg == null ? 'jednostki nie ma już w rejestrze floty' : null,
      },
      pilot: {
        name: entry.picName ?? entry.picId,
        sub: pilotSub(entry),
      },
      sourceDevice: {
        text: entry.sourceDevice ?? '—',
        // Kolumna mówi, CZYM zdarzenie przyszło, więc podpis pod nią musi opisywać
        // POCHODZENIE TEGO wiersza (`writtenByPanel`), a nie pochodzenie jego korekty.
        // Wcześniej stał tu `adminCorrected` i skutek był dokładnie odwrotny do sensu:
        // pod nazwą telefonu pojawiało się „korekta z panelu", a sam wiersz korekty
        // zapisany przez panel podpisu nie dostawał. Rozpoznanie znacznika należy
        // do SERWERA — panel go wypisuje, a nie zna jego formatu.
        fromPanel: entry.writtenByPanel,
      },
      schemaVersion: entry.schemaVersion,
      short: shortUuid(entry.uuid),
      voided: entry.voided,
      corrected: entry.corrected,
      correctedTime: entry.correctedTime == null ? null : timeUtcSeconds(entry.correctedTime),
      adminCorrected: entry.adminCorrected,
      correctable: isCorrectable(entry.type),
    };
  });
}

/**
 * Druga linia komórki „Pilot": kod konta, a przy locie szkolnym także Dual — mockup
 * pokazuje w tym miejscu `AWR · dual MBK→KNO`. Konto skasowane zostawia sam
 * identyfikator, bo zdarzenie z rejestru nie znika razem z kontem.
 */
function pilotSub(entry: EventEntryDto): string {
  const code = entry.picCode ?? entry.picId;
  const head = entry.picName == null ? `${code} · konta nie ma już w rejestrze` : code;
  if (entry.dualId == null) return head;
  return `${head} · dual ${entry.dualCode ?? entry.dualId}`;
}

/**
 * Karta „Nagłówek zdarzenia" z rozwinięcia — wiersze klucz–wartość.
 *
 * Nazwy kluczy są SUROWYMI nazwami kolumn (`session_uuid`, `schema_version`), tak jak
 * w mockupie: ten ekran czyta się razem z bazą, a tłumaczenie ich na polskie etykiety
 * zmuszałoby do zgadywania, na którą kolumnę patrzeć w psql.
 */
export interface HeaderRow {
  label: string;
  value: string;
  /** Dopisek mniejszą czcionką — surowa epoka, wyjaśnienie braku, znacznik. */
  unit: string | null;
  tone: 'green' | 'amber' | 'red' | null;
}

export function headerRows(entry: EventEntryDto, driftThresholdMs: number | null): HeaderRow[] {
  const over = driftThresholdMs != null && entry.driftMs != null && entry.driftMs > driftThresholdMs;
  const received = Date.parse(entry.receivedAt);

  const rows: HeaderRow[] = [
    { label: 'uuid', value: entry.uuid, unit: null, tone: null },
    { label: 'session_uuid', value: entry.sessionUuid, unit: null, tone: null },
    {
      label: 'aircraft_id',
      value: entry.reg ?? entry.aircraftId,
      unit: entry.reg == null ? 'brak w rejestrze floty' : entry.aircraftId,
      tone: null,
    },
    {
      label: 'pic_id / dual_id',
      value: `${entry.picCode ?? entry.picId} / ${entry.dualCode ?? entry.dualId ?? '—'}`,
      unit: entry.dualId == null ? 'lot jednoosobowy' : null,
      tone: null,
    },
    {
      label: 'device_time',
      value: timeUtcSeconds(entry.deviceTime),
      // Surowa epoka OBOK czasu czytelnego: rejestr porównuje się z bazą, a `14:18:52`
      // nie da się wkleić do `WHERE device_time = …`.
      unit: over ? `${entry.deviceTime} · zegar ${driftSeconds(entry.driftMs ?? 0)}` : String(entry.deviceTime),
      tone: over ? 'amber' : null,
    },
    entry.gpsTime == null
      ? { label: 'gps_time', value: 'null', unit: 'brak fixa', tone: 'red' }
      : {
          label: 'gps_time',
          value: timeUtcSeconds(entry.gpsTime),
          unit: String(entry.gpsTime),
          tone: 'green',
        },
    {
      label: 'czas efektywny',
      value: timeUtcSeconds(entry.effectiveTime),
      // SKĄD wzięła się ta wartość — zdanie, którego mockup nie ma, a bez którego
      // kolumna czasu jest zagadką przy każdym wierszu bez fixa. Trzy źródła, bo są
      // trzy: korekta administratora, fix GPS i zegar telefonu. Do 2026-08-02 wiersz
      // po korekcie `retime` twierdził „z zegara telefonu — GPS nie było", choć
      // projekcja liczyła już czasem nadanym.
      unit: effectiveSource(entry),
      tone: effectiveTone(entry),
    },
    { label: 'schema_version', value: String(entry.schemaVersion), unit: null, tone: null },
    {
      label: 'received_at',
      value: Number.isNaN(received) ? '—' : timeUtcSeconds(received),
      unit: Number.isNaN(received) ? 'stempel nieczytelny' : entry.receivedAt,
      tone: null,
    },
    {
      label: 'source_device',
      value: entry.sourceDevice ?? '—',
      unit: entry.sourceDevice == null ? 'wiersz sprzed migracji 4 — pola nie było' : null,
      tone: null,
    },
  ];

  rows.push(correctionRow(entry));
  return rows;
}

/**
 * Skąd wziął się `effectiveTime` — czyli czym liczy projekcja.
 *
 * Korekta jest tu ŹRÓDŁEM PIERWSZYM, bo wygrywa nad obydwoma zegarami: domena wpisuje
 * nadany czas w `gpsTime`, więc po korekcie `effectiveClock` mówi „gps", choć fixa
 * mogło w ogóle nie być. Podpis „z GPS" byłby wtedy nieprawdą o pochodzeniu liczby —
 * na ekranie, którego jedynym zadaniem jest wyjaśnić, skąd ta liczba się wzięła.
 */
function effectiveSource(entry: EventEntryDto): string {
  if (entry.correctedTime != null) return 'czas nadany korektą — tym liczy projekcja';
  if (entry.voided) return 'zdarzenie unieważnione — projekcja go NIE liczy';
  return entry.effectiveClock === 'gps'
    ? 'z GPS — tym liczy projekcja'
    : 'z zegara telefonu — GPS nie było';
}

function effectiveTone(entry: EventEntryDto): HeaderRow['tone'] {
  if (entry.voided) return 'red';
  if (entry.correctedTime != null) return 'amber';
  return entry.effectiveClock === 'gps' ? null : 'amber';
}

/**
 * Wiersz „Korekta" — jedyne miejsce rozwinięcia, w którym panel mówi coś o SKUTKU,
 * a nie o zapisie. Cztery stany, bo znaczą cztery różne rzeczy: brak korekty,
 * przesunięcie czasu, unieważnienie i korekta, która czasu nie zmieniła. Sklejenie ich
 * w jedno „skorygowane" kazałoby otwierać kartę dnia, żeby dowiedzieć się, czy
 * zdarzenie w ogóle się liczy.
 *
 * Rozróżnienie „brak" ↔ „bez zmiany" wynika z `corrected`, czyli z ISTNIENIA zapisu —
 * porównanie wartości dawało tu „zdarzenia nikt nie ruszał" dla pary `void` → `retime`
 * na czas pierwotny, czyli po dwóch decyzjach administratora.
 */
function correctionRow(entry: EventEntryDto): HeaderRow {
  const source = entry.adminCorrected ? 'korekta z panelu' : 'korekta z telefonu (okno 24 h)';

  if (entry.voided) {
    return { label: 'korekta', value: 'unieważnione', unit: source, tone: 'red' };
  }
  if (entry.correctedTime != null) {
    return {
      label: 'korekta',
      value: `czas → ${timeUtcSeconds(entry.correctedTime)}`,
      unit: source,
      tone: 'amber',
    };
  }
  if (entry.corrected) {
    return {
      label: 'korekta',
      value: 'czas bez zmiany',
      unit: `${source} — zapis został, liczba nie`,
      tone: 'amber',
    };
  }
  return { label: 'korekta', value: 'brak', unit: 'zdarzenia nikt nie ruszał', tone: null };
}
