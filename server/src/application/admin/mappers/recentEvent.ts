/**
 * UZ Aero (serwer) - wiersz rejestru → pozycja karty „Ostatnio przyjęte" (`A01`).
 *
 * ══ DWA CZASY W JEDNYM WIERSZU I OBA SĄ POTRZEBNE ══
 * `eventTime` odpowiada na pytanie „kiedy to się stało" i jest liczone TĄ SAMĄ regułą,
 * co w domenie: GPS przed zegarem telefonu (§4.1 pkt 6 - zegar urządzenia bywa
 * przestawiony, GPS nie). `receivedAt` odpowiada na pytanie „kiedy się o tym
 * dowiedzieliśmy" i to on porządkuje listę. Paczka z zaległego outboxu ma te dwa czasy
 * odległe o godziny - i właśnie o tym jest ta karta.
 *
 * Reguły wyboru czasu NIE powtarzamy tu z pamięci: `eventTime` z `@uzaero/domain`
 * przyjmuje `Event`, a tu mamy surowy wiersz, więc powielony byłby jednym `??`.
 * Zamiast tego test mappera trzyma go przy pakiecie - a gdyby domena kiedyś zmieniła
 * preferencję, rozjazd zobaczy `test/adminDashboard.test.ts`.
 */

import type { EventType } from '@uzaero/domain';

import type { AdminRecentEvent } from '../contracts/dashboard.ts';
import type { AdminRecentEventRow } from '../ports.ts';

export function recentEvent(row: AdminRecentEventRow): AdminRecentEvent {
  return {
    uuid: row.uuid,
    sessionUuid: row.sessionUuid,
    aircraftId: row.aircraftId,
    reg: row.reg,
    // Kolumna `events.type` jest `TEXT` i nie ma `CHECK`-a - dokładnie jak w adapterze
    // strumienia (`PgEventsStore.toEvent`). Walidacja typu zdarzenia zachodzi na
    // wejściu, w `POST /events`; tutaj czytamy to, co zostało przyjęte.
    type: row.type as EventType,
    eventTime: row.gpsTime ?? row.deviceTime,
    receivedAt: row.receivedAt.toISOString(),
    picId: row.picId,
    picCode: row.picCode,
    picName: row.picName,
  };
}
