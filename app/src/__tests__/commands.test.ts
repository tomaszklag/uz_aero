/**
 * UZ Aero — testy WARSTWY KOMEND (`application/commands`).
 *
 * Rules mówią „czy wolno", komendy — „co się faktycznie stało z bazą". Tu pilnujemy
 * rzeczy, których czysta funkcja nie pokaże:
 *  - odrzucone zdarzenie NIE zostawia śladu w strumieniu ani w outboxie,
 *  - miękka flaga NIE blokuje zapisu i wraca do UI,
 *  - limity samolotu pochodzą z cache referencyjnego (offline → reguła śpi),
 *  - kanoniczny dzień przechodzi przez komendy od claimu do zamknięcia.
 *
 * Wszystko na `InMemoryAdapter` — bez natywnego SQLite.
 */

import { DomainRuleError, projectSession } from '../domain';
import { EventsRepo } from '../application/eventsRepo';
import { SessionCommands, type SessionContext } from '../application/commands';
import { SessionQueries } from '../application/queries';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { FixedClock } from '../infrastructure/clock';

const SESSION = 'sess-22jun';
const AC = 'sp-axa';
const PIC = 'tmk';

const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const min = (m: number): number => T0 + m * 60_000;
const MH_START = 1234.5;

const CTX: SessionContext = {
  sessionUuid: SESSION,
  aircraftId: AC,
  picId: PIC,
  dualId: null,
};

function setup(withAircraftCache = true) {
  const adapter = new InMemoryAdapter();
  const clock = new FixedClock(min(0));
  let n = 0;
  const repo = new EventsRepo(adapter, { clock, generateId: () => `id-${++n}` });
  const commands = new SessionCommands(repo);
  const queries = new SessionQueries(repo);

  const seedCache = async (): Promise<void> => {
    if (!withAircraftCache) return;
    await repo.upsertAircraft([
      {
        id: AC,
        reg: 'SP-AXA',
        type: 'C182',
        year: 2019,
        capacityL: 330,
        mhFormat: 'hhmm',
        dualRequired: false,
        serviceStatus: 'active',
        claimPicId: null,
        claimSince: null,
        handover: null,
      },
    ]);
  };

  return { adapter, repo, commands, queries, clock, seedCache };
}

/** Otwiera dzień: claim + preflight (08:00). */
async function openDay(commands: SessionCommands, clock: FixedClock): Promise<void> {
  clock.set(min(-5));
  await commands.claim({ ...CTX, mode: 'free' });
  clock.set(min(0));
  await commands.confirmPreflight(CTX, {
    operation: 'skoki',
    departureIcao: 'EPKK',
    arrivalIcao: 'EPKK',
    dutyStart: min(0),
    reading: { fuelL: 150, mh: MH_START },
    client: 'Strefa EPKK',
    mhFormat: 'hhmm',
  });
}

describe('SessionCommands — odrzucenie nie zostawia śladu', () => {
  it('takeoff bez pracującego silnika rzuca i nic nie zapisuje', async () => {
    const { commands, repo, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);

    const before = (await repo.getAllEvents()).length;
    clock.set(min(25));

    await expect(commands.takeoff(CTX, 'auto')).rejects.toBeInstanceOf(DomainRuleError);
    await expect(commands.takeoff(CTX, 'auto')).rejects.toMatchObject({
      code: 'ENGINE_NOT_RUNNING',
    });

    expect(await repo.getAllEvents()).toHaveLength(before);
    expect(await repo.getOutboxCount()).toBe(before);
  });

  it('komunikat błędu jest po polsku i konkretny (trafia wprost do pilota)', async () => {
    const { commands, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);

    await expect(commands.landing(CTX)).rejects.toThrow(/Lądowanie bez startu/);
  });

  it('zdarzenie od cudzego PIC-a jest odrzucane (single-writer)', async () => {
    const { commands, repo, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);

    clock.set(min(12));
    await expect(
      commands.startEngine({ ...CTX, picId: 'inny-pilot' }),
    ).rejects.toMatchObject({ code: 'WRITER_MISMATCH' });
    expect(await repo.getAllEvents()).toHaveLength(2);
  });

  it('cofnięty licznik MH przy zamknięciu dnia jest odrzucany', async () => {
    const { commands, repo, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);
    clock.set(min(12));
    await commands.startEngine(CTX);
    clock.set(min(154));
    await commands.stopEngine(CTX);

    clock.set(min(300));
    await expect(
      commands.dayClose(CTX, {
        finalReading: { fuelL: 112, mh: MH_START - 2 },
        dutyEnd: min(300),
      }),
    ).rejects.toMatchObject({ code: 'MH_REGRESSION' });

    const state = projectSession(await repo.getSessionEvents(SESSION));
    expect(state.closed).toBe(false);
  });
});

describe('SessionCommands — miękkie flagi nie blokują zapisu', () => {
  it('zrzut poza lotem zapisuje się i wraca z ostrzeżeniem', async () => {
    const { commands, repo, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);
    clock.set(min(12));
    await commands.startEngine(CTX);

    clock.set(min(20));
    const result = await commands.drop(CTX, { jumpers: { tandem: 2, aff: 1, solo: 1 } });

    expect(result.warnings.map((w) => w.code)).toEqual(['DROP_ON_GROUND']);
    expect(result.event.type).toBe('drop');
    expect(await repo.getEvent(result.event.uuid)).not.toBeNull();
  });

  it('numer zrzutu i klient dopełniają się z projekcji', async () => {
    const { commands, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);
    clock.set(min(12));
    await commands.startEngine(CTX);
    clock.set(min(25));
    await commands.takeoff(CTX, 'auto');

    clock.set(min(40));
    const first = await commands.drop(CTX, { jumpers: { tandem: 1, aff: 0, solo: 0 } });
    clock.set(min(45));
    const second = await commands.drop(CTX, { jumpers: { tandem: 0, aff: 1, solo: 0 } });

    expect(first.event.type === 'drop' && first.event.payload.dropNumber).toBe(1);
    expect(second.event.type === 'drop' && second.event.payload.dropNumber).toBe(2);
    expect(first.event.type === 'drop' && first.event.payload.client).toBe('Strefa EPKK');
    expect(first.warnings).toEqual([]);
  });
});

describe('SessionCommands — limity z cache referencyjnego (§4.8)', () => {
  it('z cache: tankowanie ponad pojemność zbiorników jest odrzucane', async () => {
    const { commands, clock, seedCache } = setup(true);
    await seedCache();
    await openDay(commands, clock);

    clock.set(min(168));
    await expect(
      commands.refuel(CTX, { beforeL: 300, addedL: 100, afterL: 400 }),
    ).rejects.toMatchObject({ code: 'FUEL_OVER_CAPACITY' });
  });

  it('offline bez cache: reguła pojemności śpi, praca nie jest blokowana', async () => {
    const { commands, repo, clock } = setup(false);
    await openDay(commands, clock);

    clock.set(min(168));
    const result = await commands.refuel(CTX, { beforeL: 300, addedL: 100, afterL: 400 });
    expect(result.event.type).toBe('refuel');
    expect(await repo.getEvent(result.event.uuid)).not.toBeNull();
  });
});

describe('SessionCommands — pełny dzień przez komendy', () => {
  it('kanoniczny cykl przechodzi i daje spójną projekcję', async () => {
    const { commands, queries, repo, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);

    clock.set(min(12));
    await commands.startEngine(CTX, { fieldElevationFt: 780 });
    clock.set(min(25));
    await commands.takeoff(CTX, 'auto');
    clock.set(min(48));
    await commands.drop(CTX, { jumpers: { tandem: 2, aff: 1, solo: 1 }, altitudeFt: 2450 });
    clock.set(min(78));
    await commands.landing(CTX, 'auto');
    clock.set(min(154));
    await commands.stopEngine(CTX);
    clock.set(min(168));
    await commands.refuel(CTX, { beforeL: 112, addedL: 48, afterL: 160 });
    clock.set(min(300));
    const closed = await commands.dayClose(CTX, {
      finalReading: { fuelL: 160, mh: MH_START + 142 / 60 },
      dutyEnd: min(300),
    });

    expect(closed.warnings).toEqual([]);

    const state = await queries.sessionState(SESSION);
    expect(state.blockTimeMs).toBe(142 * 60_000); // 08:12 → 10:34 = 2:22
    expect(state.flights).toHaveLength(1);
    expect(state.flightTimeMs).toBe(53 * 60_000); // 08:25 → 09:18 = 0:53
    expect(state.fuel.startL).toBe(150);
    expect(state.fuel.addedL).toBe(48);
    expect(state.fuel.endL).toBe(160);
    expect(state.drops.totalJumpers).toBe(4);
    expect(state.closed).toBe(true);

    // Wszystko czeka w outboxie — sieć nie była potrzebna do żadnej z tych akcji (§4.1).
    const outbox = await queries.outboxStatus();
    expect(outbox.count).toBe((await repo.getAllEvents()).length);
    expect(outbox.synced).toBe(false);
  });

  it('claim zapamiętuje bieżącą sesję w session_meta (wznowienie po restarcie)', async () => {
    const { commands, queries, clock, seedCache } = setup();
    await seedCache();
    clock.set(min(-5));
    await commands.claim({ ...CTX, mode: 'takeover_offline', previousPicId: 'krz' });

    expect(await queries.currentSession()).toEqual({
      sessionUuid: SESSION,
      pilotId: PIC,
      aircraftId: AC,
    });
  });
});
