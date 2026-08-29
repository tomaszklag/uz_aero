/**
 * UZ Aero - panel: odpowiedź `GET /admin/api/events` do testu renderu (`A04`).
 *
 * Scenariusz jest ten sam, co w mockupie `A04-zdarzenia.html`, z jedną różnicą: dokładamy
 * przypadki, których mockup nie rysuje, bo są brzydkie - a to właśnie one łamią ekrany.
 * Fixture jest FUNKCJĄ, żeby każdy przypadek dostał własną kopię i mógł ją popsuć bez
 * wpływu na sąsiadów.
 */

import type { EventEntryDto, EventsPageDto } from '../../src/api/dto';

const DAY = Date.UTC(2026, 6, 30);
const at = (h: number, m: number, s = 0): number => DAY + ((h * 60 + m) * 60 + s) * 1000;

function entry(over: Partial<EventEntryDto>): EventEntryDto {
  const deviceTime = over.deviceTime ?? at(14, 18, 52);
  const gpsTime = over.gpsTime === undefined ? at(14, 18, 51) : over.gpsTime;
  return {
    uuid: 'ev-domyslny',
    sessionUuid: 'sess-klm',
    aircraftId: 'ac-klm',
    reg: 'SP-KLM',
    picId: 'AWR',
    picCode: 'AWR',
    picName: 'Anna Wrzosek',
    dualId: null,
    dualCode: null,
    dualName: null,
    type: 'drop',
    deviceTime,
    gpsTime,
    driftMs: gpsTime == null ? null : Math.abs(deviceTime - gpsTime),
    effectiveTime: gpsTime ?? deviceTime,
    effectiveClock: gpsTime == null ? 'device' : 'gps',
    payload: {},
    schemaVersion: 1,
    receivedAt: new Date(at(14, 19, 8)).toISOString(),
    sourceDevice: 'Pixel 7a · a41f9c',
    writtenByPanel: false,
    voided: false,
    corrected: false,
    correctedTime: null,
    adminCorrected: false,
    ...over,
  };
}

export function eventsFixture(): EventsPageDto {
  return {
    items: [
      // 1. Wiersz wzorcowy z mockupu: zgodne zegary, zagnieżdżony payload.
      entry({
        uuid: '9f2c4e18-b073-4a56-8ce1-d2740f6e41ab',
        type: 'drop',
        payload: {
          dropNumber: 9,
          jumpers: { tandem: 3, aff: 1, solo: 2 },
          client: 'SKY CAMP',
          position: { lat: 51.4013, lon: 21.1948, accuracyM: 6 },
        },
      }),
      // 2. Zegar telefonu spieszy 720 s - przypadek, przez który powstaje `CLOCK_DRIFT`.
      entry({
        uuid: '1c93be40-0000-0000-0000-00000000005f',
        type: 'day_close',
        deviceTime: at(13, 34, 47),
        gpsTime: at(13, 22, 47),
      }),
      // 3. BRAK FIXA - różnica nie istnieje, projekcja spadła na zegar telefonu.
      entry({
        uuid: 'b8d41f27-6c0a-4e93-a15b-2f7d9e604c18',
        type: 'engine_stop',
        deviceTime: at(13, 13, 33),
        gpsTime: null,
        payload: { position: null },
      }),
      // 4. Zdarzenie UNIEWAŻNIONE korektą z panelu - wiersz zostaje, przekreślony.
      entry({
        uuid: '5e2b91c7-0000-0000-0000-0000000000ab',
        type: 'landing',
        voided: true,
        corrected: true,
        adminCorrected: true,
      }),
      // 4a. Zdarzenie z korektą `retime` - czas NADANY, wiersz NIE unieważniony.
      //     Bez tego przypadku w fixture test renderu nie łapał najdroższej pomyłki
      //     tego ekranu: stanu policzonego, przetestowanego i NIEWIDOCZNEGO w tabeli.
      entry({
        uuid: '3a71dd08-0000-0000-0000-00000000c2e5',
        type: 'takeoff',
        deviceTime: at(12, 41, 6),
        gpsTime: at(12, 41, 5),
        // Kontrakt: `effectiveTime` opisuje stan PO korekcie, więc idzie za `correctedTime`.
        effectiveTime: at(12, 44, 0),
        effectiveClock: 'gps',
        corrected: true,
        correctedTime: at(12, 44, 0),
        adminCorrected: true,
      }),
      // 4b. Sam WIERSZ KOREKTY zapisany przez panel - to jego zapisał panel, a jego
      //     samego nikt nie poprawiał. Dwa różne fakty w dwóch różnych polach.
      entry({
        uuid: 'ac10f4b6-0000-0000-0000-000000000d31',
        type: 'event_correction',
        sourceDevice: 'admin:TMK',
        writtenByPanel: true,
        payload: { targetUuid: '3a71dd08-0000-0000-0000-00000000c2e5', action: 'retime' },
      }),
      // 5. Typ SPOZA katalogu i payload NIEBĘDĄCY obiektem - dwa kształty naraz,
      //    których panel nie zna i nie ma prawa się na nich wywrócić.
      entry({
        uuid: '00000000-obcy-0000-0000-000000000000',
        type: 'jakis_nowy_typ',
        payload: [1, 'dwa', null],
        reg: null,
        aircraftId: 'ac-znikniety',
        picName: null,
        picCode: null,
        picId: 'XXX',
        sourceDevice: null,
      }),
      // 6. Lot szkolny - Dual w drugiej linii komórki „Pilot".
      entry({
        uuid: '8c04ef15-0000-0000-0000-0000000007b9',
        type: 'crew_change',
        dualId: 'KNO',
        dualCode: 'KNO',
        dualName: 'Karol Nowak',
        payload: { dualId: 'KNO' },
      }),
    ],
    nextCursor: 'kursor-drugiej-strony',
    counts: { total: 247, withoutGpsFix: 23, clockDrift: 9, driftThresholdMs: 120_000 },
  };
}
