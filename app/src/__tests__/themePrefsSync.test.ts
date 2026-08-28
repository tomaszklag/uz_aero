/**
 * UZ Aero — testy uzgadniania MOTYWU PILOTA (`application/sync/themePrefsSync.ts`,
 * decyzja 2026-07-29: motyw jest preferencją pilota i wędruje między urządzeniami).
 *
 * Sedno: LWW po stemplu DECYZJI działa w OBIE strony (nasz nowszy wygrywa na serwerze,
 * serwerowy nowszy wygrywa u nas — także gdy to my pchaliśmy), `dirty` zachowuje się
 * jak outbox (wysyłka przy każdej okazji, offline niczego nie psuje), a brama wieku
 * wycisza pull z pulsu co 60 s.
 */

import { AuthService } from '../application/auth/authService';
import {
  THEME_PREFS_MAX_AGE_MS,
  ThemePrefsSync,
} from '../application/sync/themePrefsSync';
import {
  ServerRejectedError,
  ServerUnreachableError,
  type AuthTokens,
  type PushResult,
  type RemoteEventPage,
  type RemoteTaskSuggestions, RemoteThemePrefs,
  type ServerPort,
  type SessionSyncStatus,
  type StoredCredentials,
  type ThemePrefRecord,
  type ThemePrefsPort,
} from '../application/ports';
import { PinCrypto } from '../infrastructure/auth/pinCrypto';

const T0 = Date.UTC(2026, 6, 29, 8, 0, 0);
const iso = (ms: number): string => new Date(ms).toISOString();

const PILOT = { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz' };
const CREDS: StoredCredentials = { token: 'jwt-1', refreshToken: 'r1', pilot: PILOT };

class MemoryCredentials {
  constructor(private stored: StoredCredentials | null = CREDS) {}
  load = async () => this.stored;
  save = async (c: StoredCredentials) => {
    this.stored = c;
  };
  clear = async () => {
    this.stored = null;
  };
}

/** Rekordy motywu w pamięci — port lokalnego magazynu bez AsyncStorage. */
class MemoryThemePrefs implements ThemePrefsPort {
  records = new Map<string, ThemePrefRecord>();
  read = async (pilotId: string) => this.records.get(pilotId) ?? null;
  write = async (pilotId: string, record: ThemePrefRecord) => {
    this.records.set(pilotId, record);
  };
}

/** Serwer-skrypt dla `/me/prefs`: rejestruje wywołania, odpowiada z kolejek. */
class PrefsServer implements ServerPort {
  getCalls: string[] = [];
  putCalls: { token: string; theme: string; themeUpdatedAt: string }[] = [];
  getScript: Array<RemoteThemePrefs | Error> = [];
  putScript: Array<RemoteThemePrefs | Error> = [];
  refreshCalls = 0;

  async getTaskSuggestions(): Promise<RemoteTaskSuggestions> {
    throw new Error('nieużywane w tych testach');
  }

  /** Droga powrotna (§4.9) ma własne testy — `eventRestore.test.ts`. */
  async pullEvents(): Promise<RemoteEventPage> {
    return { events: [], nextCursor: null, hasMore: false };
  }

  async getPrefs(token: string): Promise<RemoteThemePrefs> {
    this.getCalls.push(token);
    const next = this.getScript.shift();
    if (next == null) throw new Error('scenariusz GET /me/prefs się skończył');
    if (next instanceof Error) throw next;
    return next;
  }

  async putPrefs(
    token: string,
    prefs: { theme: string; themeUpdatedAt: string },
  ): Promise<RemoteThemePrefs> {
    this.putCalls.push({ token, ...prefs });
    const next = this.putScript.shift();
    if (next == null) throw new Error('scenariusz PUT /me/prefs się skończył');
    if (next instanceof Error) throw next;
    return next;
  }

  async refresh(): Promise<AuthTokens> {
    this.refreshCalls += 1;
    return { token: 'jwt-2', refreshToken: 'r2', pilot: PILOT };
  }

  login = async (): Promise<AuthTokens> => CREDS;
  pushEvents = async (): Promise<PushResult> => ({ accepted: 0, duplicates: 0, flags: [] });
  pushTraces = async () => {
    throw new Error('nieużywane w tych testach');
  };
  getSessionTrack = async (): Promise<never> => {
    throw new Error('nieużywane w tych testach');
  };
  getReference = async () => ({ data: null, etag: null });
  getFuelChain = async () => ({ before: null, after: null });
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
}

function harness(credentials: StoredCredentials | null = CREDS) {
  let nowMs = T0;
  const prefs = new MemoryThemePrefs();
  const server = new PrefsServer();
  const sync = new ThemePrefsSync(
    prefs,
    server,
    new AuthService(server, new MemoryCredentials(credentials), new PinCrypto()),
    THEME_PREFS_MAX_AGE_MS,
    () => nowMs,
  );
  return { prefs, server, sync, advance: (ms: number) => (nowMs += ms) };
}

describe('ThemePrefsSync', () => {
  it('push: rekord dirty idzie PUT-em ze stemplem ISO; potwierdzenie gasi dirty', async () => {
    const { prefs, server, sync } = harness();
    await prefs.write('TMK', { theme: 'paper', updatedAt: T0 - 60_000, dirty: true });
    server.putScript = [{ theme: 'paper', themeUpdatedAt: iso(T0 - 60_000) }]; // serwer przyjął nasz stempel

    expect(await sync.syncIfStale('TMK')).toBe('pushed');

    expect(server.putCalls).toEqual([
      { token: 'jwt-1', theme: 'paper', themeUpdatedAt: iso(T0 - 60_000) },
    ]);
    expect(await prefs.read('TMK')).toEqual({ theme: 'paper', updatedAt: T0 - 60_000, dirty: false });
  });

  it('push przegrany w LWW: odpowiedź autorytatywna z nowszym stemplem nadpisuje lokalny motyw', async () => {
    const { prefs, server, sync } = harness();
    const applied: string[] = [];
    sync.onApplied((pilotId, theme) => applied.push(`${pilotId}:${theme}`));

    await prefs.write('TMK', { theme: 'paper', updatedAt: T0 - 60_000, dirty: true });
    // Drugi telefon TEGO pilota zapisał `solar` minutę PÓŹNIEJ — serwer odpowiada zwycięzcą.
    server.putScript = [{ theme: 'solar', themeUpdatedAt: iso(T0 - 1) }];

    expect(await sync.syncIfStale('TMK')).toBe('pulled');
    expect(await prefs.read('TMK')).toEqual({ theme: 'solar', updatedAt: T0 - 1, dirty: false });
    expect(applied).toEqual(['TMK:solar']); // ThemeProvider przemaluje ekran na żywo
  });

  it('pull: nowszy wybór z innego urządzenia zostaje adoptowany', async () => {
    const { prefs, server, sync } = harness();
    await prefs.write('TMK', { theme: 'night', updatedAt: T0 - 3_600_000, dirty: false });
    server.getScript = [{ theme: 'amber', themeUpdatedAt: iso(T0 - 60_000) }];

    expect(await sync.syncIfStale('TMK')).toBe('pulled');
    expect(await prefs.read('TMK')).toEqual({ theme: 'amber', updatedAt: T0 - 60_000, dirty: false });
  });

  it('pull: starszy/pusty stan serwera NICZEGO nie zmienia (LWW także w tę stronę)', async () => {
    const { prefs, server, sync, advance } = harness();
    const local: ThemePrefRecord = { theme: 'sky', updatedAt: T0 - 1_000, dirty: false };
    await prefs.write('TMK', local);
    server.getScript = [
      { theme: 'night', themeUpdatedAt: iso(T0 - 3_600_000) }, // starszy przegrywa
      { theme: null, themeUpdatedAt: null }, // pilot bez wyboru na serwerze
    ];

    expect(await sync.syncIfStale('TMK')).toBe('in_sync');
    expect(await prefs.read('TMK')).toEqual(local);

    advance(THEME_PREFS_MAX_AGE_MS + 1);
    expect(await sync.syncIfStale('TMK')).toBe('in_sync');
    expect(await prefs.read('TMK')).toEqual(local);
  });

  it('brama wieku: świeżo potwierdzony serwer = zero zapytań; dirty ją OMIJA', async () => {
    const { prefs, server, sync, advance } = harness();
    server.getScript = [{ theme: null, themeUpdatedAt: null }];

    expect(await sync.syncIfStale('TMK')).toBe('in_sync');
    advance(THEME_PREFS_MAX_AGE_MS - 1);
    expect(await sync.syncIfStale('TMK')).toBe('fresh'); // puls co 60 s ≠ zapytanie co 60 s
    expect(server.getCalls).toHaveLength(1);

    // Zmiana motywu nie czeka na bramę — dirty to outbox preferencji.
    await prefs.write('TMK', { theme: 'paper', updatedAt: T0, dirty: true });
    server.putScript = [{ theme: 'paper', themeUpdatedAt: iso(T0) }];
    expect(await sync.syncIfStale('TMK')).toBe('pushed');
  });

  it('offline: `skipped`, rekord z dirty NIETKNIĘTY — następna okazja spróbuje znowu', async () => {
    const { prefs, server, sync } = harness();
    const local: ThemePrefRecord = { theme: 'paper', updatedAt: T0, dirty: true };
    await prefs.write('TMK', local);
    server.putScript = [new ServerUnreachableError()];

    expect(await sync.syncIfStale('TMK')).toBe('skipped');
    expect(await prefs.read('TMK')).toEqual(local);

    // Zasięg wrócił — ta sama zmiana wychodzi bez straty.
    server.putScript = [{ theme: 'paper', themeUpdatedAt: iso(T0) }];
    expect(await sync.syncIfStale('TMK')).toBe('pushed');
    expect(await prefs.read('TMK')).toEqual({ ...local, dirty: false });
  });

  it('401 → jedna rotacja tokenu i ponowienie (wzorzec §3.0)', async () => {
    const { server, sync } = harness();
    server.getScript = [
      new ServerRejectedError(401, 'unauthorized'),
      { theme: null, themeUpdatedAt: null },
    ];

    expect(await sync.syncIfStale('TMK')).toBe('in_sync');
    expect(server.refreshCalls).toBe(1);
    expect(server.getCalls).toEqual(['jwt-1', 'jwt-2']);
  });

  it('profil urządzenia to INNY pilot → `skipped`: token nie zapisze cudzej preferencji', async () => {
    const { prefs, server, sync } = harness({
      token: 'jwt-1',
      refreshToken: 'r1',
      pilot: { id: 'AKO', code: 'AKO', name: 'Anna Kowalska' },
    });
    await prefs.write('TMK', { theme: 'paper', updatedAt: T0, dirty: true });

    expect(await sync.syncIfStale('TMK')).toBe('skipped');
    expect(server.putCalls).toHaveLength(0);
    expect((await prefs.read('TMK'))?.dirty).toBe(true); // wyśle się po powrocie TMK
  });

  it('zmiana motywu W TRAKCIE rozmowy z serwerem nie zostaje zgubiona ani cofnięta', async () => {
    const { prefs, server, sync } = harness();
    await prefs.write('TMK', { theme: 'paper', updatedAt: T0 - 60_000, dirty: true });

    // Serwer potwierdza nasz PUT, ale zanim odpowiedź wróciła, pilot wybrał `amber`.
    server.putScript = [{ theme: 'paper', themeUpdatedAt: iso(T0 - 60_000) }];
    const originalPut = server.putPrefs.bind(server);
    server.putPrefs = async (token, body) => {
      const result = await originalPut(token, body);
      await prefs.write('TMK', { theme: 'amber', updatedAt: T0, dirty: true });
      return result;
    };

    expect(await sync.syncIfStale('TMK')).toBe('pushed');
    // Świeższa decyzja przeżyła: dirty stoi, stempel nie cofnięty — wyśle ją następny przebieg.
    expect(await prefs.read('TMK')).toEqual({ theme: 'amber', updatedAt: T0, dirty: true });
  });
});
