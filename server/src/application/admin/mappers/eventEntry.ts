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
   * Cele ruszone korektą ZAPISANĄ Z PANELU — niezależnie od tego, czy ostatecznie
   * wygrała. Pytamy o istnienie śladu, nie o wynik: wpis `event.correct` w dzienniku
   * audytu wskazuje zdarzenie POPRAWIANE, więc ma treść także wtedy, gdy późniejsza
   * korekta odwróciła skutek. Ta sama reguła, co na osi karty dnia.
   */
  const adminCorrected = new Set<string>();
  for (const row of [...rows, ...corrections]) {
    if (row.type !== 'event_correction' || !isAdminSourceDevice(row.sourceDevice)) continue;
    const target = (row.payload as { targetUuid?: unknown } | null)?.targetUuid;
    if (typeof target === 'string') adminCorrected.add(target);
  }

  return rows.map((row) => {
    // Korekta korekty nie istnieje (poprawia się fakt, nie poprawkę), a `applyCorrections`
    // usuwa korekty ze strumienia efektywnego — więc bez tego rozróżnienia KAŻDY wiersz
    // `event_correction` wyglądałby na unieważniony.
    const isCorrection = row.type === 'event_correction';
    const after = isCorrection ? undefined : effective.get(row.uuid);

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
      effectiveTime: row.gpsTime ?? row.deviceTime,
      effectiveClock: row.gpsTime == null ? 'device' : 'gps',
      payload: row.payload,
      schemaVersion: row.schemaVersion,
      receivedAt: row.receivedAt.toISOString(),
      sourceDevice: row.sourceDevice,
      voided: !isCorrection && after === undefined,
      // Korekta `retime` wchodzi w `gpsTime` (tak robi domena), więc RÓŻNICA wobec
      // surowego `gpsTime` jest jedynym śladem, że czas ktoś nadał. Porównujemy
      // z wartością surową, nie z `effectiveTime`: zdarzenie bez fixa, któremu korekta
      // nadała czas, ma `gpsTime: null` w bazie i konkretną wartość po korekcie.
      correctedTime:
        after != null && after.gpsTime !== row.gpsTime ? (after.gpsTime ?? null) : null,
      adminCorrected: adminCorrected.has(row.uuid),
    };
  });
}
