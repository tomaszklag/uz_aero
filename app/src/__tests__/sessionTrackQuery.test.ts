/**
 * UZ Aero - ślad sesji na telefonie po odwróceniu źródła (issue #47).
 *
 * Ekran 14 rysuje odtąd z danych SERWERA, ale czasy i loty liczy dalej z LOKALNEGO
 * rejestru - i to rozdzielenie jest tu najważniejsze. Test pilnuje trzech rzeczy:
 *
 *  1. **trzy powody braku znaczą co innego** i pilot musi je rozróżnić: „nie ma zasięgu"
 *     (14C - ślad jest, wróć później), „nagranie czeka w kolejce na tym telefonie",
 *     „sesja wpisana ręcznie" (14B - trasy nie było i nie będzie). Zwinięcie ich do
 *     jednego „brak śladu" kłamałoby pilotowi o jego locie;
 *  2. **brak sieci NIE zabiera czasów** - bez zasięgu ekran nadal zna bieg silnika,
 *     loty i czas w powietrzu, bo liczy je lokalnie (§6 pkt 1);
 *  3. **znaczniki powstają z rejestru**, a pozycje dobierają się do nich z pobranej
 *     linii - razem z regułą scalania maksimum ze zrzutem (mockup 14).
 */

import { EventsRepo } from '../application/eventsRepo';
import { SessionCommands, type SessionContext } from '../application/commands';
import { FlightTrackQueries } from '../application/queries';
import type { RemoteTrackOutcome, SessionTrackSource } from '../application/sync/sessionTrackFetch';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { FixedClock } from '../infrastructure/clock';
import { emptySessionTrackPayload, type SessionTrackPayload, type TrackVertex } from '../domain';

const SESSION = 'sess-47';
const AC = 'sp-axa';
const PIC = 'tmk';

const T0 = Date.UTC(2026, 7, 14, 8, 0, 0);
const min = (m: number): number => T0 + m * 60_000;

const CTX: SessionContext = { sessionUuid: SESSION, aircraftId: AC, picId: PIC, dualId: null };

/** Źródło sterowane z testu - trzy odpowiedzi, tak jak prawdziwe. */
class ScriptedSource implements SessionTrackSource {
  calls = 0;
  constructor(private readonly outcome: RemoteTrackOutcome) {}
  async fetch(): Promise<RemoteTrackOutcome> {
    this.calls += 1;
    return this.outcome;
  }
}

function setup(outcome: RemoteTrackOutcome) {
  const adapter = new InMemoryAdapter();
  const clock = new FixedClock(min(0));
  let n = 0;
  const repo = new EventsRepo(adapter, { clock, generateId: () => `ev-${++n}` });
  const commands = new SessionCommands(repo);
  const source = new ScriptedSource(outcome);
  const queries = new FlightTrackQueries(repo, adapter, source);

  return { adapter, clock, repo, commands, queries, source };
}

/** Sesja: silnik 08:12 → 09:34, lot 08:25 → 09:18, zrzut 08:52. */
async function flownSession(
  commands: SessionCommands,
  clock: FixedClock,
  options: { manual?: boolean } = {},
): Promise<void> {
  const method = options.manual === true ? 'manual' : 'auto';

  clock.set(min(0));
  await commands.claim({ ...CTX, mode: 'free' });
  clock.set(min(5));
  await commands.confirmPreflight(CTX, {
    operation: 'skoki',
    departureIcao: 'EPZG',
    arrivalIcao: 'EPZG',
    reading: { fuelL: 150, mh: 1200 },
    client: null,
    mhFormat: 'hhmm',
  });
  clock.set(min(12));
  await commands.startEngine(CTX);
  clock.set(min(25));
  await commands.takeoff(CTX, method);
  clock.set(min(52));
  await commands.drop(CTX, { altitudeFt: 12840, jumpers: { tandem: 2, aff: 0, solo: 0 } });
  clock.set(min(78));
  await commands.landing(CTX, method);
  clock.set(min(94));
  await commands.stopEngine(CTX);
}

/** Linia z serwera: jeden wierzchołek na minutę biegu silnika. */
function line(): TrackVertex[] {
  const out: TrackVertex[] = [];
  for (let m = 12; m <= 94; m++) {
    out.push({
      lat: 52.1 + m * 0.001,
      lon: 15.8,
      time: min(m),
      altitudeFt: 500 + m * 100,
      groundSpeedKt: 85,
    });
  }
  return out;
}

function payloadWithLine(): SessionTrackPayload {
  const vertices = line();
  return {
    ...emptySessionTrackPayload(SESSION),
    line: vertices,
    totalCount: vertices.length,
    usableCount: vertices.length,
    distanceNm: 12.5,
    maxAltitudeFt: 12840,
    startedAt: vertices[0]!.time,
    endedAt: vertices[vertices.length - 1]!.time,
    profile: {
      samples: vertices.map((v) => ({ time: v.time, altitudeFt: v.altitudeFt ?? 0 })),
      peakAltitudeFt: 12840,
      peakAt: min(52),
      startAltitudeFt: 600,
      endAltitudeFt: 700,
      averageClimbFtPerMin: 640,
      averageDescentFtPerMin: -1180,
      timeToPeakMs: 40 * 60_000,
    },
  };
}

describe('ślad operacji - powody braku', () => {
  it('bez zasięgu: powód „offline", a czasy operacji ZOSTAJĄ', async () => {
    const { commands, clock, queries } = setup({ kind: 'unreachable' });
    await flownSession(commands, clock);

    const view = await queries.bySession(SESSION);

    expect(view!.missing).toBe('offline');
    // Brakuje RYSUNKU, nie wiedzy: to jest cała różnica między 14C a 14B.
    expect(view!.fromAt).toBe(min(12));
    expect(view!.toAt).toBe(min(94));
    expect(view!.flights).toHaveLength(1);
    expect(view!.flightTimeMs).toBe(53 * 60_000);
  });

  it('serwer nie ma nagrania, a telefon też nie: powód „no-record"', async () => {
    const { commands, clock, queries } = setup({ kind: 'missing' });
    await flownSession(commands, clock);

    const view = await queries.bySession(SESSION);

    expect(view!.missing).toBe('no-record');
    expect(view!.pendingFixes).toBe(0);
  });

  it('nagranie czeka w kolejce NA TYM telefonie: powód „pending-upload"', async () => {
    const { commands, clock, queries, adapter } = setup({ kind: 'missing' });
    await flownSession(commands, clock);

    // Wpisy jeszcze niewysłane - po issue #47 to jedyne, co zostaje w `gps_trace`.
    for (let m = 12; m <= 20; m++) {
      await adapter.appendTrace({
        sessionUuid: SESSION,
        kind: 'fix',
        time: min(m),
        deviceTime: min(m),
        gs: 80,
        alt: 1000,
        lat: 52.1,
        lon: 15.8,
        accuracyM: 5,
        detail: null,
      });
    }

    const view = await queries.bySession(SESSION);

    expect(view!.missing).toBe('pending-upload');
    expect(view!.pendingFixes).toBe(9);
  });

  it('operacja wpisana ręcznie: powód „manual", bo trasy nigdy nie było', async () => {
    const { commands, clock, queries } = setup({ kind: 'missing' });
    await flownSession(commands, clock, { manual: true });

    expect((await queries.bySession(SESSION))!.missing).toBe('manual');
  });

  it('operacji spoza rejestru nie ma o co pytać serwera', async () => {
    const { queries, source } = setup({ kind: 'missing' });

    expect(await queries.bySession('nie-ma-takiej')).toBeNull();
    expect(source.calls).toBe(0);
  });
});

describe('ślad operacji - znaczniki', () => {
  it('powstają z REJESTRU, a pozycje dobierają się z linii serwera', async () => {
    const { commands, clock, queries } = setup({ kind: 'track', payload: payloadWithLine() });
    await flownSession(commands, clock);

    const view = await queries.bySession(SESSION);

    expect(view!.missing).toBeNull();
    const kinds = view!.markers.map((m) => m.kind);
    expect(kinds).toEqual(['takeoff', 'drop', 'landing']);

    const takeoff = view!.markers[0]!;
    expect(takeoff.at).toBe(min(25));
    expect(takeoff.position).not.toBeNull();
    expect(takeoff.position!.time).toBe(min(25));
  });

  it('maksimum w chwili zrzutu DOPISUJE się do niego, zamiast stawiać drugi punkt', async () => {
    const { commands, clock, queries } = setup({ kind: 'track', payload: payloadWithLine() });
    await flownSession(commands, clock);

    const view = await queries.bySession(SESSION);

    expect(view!.markers.filter((m) => m.kind === 'peak')).toHaveLength(0);
    const drop = view!.markers.find((m) => m.kind === 'drop')!;
    expect(drop.alsoPeak).toBe(true);
    expect(drop.altitudeFt).toBe(12840);
  });

  it('maksimum z dala od zdarzeń dostaje WŁASNY znacznik', async () => {
    const payload = payloadWithLine();
    // Szczyt w połowie zniżania - kwadrans od zrzutu i od lądowania.
    payload.profile = { ...payload.profile, peakAt: min(65) };

    const { commands, clock, queries } = setup({ kind: 'track', payload });
    await flownSession(commands, clock);

    const view = await queries.bySession(SESSION);
    const peak = view!.markers.find((m) => m.kind === 'peak');

    expect(peak).toBeDefined();
    expect(peak!.at).toBe(min(65));
    expect(peak!.altitudeFt).toBe(12840);
  });
});
