/**
 * UZ Aero — testy odświeżania cache referencyjnego (§4.8, `application/sync/referenceSync.ts`).
 *
 * Sedno: cache ma być nadpisywany prawdą serwera przy okazji, ale NIGDY psuty przez
 * brak sieci; 304 ma zerować wiek danych (adnotacja „· z cache · sync …" mówi o czasie
 * ostatniego POTWIERDZENIA, nie ostatniej zmiany treści); brama wieku ma wyciszać
 * pytania z pulsu co 60 s.
 */

import { AuthService } from '../application/auth/authService';
import {
  REFERENCE_MAX_AGE_MS,
  REFERENCE_META_ETAG,
  ReferenceSync,
} from '../application/sync/referenceSync';
import { EventsRepo } from '../application/eventsRepo';
import {
  ServerRejectedError,
  ServerUnreachableError,
  type AuthTokens,
  type PushResult,
  type ReferenceFetch,
  type RemoteThemePrefs,
  type ServerPort,
  type SessionSyncStatus,
  type StoredCredentials,
} from '../application/ports';
import type { ReferenceAircraft, ReferencePilot } from '../domain';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { PinCrypto } from '../infrastructure/auth/pinCrypto';
import { FixedClock } from '../infrastructure/clock';

const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const PILOT = { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz' };
const CREDS: StoredCredentials = { token: 'jwt-1', refreshToken: 'r1', pilot: PILOT };

/** Wiersz floty z serwera — `fetchedAt` serwera jest ignorowany (stemplujemy lokalnie). */
const axa = (over: Partial<ReferenceAircraft> = {}): ReferenceAircraft => ({
  id: 'SP-AXA',
  reg: 'SP-AXA',
  type: 'Cessna 182',
  year: 2019,
  capacityL: 330,
  mhFormat: 'hhmm',
  dualRequired: false,
  serviceStatus: 'active',
  claimPicId: null,
  claimSince: null,
  handover: null,
  consumption: null,
  fetchedAt: 0,
  ...over,
});

const tmk: ReferencePilot = { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz', active: true, fetchedAt: 0 };

class MemoryCredentials {
  private stored: StoredCredentials | null = CREDS;
  load = async () => this.stored;
  save = async (c: StoredCredentials) => {
    this.stored = c;
  };
  clear = async () => {
    this.stored = null;
  };
}

/** Serwer-skrypt dla `getReference`: rejestruje tokeny i ETagi, odpowiada z kolejki. */
class RefServer implements ServerPort {
  calls: { token: string; etag: string | null }[] = [];
  script: Array<ReferenceFetch | Error> = [];
  refreshCalls = 0;

  async getReference(token: string, etag: string | null = null): Promise<ReferenceFetch> {
    this.calls.push({ token, etag });
    const next = this.script.shift();
    if (next == null) throw new Error('scenariusz /reference się skończył');
    if (next instanceof Error) throw next;
    return next;
  }

  async refresh(): Promise<AuthTokens> {
    this.refreshCalls += 1;
    return { token: 'jwt-2', refreshToken: 'r2', pilot: PILOT };
  }

  login = async (): Promise<AuthTokens> => ({ token: 'jwt-1', refreshToken: 'r1', pilot: PILOT });
  pushEvents = async (): Promise<PushResult> => ({ accepted: 0, duplicates: 0, flags: [] });
  pushTraces = async (_t: string, entries: unknown[]) => ({ accepted: entries.length });
  getAircraftState = async () => ({
    aircraftId: 'SP-AXA',
    claimPicId: null,
    claimSince: null,
    handover: null,
    lastSyncAt: null,
  });
  getSyncStatus = async (): Promise<SessionSyncStatus> => {
    throw new Error('nieużywane w tych testach');
  };
  getPrefs = async (): Promise<RemoteThemePrefs> => {
    throw new Error('nieużywane w tych testach');
  };
  putPrefs = async (): Promise<RemoteThemePrefs> => {
    throw new Error('nieużywane w tych testach');
  };
}

function harness() {
  const clock = new FixedClock(T0);
  const repo = new EventsRepo(new InMemoryAdapter(), { clock, generateId: () => 'id' });
  const server = new RefServer();
  const sync = new ReferenceSync(
    repo,
    server,
    new AuthService(server, new MemoryCredentials(), new PinCrypto()),
  );
  return { clock, repo, server, sync };
}

describe('ReferenceSync', () => {
  it('pierwsze odświeżenie: prawda serwera nadpisuje seed, ETag zapamiętany', async () => {
    const { repo, server, sync } = harness();
    // Stan sprzed kontaktu: seed twierdzi, że SP-AXA jest wolny.
    await repo.upsertReference({ aircraft: [axa()], pilots: [tmk] });
    server.script = [
      {
        data: { aircraft: [axa({ claimPicId: 'KRZ', claimSince: T0 - 3_600_000 })], pilots: [tmk] },
        etag: 'W/"ref-1-1"',
      },
    ];

    expect(await sync.refreshIfStale()).toBe('refreshed');

    const cached = await repo.getAircraftById('SP-AXA');
    expect(cached?.claimPicId).toBe('KRZ'); // claim z serwera widoczny dla preflightu
    expect(cached?.fetchedAt).toBe(T0); // stempel lokalny, nie serwerowy
    expect(await repo.getMeta(REFERENCE_META_ETAG)).toBe('W/"ref-1-1"');
  });

  it('w oknie świeżości nie pyta serwera wcale (puls co 60 s ≠ zapytanie co 60 s)', async () => {
    const { clock, server, sync } = harness();
    server.script = [{ data: { aircraft: [axa()], pilots: [tmk] }, etag: 'e1' }];

    await sync.refreshIfStale();
    clock.advance(REFERENCE_MAX_AGE_MS - 1);
    expect(await sync.refreshIfStale()).toBe('fresh');
    expect(server.calls).toHaveLength(1);
  });

  it('po oknie wysyła If-None-Match; 304 podbija wiek danych bez zmiany treści', async () => {
    const { clock, repo, server, sync } = harness();
    server.script = [
      { data: { aircraft: [axa({ claimPicId: 'KRZ' })], pilots: [tmk] }, etag: 'e1' },
      { data: null, etag: 'e1' }, // 304
    ];

    await sync.refreshIfStale();
    clock.advance(REFERENCE_MAX_AGE_MS + 1);
    expect(await sync.refreshIfStale()).toBe('not_modified');

    expect(server.calls[1]).toEqual({ token: 'jwt-1', etag: 'e1' });
    const cached = await repo.getAircraftById('SP-AXA');
    expect(cached?.claimPicId).toBe('KRZ'); // treść bez zmian…
    expect(cached?.fetchedAt).toBe(T0 + REFERENCE_MAX_AGE_MS + 1); // …ale wiek wyzerowany
  });

  it('offline: cache nietknięty, wynik `skipped`, następna okazja spróbuje znowu', async () => {
    const { repo, server, sync } = harness();
    await repo.upsertReference({ aircraft: [axa({ claimPicId: 'KRZ' })], pilots: [tmk] });
    server.script = [new ServerUnreachableError()];

    expect(await sync.refreshIfStale()).toBe('skipped');
    expect((await repo.getAircraftById('SP-AXA'))?.claimPicId).toBe('KRZ');
    // Brak stempla „sprawdzone" — kolejne wywołanie ma znowu spytać serwer.
    server.script = [{ data: { aircraft: [axa()], pilots: [tmk] }, etag: 'e1' }];
    expect(await sync.refreshIfStale()).toBe('refreshed');
  });

  it('401 → jedna rotacja tokenu i ponowienie (wzorzec §3.0)', async () => {
    const { server, sync } = harness();
    server.script = [
      new ServerRejectedError(401, 'unauthorized'),
      { data: { aircraft: [axa()], pilots: [tmk] }, etag: 'e1' },
    ];

    expect(await sync.refreshIfStale()).toBe('refreshed');
    expect(server.refreshCalls).toBe(1);
    expect(server.calls.map((c) => c.token)).toEqual(['jwt-1', 'jwt-2']);
  });
});
