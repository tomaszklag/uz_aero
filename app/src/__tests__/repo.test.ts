/**
 * UZ Aero - testy repozytorium + InMemoryAdapter (warstwa danych, §4.1/§4.3/§4.8).
 * Rdzeń: append→odczyt, outbox (`synced_at IS NULL`), markSynced, dedup po uuid,
 * dwa zegary (deviceTime + gpsTime), cache referencyjny z fetchedAt.
 */

import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { EventsRepo } from '../application/eventsRepo';
import { FixedClock } from '../infrastructure/clock';
import type { AppendEventInput } from '../domain';

const SESSION = 'sess-1';
const AC = 'ac-1';
const PIC = 'pic-1';

function makeRepo(clock: FixedClock = new FixedClock(1_000)) {
  const adapter = new InMemoryAdapter();
  let n = 0;
  const repo = new EventsRepo(adapter, { clock, generateId: () => `id-${++n}` });
  return { adapter, repo, clock };
}

/** Minimalne, poprawnie skorelowane wejście `engine_start`. */
function engineStart(
  overrides: { uuid?: string; deviceTime?: number; gpsTime?: number | null } = {},
): AppendEventInput {
  return {
    type: 'engine_start',
    payload: {},
    sessionUuid: SESSION,
    aircraftId: AC,
    picId: PIC,
    ...overrides,
  };
}

describe('EventsRepo + InMemoryAdapter', () => {
  it('append → odczyt (getEvent i getSessionEvents)', async () => {
    const { repo } = makeRepo();
    const ev = await repo.appendEvent(engineStart());

    const back = await repo.getEvent(ev.uuid);
    expect(back).not.toBeNull();
    expect(back!.type).toBe('engine_start');
    expect(back!.sessionUuid).toBe(SESSION);

    const session = await repo.getSessionEvents(SESSION);
    expect(session).toHaveLength(1);
    expect(session[0]!.uuid).toBe(ev.uuid);
  });

  it('każde zdarzenie niesie deviceTime; gpsTime z zegara lub z argumentu (nullable)', async () => {
    const clock = new FixedClock(5_000, 4_900); // now=5000, gps=4900
    const { repo } = makeRepo(clock);

    // Domyślnie: deviceTime z zegara, gpsTime z ostatniego fixa.
    const a = await repo.appendEvent(engineStart());
    expect(a.deviceTime).toBe(5_000);
    expect(a.gpsTime).toBe(4_900);

    // Jawny brak fixa: gpsTime = null (mimo że zegar zna fix).
    const b = await repo.appendEvent(engineStart({ gpsTime: null }));
    expect(b.gpsTime).toBeNull();

    // Jawne wartości (backfill/testy) mają pierwszeństwo nad zegarem.
    const c = await repo.appendEvent(engineStart({ deviceTime: 8_888, gpsTime: 7_777 }));
    expect(c.deviceTime).toBe(8_888);
    expect(c.gpsTime).toBe(7_777);

    // Wszystkie trwają w outboxie z ustawionym deviceTime.
    for (const e of await repo.getOutbox()) {
      expect(typeof e.deviceTime).toBe('number');
    }
  });

  it('outbox filtruje synced_at IS NULL; markSynced usuwa z outboxa i zachowuje kolejność', async () => {
    const { repo } = makeRepo();
    const a = await repo.appendEvent(engineStart());
    const b = await repo.appendEvent(engineStart());
    const c = await repo.appendEvent(engineStart());

    expect(await repo.getOutboxCount()).toBe(3);

    await repo.markSynced([a.uuid, c.uuid], 99_999);

    const outbox = await repo.getOutbox();
    expect(outbox.map((e) => e.uuid)).toEqual([b.uuid]); // tylko niewysłane, w kolejności
    expect(outbox.every((e) => e.syncedAt == null)).toBe(true);

    const aBack = await repo.getEvent(a.uuid);
    expect(aBack!.syncedAt).toBe(99_999);
  });

  it('dedup po uuid - ponowny append tego samego uuid nie duplikuje', async () => {
    const { repo } = makeRepo();
    const first = await repo.appendEvent(engineStart({ uuid: 'fixed', deviceTime: 1 }));
    const second = await repo.appendEvent(engineStart({ uuid: 'fixed', deviceTime: 999 }));

    // Zwraca rekord JUŻ zapisany (z pierwszego appendu), nie duplikuje.
    expect(second.uuid).toBe('fixed');
    expect(second.deviceTime).toBe(1);

    expect(await repo.getAllEvents()).toHaveLength(1);
    expect(await repo.getOutboxCount()).toBe(1);
  });

  it('markSynced ignoruje nieznane uuid (idempotencja synca)', async () => {
    const { repo } = makeRepo();
    const a = await repo.appendEvent(engineStart());
    await expect(repo.markSynced(['nie-ma-takiego'], 1)).resolves.toBeUndefined();
    expect(await repo.getOutboxCount()).toBe(1);
    expect((await repo.getEvent(a.uuid))!.syncedAt).toBeNull();
  });

  it('cache referencyjny: upsert stempluje fetchedAt, getAircraft/getAircraftById zwraca dane', async () => {
    const clock = new FixedClock(12_345);
    const { repo } = makeRepo(clock);

    await repo.upsertAircraft([
      {
        id: 'ac-1',
        reg: 'SP-AXA',
        type: 'C182',
        year: 1998,
        capacityL: 330,
        mhFormat: 'decimal',
        dualRequired: false,
        serviceStatus: 'active',
        claimPicId: null,
        claimSince: null,
        handover: null,
        consumption: null,
        // Konfiguracja oleju (issue #60) - musi przeżyć rundę zapis→odczyt.
        oilMinL: 8.5,
        oilCapacityL: 11.4,
        oilNormLPerH: 0.12,
      },
    ]);
    await repo.upsertPilots([{ id: 'pic-1', code: 'KRZ', name: 'Jan Kowalski', active: true }]);

    const aircraft = await repo.getAircraft();
    expect(aircraft).toHaveLength(1);
    expect(aircraft[0]!.reg).toBe('SP-AXA');
    expect(aircraft[0]!.fetchedAt).toBe(12_345); // stempel z zegara repo

    const byId = await repo.getAircraftById('ac-1');
    expect(byId?.capacityL).toBe(330);
    expect(byId?.oilMinL).toBe(8.5);
    expect(byId?.oilCapacityL).toBe(11.4);
    expect(byId?.oilNormLPerH).toBe(0.12);

    const pilots = await repo.getPilots();
    expect(pilots[0]!.code).toBe('KRZ');
    expect(pilots[0]!.fetchedAt).toBe(12_345);
  });

  it('session_meta: zapis i odczyt bieżącej sesji', async () => {
    const { repo } = makeRepo();
    await repo.setCurrentSession({ sessionUuid: SESSION, pilotId: PIC, aircraftId: AC });
    expect(await repo.getCurrentSession()).toEqual({
      sessionUuid: SESSION,
      pilotId: PIC,
      aircraftId: AC,
    });
  });
});
