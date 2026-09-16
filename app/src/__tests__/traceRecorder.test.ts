/**
 * Ninerdeck - testy śladu kalibracyjnego (faza 5): rejestrator + wysyłka.
 *
 * Kontrakty warte pilnowania: księgowość wysyłki jak w outboksie (wysłane nie wraca),
 * retencja tnie po ZEGARZE URZĄDZENIA, a nieudana wysyłka zostawia wpisy na miejscu.
 */

import { AuthService } from '../application/auth/authService';
import { TRACE_RETENTION_DAYS, TraceRecorder } from '../application/traceRecorder';
import { TRACE_BATCH_LIMIT, TraceSync } from '../application/sync/traceSync';
import {
  ServerUnreachableError,
  type AuthTokens,
  type ServerPort,
  type StoredCredentials,
} from '../application/ports';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { PinCrypto } from '../infrastructure/auth/pinCrypto';
import { FixedClock } from '../infrastructure/clock';

const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const PILOT = { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz' };
/** Klub, DLA KTÓREGO wydano parę tokenów (wielofirmowość §6). */
const ORG = { id: 'org-a', slug: 'alfa', name: 'Aeroklub Alfa' };
const CREDS: StoredCredentials = { token: 'jwt-1', refreshToken: 'r1', pilot: PILOT, org: ORG, memberships: [] };

class MemoryCredentials {
  // Osoba bez klubu (wielofirmowość §4) - nieużywana w tych testach.
  loadPerson = async (): Promise<null> => null;
  savePerson = async (_person: unknown): Promise<void> => {};
  clearPerson = async (): Promise<void> => {};
  load = async () => CREDS;
  save = async (_c: StoredCredentials) => {};
  clear = async () => {};
}

/** Serwer śladu: rejestruje paczki; `fail = true` symuluje brak zasięgu. */
class TraceServer implements ServerPort {
  async loginWithGoogle(): Promise<never> {
    throw new Error('nieużywane w tych testach');
  }

  // Trasy BEZ KLUBU (wielofirmowość §6) - te przekroje ich nie dotykają.
  async membershipStatus(): Promise<never> {
    throw new Error('nieużywane w tych testach');
  }

  async joinClub(): Promise<never> {
    throw new Error('nieużywane w tych testach');
  }

  async switchClub(): Promise<never> {
    throw new Error('nieużywane w tych testach');
  }

  pushed: unknown[][] = [];
  fail = false;

  async pushTraces(_token: string, entries: unknown[]): Promise<{ accepted: number }> {
    if (this.fail) throw new ServerUnreachableError();
    this.pushed.push(entries);
    return { accepted: entries.length };
  }

  pushBugReports = async (): Promise<never> => {
    throw new Error('ta atrapa nie obsługuje zgłoszeń błędów');
  };

  getSessionTrack = async (): Promise<never> => {
    throw new Error('ta atrapa nie obsługuje śladu operacji');
  };

  login = async (): Promise<AuthTokens> => ({ token: 'jwt-1', refreshToken: 'r1', pilot: PILOT, org: ORG, memberships: [] });
  refresh = async (): Promise<AuthTokens> => ({ token: 'jwt-2', refreshToken: 'r2', pilot: PILOT, org: ORG, memberships: [] });
  pushEvents = async () => ({ accepted: 0, duplicates: 0, flags: [] });
  getReference = async () => ({ data: { aircraft: [], pilots: [] }, etag: null });
  getReadingsChain = async () => ({ before: null, after: null, oil: null });
  getAircraftState = async () => ({
    aircraftId: 'SP-AXA',
    claimPicId: null,
    claimSince: null,
    handover: null,
    lastSyncAt: null,
  });
  getSyncStatus = async () => {
    throw new Error('nieużywane');
  };
  getTaskSuggestions = async () => {
    throw new Error('nieużywane');
  };
  /** Droga powrotna (§4.9) ma własne testy - `eventRestore.test.ts`. */
  pullEvents = async () => ({ events: [], nextCursor: null, hasMore: false });
  getPrefs = async () => {
    throw new Error('nieużywane');
  };
  putPrefs = async () => {
    throw new Error('nieużywane');
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness() {
  const clock = new FixedClock(T0);
  const store = new InMemoryAdapter();
  const recorder = new TraceRecorder(store, clock);
  const server = new TraceServer();
  const sync = new TraceSync(
    store,
    server,
    new AuthService(server, new MemoryCredentials(), new PinCrypto()),
  );
  return { clock, store, recorder, server, sync };
}

const aFix = (sec: number) => ({
  time: T0 + sec * 1000,
  groundSpeedKt: 60,
  altitudeFt: 900,
  lat: 50.078,
  lon: 19.785,
  accuracyM: 5,
});

describe('TraceRecorder', () => {
  it('zapisuje surowe fixy i markery z kontekstem operacji', async () => {
    const { store, recorder } = harness();

    recorder.fix(aFix(0), 'sess-1');
    recorder.marker('undo', 'landing', T0 + 5_000, 'sess-1');
    await flush(); // zapis jest fire-and-forget

    const batch = await store.getTraceBatch(10);
    expect(batch).toHaveLength(2);
    expect(batch[0]).toMatchObject({ kind: 'fix', gs: 60, accuracyM: 5, sessionUuid: 'sess-1' });
    expect(batch[1]).toMatchObject({ kind: 'undo', detail: 'landing' });
  });

  it('retencja tnie po zegarze urządzenia - stare znikają, świeże zostają', async () => {
    const { clock, store, recorder } = harness();
    recorder.fix(aFix(0), null);
    await flush();

    clock.advance((TRACE_RETENTION_DAYS + 1) * 86_400_000);
    recorder.fix(aFix(1), null);
    await flush();

    expect(await recorder.purgeExpired()).toBe(1);
    expect((await recorder.stats()).total).toBe(1);
  });
});

describe('TraceSync', () => {
  it('wysyła paczkę i oznacza wysłane - druga okazja nie dubluje', async () => {
    const { recorder, server, sync } = harness();
    recorder.fix(aFix(0), 'sess-1');
    recorder.fix(aFix(1), 'sess-1');
    await flush();

    expect(await sync.uploadOnce()).toBe(2);
    expect(await sync.uploadOnce()).toBe(0); // księgowość jak w outboksie
    expect(server.pushed).toHaveLength(1);
    // Na drut idą dane bez lokalnej księgowości (id/uploadedAt).
    expect(server.pushed[0]![0]).not.toHaveProperty('id');
  });

  it('brak zasięgu: wpisy zostają i wychodzą przy następnej okazji', async () => {
    const { recorder, server, sync } = harness();
    recorder.fix(aFix(0), 'sess-1');
    await flush();

    server.fail = true;
    expect(await sync.uploadOnce()).toBe(0);

    server.fail = false;
    expect(await sync.uploadOnce()).toBe(1);
  });

  it('paczka nie przekracza limitu koperty', async () => {
    const { recorder, server, sync } = harness();
    for (let i = 0; i < TRACE_BATCH_LIMIT + 100; i += 1) recorder.fix(aFix(i), null);
    await flush();

    expect(await sync.uploadOnce()).toBe(TRACE_BATCH_LIMIT);
    expect(server.pushed[0]).toHaveLength(TRACE_BATCH_LIMIT);
  });
});
