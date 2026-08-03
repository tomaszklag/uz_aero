/**
 * UZ Aero (serwer) — wiersz `events` → pozycja rejestru zdarzeń (`A04`).
 *
 * Czysta funkcja, testowana bez bazy — jak `sessionListItem` i `eventTimeline`.
 * Robi dokładnie trzy rzeczy i żadna z nich nie jest interpretacją treści zdarzenia:
 *
 *  1. **liczy różnicę zegarów** — `|device − gps|`, z `null`-em, gdy nie było fixa;
 *  2. **nazywa czas efektywny** — `gpsTime ?? deviceTime` i mówi, KTÓRY to zegar;
 *  3. **nakłada korekty** domenowym `applyCorrections`, żeby wiersz unieważniony
 *     przyjechał przekreślony, a nie zniknął.
 *
 * ══ DLACZEGO `applyCorrections`, A NIE WŁASNE CZYTANIE KOREKT ══
 * Reguła „gdy jedno zdarzenie ma kilka korekt, wygrywa ostatnia" (razem z parą
 * `void` → `retime`, która przywraca zdarzenie do życia) mieszka w `@uzaero/domain`
 * i ma tam mieć JEDNĄ implementację. Druga kopia w rejestrze rozjechałaby się przy
 * pierwszej zmianie reguły — i to w miejscu, które istnieje po to, żeby pokazywać
 * prawdę o rejestrze. Ta sama decyzja, co w `mappers/eventTimeline.ts`.
 *
 * Wejściem jest STRONA plus korekty celujące w jej wiersze — nie cały strumień sesji.
 * `applyCorrections` potrzebuje wyłącznie celu i wszystkich jego korekt, a te są
 * komplet: adapter dobiera je po `payload->>'targetUuid'`, niezależnie od filtra.
 *
 * ══ CZEGO TU NIE MA ══
 * Ani jednego strażnika typu zdarzenia i ani jednego założenia o kształcie payloadu.
 * `type` przepisujemy napisem, `payload` — referencją. Rejestr pokazuje to, co przyszło.
 */

import { applyCorrections, type Event } from '@uzaero/domain';

import type { AdminEventEntry } from '../contracts/events.ts';
import type { AdminEventRow } from '../ports.ts';
import { isAdminSourceDevice } from '../sourceDevice.ts';

/**
 * Wiersz bazy → byt domenowy dla `applyCorrections`.
 *
 * Rzutowanie jest tym samym, co w `PgEventsStore.toEvent`, i z tego samego powodu:
 * kolumny `type` i `payload` nie mają w bazie `CHECK`-a, więc typ domenowy jest tu
 * OBIETNICĄ WEJŚCIA (`POST /events`), a nie faktem odczytu. `syncedAt` to pole
 * klienckie — na serwerze bez znaczenia.
 */
const toEvent = (row: AdminEventRow): Event =>
  ({
    uuid: row.uuid,
    sessionUuid: row.sessionUuid,
    aircraftId: row.aircraftId,
    picId: row.picId,
    dualId: row.dualId,
    type: row.type,
    deviceTime: row.deviceTime,
    gpsTime: row.gpsTime,
    payload: row.payload,
    schemaVersion: row.schemaVersion,
    syncedAt: null,
  }) as Event;

/** `|device − gps|`; `null` = brak fixa, więc różnicy nie ma czego opisywać. */
export function driftOf(row: Pick<AdminEventRow, 'deviceTime' | 'gpsTime'>): number | null {
  return row.gpsTime == null ? null : Math.abs(row.deviceTime - row.gpsTime);
}

export function eventEntries(
  rows: readonly AdminEventRow[],
  /** Korekty celujące w `rows` — także spoza strony i spoza filtra. */
  corrections: readonly AdminEventRow[],
): AdminEventEntry[] {
  // Strona bywa sama pełna korekt (chip `event_correction`), więc łączymy przez mapę:
  // ten sam uuid dwa razy dałby `applyCorrections` dwie kopie tej samej korekty i —
  // przy `void` → `retime` — wynik zależny od kolejności scalania.
  const stream = new Map<string, Event>();
  for (const row of [...rows, ...corrections]) stream.set(row.uuid, toEvent(row));

  const effective = new Map(applyCorrections([...stream.values()]).map((e) => [e.uuid, e]));

  /**
   * Dwa zbiory celów, oba budowane z ISTNIENIA korekty, nie z jej wyniku.
   *
   *  • `corrected` — ktoś to zdarzenie RUSZAŁ. To jest fakt niezależny od tego, czy
   *    liczba się zmieniła: para `void` → `retime` na czas PIERWOTNY nie zmienia ani
   *    jednej wartości, a mimo to zdarzenie ma za sobą dwie decyzje administratora
   *    i nie jest tym samym, co zdarzenie nietknięte. Porównanie wartości (`after.gpsTime
   *    !== row.gpsTime`) dawało tu `null`, czyli wiersz nieodróżnialny od surowego —
   *    i sprzeczność na jednym ekranie, bo kolumna `source_device` mówiła o korekcie,
   *    a rozwinięcie „zdarzenia nikt nie ruszał".
   *  • `adminCorrected` — tę korektę zapisał PANEL, a nie pilot w oknie 24 h. Wpis
   *    `event.correct` w dzienniku audytu wskazuje zdarzenie POPRAWIANE, więc ma treść
   *    także wtedy, gdy późniejsza korekta odwróciła skutek. Ta sama reguła, co na osi
   *    karty dnia.
   */
  const corrected = new Set<string>();
  const adminCorrected = new Set<string>();
  for (const row of [...rows, ...corrections]) {
    if (row.type !== 'event_correction') continue;
    const target = (row.payload as { targetUuid?: unknown } | null)?.targetUuid;
    if (typeof target !== 'string') continue;
    corrected.add(target);
    if (isAdminSourceDevice(row.sourceDevice)) adminCorrected.add(target);
  }

  return rows.map((row) => {
    // Korekta korekty nie istnieje (poprawia się fakt, nie poprawkę), a `applyCorrections`
    // usuwa korekty ze strumienia efektywnego — więc bez tego rozróżnienia KAŻDY wiersz
    // `event_correction` wyglądałby na unieważniony.
    const isCorrection = row.type === 'event_correction';
    const after = isCorrection ? undefined : effective.get(row.uuid);

    /**
     * Zdarzenie w postaci, KTÓRĄ LICZY PROJEKCJA — po korektach, gdy jakaś wygrała.
     *
     * Wiersz unieważniony i sama korekta nie mają takiej postaci (`after` jest wtedy
     * `undefined`), więc czas efektywny opisuje dla nich zapis surowy: projekcja
     * pierwszego nie liczy wcale, a drugi nie jest jej wejściem.
     */
    const projected = after ?? row;

    return {
      uuid: row.uuid,
      sessionUuid: row.sessionUuid,
      aircraftId: row.aircraftId,
      reg: row.reg,
      picId: row.picId,
      picCode: row.picCode,
      picName: row.picName,
      dualId: row.dualId,
      dualCode: row.dualCode,
      dualName: row.dualName,
      type: row.type,
      deviceTime: row.deviceTime,
      gpsTime: row.gpsTime,
      driftMs: driftOf(row),
      // Czas, KTÓRYM LICZY PROJEKCJA — czyli po korekcie, jeśli jakaś wygrała. Liczony
      // z kolumn surowych kłamał dokładnie tam, gdzie ekran ma wyjaśniać liczby: zaraz
      // po korekcie `retime` z `A02b` rejestr pisał „czas efektywny 00:00:01 · z zegara
      // telefonu", choć projekcja liczyła już czasem nadanym.
      effectiveTime: projected.gpsTime ?? projected.deviceTime,
      effectiveClock: projected.gpsTime == null ? 'device' : 'gps',
      payload: row.payload,
      schemaVersion: row.schemaVersion,
      receivedAt: row.receivedAt.toISOString(),
      sourceDevice: row.sourceDevice,
      /** Ten WIERSZ zapisał panel — fakt o pochodzeniu zapisu, nie o jego korekcie. */
      writtenByPanel: isAdminSourceDevice(row.sourceDevice),
      voided: !isCorrection && after === undefined,
      /** Zdarzenie ruszała korekta — z ISTNIENIA zapisu, nie z nierówności wartości. */
      corrected: !isCorrection && corrected.has(row.uuid),
      // Korekta `retime` wchodzi w `gpsTime` (tak robi domena), więc czas nadany
      // odczytujemy ze strumienia efektywnego. `null` znaczy „czasu nie nadano" —
      // bo zdarzenie jest unieważnione albo korekta w ogóle nie ruszyła zegara.
      correctedTime:
        after != null && after.gpsTime !== row.gpsTime ? (after.gpsTime ?? null) : null,
      adminCorrected: adminCorrected.has(row.uuid),
    };
  });
}
