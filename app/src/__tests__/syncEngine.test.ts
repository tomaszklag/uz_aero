/**
 * UZ Aero - testy SILNIKA SYNCHRONIZACJI (§4.3) i cyklu poświadczeń (§3.0).
 *
 * Najważniejsze przypadki to te, których nie widać przy biurku z Wi-Fi: sieć znika
 * w połowie paczki, token wygasa między paczkami, serwer już ma połowę zdarzeń
 * z urwanej próby. Księgowość outboxa musi wyjść z każdego z nich bez zgubionego
 * i bez zdublowanego zdarzenia - to jest cała obietnica §4.3.
 */

import { AuthService } from '../application/auth/authService';
import { SyncEngine } from '../application/sync/syncEngine';
import { EventsRepo } from '../application/eventsRepo';
import {
  ServerRejectedError,
  ServerUnreachableError,
  type AuthTokens,
  type PushResult,
  type RemoteAircraftState,
  type RemoteEventPage,
  type RemoteTaskSuggestions, RemoteThemePrefs,
  type ServerPort,
  type SessionSyncStatus,
  type StoredCredentials,
} from '../application/ports';
import type { SessionFlag } from '../domain';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { PinCrypto } from '../infrastructure/auth/pinCrypto';
import { FixedClock } from '../infrastructure/clock';

const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);

/** Magazyn poświadczeń w pamięci - bezpieczny magazyn to szczegół platformy. */
class MemoryCredentials {
  private stored: StoredCredentials | null;
  constructor(initial: StoredCredentials | null = null) {
    this.stored = initial;
  }
  load = async () => this.stored;
  save = async (c: StoredCredentials) => {
    this.stored = c;
  };
  clear = async () => {
    this.stored = null;
  };
}

/** Serwer-skrypt: kolejki zaprogramowanych odpowiedzi na `pushEvents` i `getSyncStatus`. */
class ScriptedServer implements ServerPort {
  pushes: { token: string; count: number; trigger?: string }[] = [];
  statusCalls: string[] = [];
  refreshCalls = 0;
  statusScript: Array<SessionSyncStatus | Error> = [];
  private script: Array<PushResult | Error>;
  private refreshResult: AuthTokens | Error;

  constructor(script: Array<PushResult | Error>, refreshResult?: AuthTokens | Error) {
    this.script = script;
    this.refreshResult =
      refreshResult ??
      ({ token: 'jwt-2', refreshToken: 'r2', pilot: PILOT } satisfies AuthTokens);
  }

  async login(): Promise<AuthTokens> {
    return { token: 'jwt-1', refreshToken: 'r1', pilot: PILOT };
  }

  async refresh(): Promise<AuthTokens> {
    this.refreshCalls += 1;
    if (this.refreshResult instanceof Error) throw this.refreshResult;
    return this.refreshResult;
  }

  async pushEvents(
    token: string,
    events: unknown[],
    _sourceDevice?: string | null,
    trigger?: string,
  ): Promise<PushResult> {
    this.pushes.push({ token, count: events.length, trigger });
    const next = this.script.shift();
    if (next == null) throw new Error('scenariusz się skończył');
    if (next instanceof Error) throw next;
    return next;
  }

  async getSyncStatus(token: string): Promise<SessionSyncStatus> {
    this.statusCalls.push(token);
    const next = this.statusScript.shift();
    if (next == null) throw new Error('scenariusz sync-status się skończył');
    if (next instanceof Error) throw next;
    return next;
  }

  getReference = async () => ({ data: { aircraft: [], pilots: [] }, etag: null });
  pushTraces = async (_t: string, entries: unknown[]) => ({ accepted: entries.length });
  getSessionTrack = async (): Promise<never> => {
    throw new Error('ta atrapa nie obsługuje śladu operacji');
  };

  /** Droga powrotna (§4.9) ma własne testy - `eventRestore.test.ts`. */
  pullEvents = async (): Promise<RemoteEventPage> => ({
    events: [],
    nextCursor: null,
    hasMore: false,
  });

  getTaskSuggestions = async (): Promise<RemoteTaskSuggestions> => {
    throw new Error('nieużywane w tych testach');
  };
  getPrefs = async (): Promise<RemoteThemePrefs> => {
    throw new Error('nieużywane w tych testach');
  };
  putPrefs = async (): Promise<RemoteThemePrefs> => {
    throw new Error('nieużywane w tych testach');
  };

  /** Łańcuch paliwa (issue #62) - ten silnik go nie używa, ekran pyta wprost. */
  async getReadingsChain(): Promise<{ before: null; after: null; oil: null }> {
    return { before: null, after: null, oil: null };
  }

  /** Skryptowalny jak `statusScript`; domyślnie samolot wolny. */
  aircraftStateScript: Array<RemoteAircraftState | Error> = [];
  async getAircraftState(_token: string, aircraftId: string): Promise<RemoteAircraftState> {
    const next = this.aircraftStateScript.shift();
    if (next instanceof Error) throw next;
    return (
      next ?? {
        aircraftId,
        claimPicId: null,
        claimSince: null,
        handover: null,
        lastSyncAt: null,
      }
    );
  }
}

const PILOT = { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz' };
const CREDS: StoredCredentials = { token: 'jwt-1', refreshToken: 'r1', pilot: PILOT };

const ok = (accepted: number, duplicates = 0): PushResult => ({
  accepted,
  duplicates,
  flags: [],
});

/** Repo z `n` niewysłanymi zdarzeniami. */
async function repoWithEvents(n: number): Promise<EventsRepo> {
  let seq = 0;
  const repo = new EventsRepo(new InMemoryAdapter(), {
    clock: new FixedClock(T0),
    generateId: () => `id-${(seq += 1)}`,
  });
  for (let i = 0; i < n; i += 1) {
    await repo.appendEvent({
      sessionUuid: 'sess-1',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type: 'taxi',
      payload: { method: 'manual' },
    });
  }
  return repo;
}

function engineWith(repo: EventsRepo, server: ServerPort): SyncEngine {
  return new SyncEngine(
    repo,
    server,
    new AuthService(server, new MemoryCredentials(CREDS), new PinCrypto()),
  );
}

describe('SyncEngine.syncOnce', () => {
  /**
   * KTO POPROSIŁ dojeżdża do portu (uwaga z urządzenia, 2026-08-30). Silnik nie zna
   * sekund - przekłada je adapter - więc jedyne, co da się tu sprawdzić i jedyne,
   * co ma znaczenie, to czy informacja w ogóle dociera na dół. Bez tego dłuższy limit
   * dla ponowienia z ręki byłby martwym kodem, a objaw wróciłby niezauważony: telefon
   * przerywa po 8 s, serwer w tym czasie przyjmuje paczkę, a pilot czyta „brak sieci".
   */
  it('przekazuje do portu, kto poprosił - tło domyślnie, manual z przycisku', async () => {
    const repo = await repoWithEvents(1);
    const server = new ScriptedServer([ok(1), ok(1)]);
    const engine = engineWith(repo, server);

    await engine.syncOnce();
    expect(server.pushes[0]?.trigger).toBe('background');

    // Drugie repozytorium, bo pierwsze jest już opróżnione - pusty outbox nie
    // rozmawia z serwerem i test nie miałby czego obejrzeć.
    await engineWith(await repoWithEvents(1), server).syncOnce('manual');
    expect(server.pushes[1]?.trigger).toBe('manual');
  });

  it('opróżnia outbox i oznacza wysłane', async () => {
    const repo = await repoWithEvents(3);
    const server = new ScriptedServer([ok(3)]);

    const outcome = await engineWith(repo, server).syncOnce();

    expect(outcome).toEqual({ kind: 'synced', pushed: 3, flags: [] });
    expect(await repo.getOutboxCount()).toBe(0);
  });

  it('pusty outbox = idle, zero rozmów z serwerem', async () => {
    const repo = await repoWithEvents(0);
    const server = new ScriptedServer([]);

    expect(await engineWith(repo, server).syncOnce()).toEqual({ kind: 'idle' });
    expect(server.pushes).toHaveLength(0);
  });

  it('duplikaty z urwanej próby liczą się jako dostarczone (§4.3)', async () => {
    // Poprzedni sync padł PO dotarciu paczki, PRZED odpowiedzią - serwer ma zdarzenia,
    // telefon o tym nie wie. Retransmisja: sześć duplikatów to sześć potwierdzeń.
    const repo = await repoWithEvents(6);
    const server = new ScriptedServer([ok(0, 6)]);

    const outcome = await engineWith(repo, server).syncOnce();

    expect(outcome.kind).toBe('synced');
    expect(await repo.getOutboxCount()).toBe(0); // bez tego outbox zapętliłby się na zawsze
  });

  it('brak sieci: outbox zostaje nietknięty i czeka', async () => {
    const repo = await repoWithEvents(2);
    const server = new ScriptedServer([new ServerUnreachableError()]);

    expect(await engineWith(repo, server).syncOnce()).toEqual({ kind: 'offline' });
    expect(await repo.getOutboxCount()).toBe(2);
  });

  it('401 w trakcie → jedna rotacja tokenu i ponowienie TEJ SAMEJ paczki', async () => {
    const repo = await repoWithEvents(2);
    const server = new ScriptedServer([new ServerRejectedError(401, 'unauthorized'), ok(2)]);

    const outcome = await engineWith(repo, server).syncOnce();

    expect(outcome.kind).toBe('synced');
    expect(server.refreshCalls).toBe(1);
    expect(server.pushes.map((p) => p.token)).toEqual(['jwt-1', 'jwt-2']);
    expect(server.pushes.map((p) => p.count)).toEqual([2, 2]); // ta sama paczka, nie nowa
  });

  it('martwy refresh = auth_expired, ale zdarzenia NIE giną', async () => {
    const repo = await repoWithEvents(2);
    const server = new ScriptedServer(
      [new ServerRejectedError(401, 'unauthorized')],
      new ServerRejectedError(401, 'invalid_refresh'),
    );

    expect(await engineWith(repo, server).syncOnce()).toEqual({ kind: 'auth_expired' });
    expect(await repo.getOutboxCount()).toBe(2); // praca lokalna trwa; sync czeka na login
  });

  it('sieć znika między 401 a rotacją → offline, nie auth_expired', async () => {
    // Subtelne, ale ważne: „nie wiem, czy refresh działa" ≠ „refresh martwy".
    // Pomylenie tych stanów kazałoby pilotowi logować się bez potrzeby.
    const repo = await repoWithEvents(1);
    const server = new ScriptedServer(
      [new ServerRejectedError(401, 'unauthorized')],
      new ServerUnreachableError(),
    );

    expect(await engineWith(repo, server).syncOnce()).toEqual({ kind: 'offline' });
  });

  it('403 (single-writer) = rejected z kodem - do pokazania pilotowi', async () => {
    const repo = await repoWithEvents(1);
    const server = new ScriptedServer([new ServerRejectedError(403, 'not_session_pic')]);

    expect(await engineWith(repo, server).syncOnce()).toEqual({
      kind: 'rejected',
      code: 'not_session_pic',
    });
    expect(await repo.getOutboxCount()).toBe(1);
  });

  it('flagi z odpowiedzi serwera wypływają do wołającego (ekran 11)', async () => {
    const repo = await repoWithEvents(1);
    const flags: SessionFlag[] = [{ type: 'mh_gap', sessionUuids: ['sess-0', 'sess-1'] }];
    const server = new ScriptedServer([{ accepted: 1, duplicates: 0, flags }]);

    const outcome = await engineWith(repo, server).syncOnce();
    expect(outcome).toEqual({ kind: 'synced', pushed: 1, flags });
  });
});

describe('SyncEngine.fetchStatus (zaparkowane po usunięciu ekranu 11)', () => {
  const STATUS: SessionSyncStatus = {
    sessionUuid: 'sess-1',
    received: 7,
    status: 'closed',
    flags: [{ type: 'mh_gap', sessionUuids: ['sess-0', 'sess-1'] }],
    exportUrl: null,
  };

  it('zwraca stan operacji z serwera', async () => {
    const repo = await repoWithEvents(0);
    const server = new ScriptedServer([]);
    server.statusScript = [STATUS];

    expect(await engineWith(repo, server).fetchStatus('sess-1')).toEqual(STATUS);
  });

  it('offline → null, bez wyjątku - ekran zostaje przy danych z cache', async () => {
    const repo = await repoWithEvents(0);
    const server = new ScriptedServer([]);
    server.statusScript = [new ServerUnreachableError()];

    expect(await engineWith(repo, server).fetchStatus('sess-1')).toBeNull();
  });

  it('401 → jedna rotacja tokenu i ponowienie', async () => {
    const repo = await repoWithEvents(0);
    const server = new ScriptedServer([]);
    server.statusScript = [new ServerRejectedError(401, 'unauthorized'), STATUS];

    expect(await engineWith(repo, server).fetchStatus('sess-1')).toEqual(STATUS);
    expect(server.refreshCalls).toBe(1);
    expect(server.statusCalls).toEqual(['jwt-1', 'jwt-2']);
  });

  it('martwy refresh → null (sync-status nie wymusza logowania)', async () => {
    const repo = await repoWithEvents(0);
    const server = new ScriptedServer([], new ServerRejectedError(401, 'invalid_refresh'));
    server.statusScript = [new ServerRejectedError(401, 'unauthorized')];

    expect(await engineWith(repo, server).fetchStatus('sess-1')).toBeNull();
  });
});

describe('SyncEngine.fetchAircraftState (przejęcie §4.4)', () => {
  it('zwraca żywy stan - podstawa do takeover_online', async () => {
    const repo = await repoWithEvents(0);
    const server = new ScriptedServer([]);
    server.aircraftStateScript = [
      { aircraftId: 'SP-AXA', claimPicId: 'AKO', claimSince: T0, handover: null, lastSyncAt: null },
    ];

    const state = await engineWith(repo, server).fetchAircraftState('SP-AXA');
    expect(state?.claimPicId).toBe('AKO');
  });

  it('offline → null - wołający musi zadeklarować takeover_offline', async () => {
    const repo = await repoWithEvents(0);
    const server = new ScriptedServer([]);
    server.aircraftStateScript = [new ServerUnreachableError()];

    expect(await engineWith(repo, server).fetchAircraftState('SP-AXA')).toBeNull();
  });
});

describe('AuthService', () => {
  it('login zapisuje komplet poświadczeń (provisioning §3.0)', async () => {
    const credentials = new MemoryCredentials();
    const auth = new AuthService(new ScriptedServer([]), credentials, new PinCrypto());

    await auth.login('TMK', 'haslo');

    expect(await credentials.load()).toMatchObject({ token: 'jwt-1', pilot: PILOT });
  });

  it('wylogowanie zablokowane przy niepustym outboxie - poświadczenia zostają', async () => {
    const credentials = new MemoryCredentials(CREDS);
    const auth = new AuthService(new ScriptedServer([]), credentials, new PinCrypto());

    expect(await auth.logout(3)).toBe('outbox_not_empty');
    expect(await credentials.load()).not.toBeNull();

    expect(await auth.logout(0)).toBeNull();
    expect(await credentials.load()).toBeNull();
  });

  it('PIN: ustawienie → weryfikacja offline; ponowny login ZERUJE PIN (§3.0)', async () => {
    const credentials = new MemoryCredentials(CREDS);
    const auth = new AuthService(new ScriptedServer([]), credentials, new PinCrypto());

    await auth.setPin('1234');
    expect(await auth.verifyPin('1234')).toBe(true);
    expect(await auth.verifyPin('0000')).toBe(false);
    // Skrót w magazynie, nigdy sam PIN.
    const stored = await credentials.load();
    expect(stored?.pin?.hash).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain('1234');

    // „Nie pamiętam PIN" → pełny login → stary PIN nie ma prawa przeżyć.
    await auth.login('TMK', 'haslo');
    expect(await auth.verifyPin('1234')).toBe(false);
  });

  it('rotacja tokenu NIE kasuje PIN-u - zamek przeżywa wygaśnięcie operacji (§3.0)', async () => {
    const credentials = new MemoryCredentials(CREDS);
    const auth = new AuthService(new ScriptedServer([]), credentials, new PinCrypto());
    await auth.setPin('1234');

    expect(await auth.rotate()).toBe('jwt-2');

    // Token nowy, PIN ten sam - inaczej pilot dostawałby „Ustaw PIN" co godzinę.
    expect(await auth.verifyPin('1234')).toBe(true);
    expect((await credentials.load())?.refreshToken).toBe('r2');
  });
});

/**
 * ZAPISY WSTRZYMANE (issue #81): operacja zakończona albo unieważniona przez
 * administratora nie wysyła już nic z telefonu. Dwie drogi, jeden skutek.
 */
describe('SyncEngine - zapisy wstrzymane (issue #81)', () => {
  /** Operacja otwarta z zaległym zdaniem w outboksie + decyzja panelu dosłana z serwera. */
  async function orphanedRepo(decision: 'session_close' | 'session_void'): Promise<EventsRepo> {
    let seq = 0;
    const repo = new EventsRepo(new InMemoryAdapter(), {
      clock: new FixedClock(T0),
      generateId: () => `id-${(seq += 1)}`,
    });
    const base = { sessionUuid: 'sess-1', aircraftId: 'SP-AXA', picId: 'TMK', dualId: null } as const;
    await repo.appendEvent({ ...base, type: 'session_claim', payload: { mode: 'free' } });
    await repo.appendEvent({
      ...base,
      type: 'preflight_confirm',
      payload: { operation: 'skoki', reading: { fuelL: 150, mh: 1234.5 } },
    });
    // Przejęcie i preflight zdążyły wyjść; reszta czeka.
    await repo.markSynced(['id-1', 'id-2']);
    await repo.appendEvent({ ...base, type: 'engine_start', payload: {}, deviceTime: T0 + 60_000 });
    await repo.appendEvent({ ...base, type: 'engine_stop', payload: {}, deviceTime: T0 + 3_600_000 });
    await repo.appendEvent({
      ...base,
      type: 'day_close',
      payload: { finalReading: { fuelL: 100, mh: 1235.5 } },
      deviceTime: T0 + 3_700_000,
    });
    // Decyzja panelu przyszła dosyłką - ze stemplem wysyłki, jak każde zdarzenie z serwera.
    await repo.appendFromServer([
      {
        uuid: 'admin-1',
        ...base,
        type: decision,
        deviceTime: T0 + 7_200_000,
        gpsTime: T0 + 7_200_000,
        payload: decision === 'session_close' ? { reason: 'Telefon padł.' } : { reason: 'Pomyłka.', source: 'admin' },
        schemaVersion: 1,
      },
    ]);
    return repo;
  }

  it('operacja zakończona przez panel: zaległe zapisy WYPADAJĄ z outboxa, bez rozmowy z serwerem', async () => {
    const repo = await orphanedRepo('session_close');
    expect(await repo.getOutboxCount()).toBe(3);
    const server = new ScriptedServer([]);

    const outcome = await engineWith(repo, server).syncOnce();

    // Nic do wysłania - i nic nie wyszło, choć trzy zapisy czekały.
    expect(outcome).toEqual({ kind: 'idle' });
    expect(server.pushes).toHaveLength(0);
    expect(await repo.getOutboxCount()).toBe(0);
    // Zostają w rejestrze (ekran dalej je czyta), z nazwanym powodem.
    expect((await repo.getSessionEvents('sess-1')).map((e) => e.type)).toContain('day_close');
    expect((await repo.getWithheld()).map((w) => w.reason)).toEqual(['admin_close', 'admin_close', 'admin_close']);
  });

  it('unieważnienie z panelu wstrzymuje tak samo - własne unieważnienie nie', async () => {
    const byAdmin = await orphanedRepo('session_void');
    await engineWith(byAdmin, new ScriptedServer([])).syncOnce();
    expect((await byAdmin.getWithheld()).map((w) => w.reason)).toEqual(['admin_void', 'admin_void', 'admin_void']);

    // Własne wycofanie (bez `source`) jest zwykłym zapisem do wysłania.
    const repo = await repoWithEvents(1);
    await repo.appendEvent({
      sessionUuid: 'sess-1',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type: 'session_void',
      payload: { reason: null },
    });
    const server = new ScriptedServer([ok(2)]);
    expect(await engineWith(repo, server).syncOnce()).toEqual({ kind: 'synced', pushed: 2, flags: [] });
    expect(await repo.getWithheld()).toEqual([]);
  });

  it('serwer wyścignął decyzję: `withheld` w odpowiedzi oznacza zapisy wstrzymane, nie wysłane', async () => {
    const repo = await repoWithEvents(3);
    const queued = (await repo.getOutbox()).map((e) => e.uuid);
    const server = new ScriptedServer([{ accepted: 1, duplicates: 0, flags: [], withheld: [queued[1]!, queued[2]!] }]);

    const outcome = await engineWith(repo, server).syncOnce();

    expect(outcome).toEqual({ kind: 'synced', pushed: 1, flags: [] });
    expect(await repo.getOutboxCount()).toBe(0);
    expect((await repo.getEvent(queued[0]!))?.syncedAt).toBe(T0);
    // Wstrzymane NIE dostają stempla wysyłki - serwer ich nie ma i mieć nie będzie.
    expect((await repo.getEvent(queued[1]!))?.syncedAt).toBeNull();
    expect((await repo.getWithheld()).map((w) => [w.uuid, w.reason])).toEqual([
      [queued[1], 'server'],
      [queued[2], 'server'],
    ]);
  });
});
