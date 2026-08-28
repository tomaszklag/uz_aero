/**
 * UZ Aero — testy ODTWORZENIA REJESTRU (§4.9, issue #32,
 * `application/sync/eventRestore.ts`).
 *
 * Scenariusz źródłowy jest jeden: pilot wyczyścił pamięć aplikacji i „nagle wszystko
 * stracił", chociaż jego dni leżały na serwerze. Te testy pilnują, żeby droga powrotna
 * naprawiała ten stan i przy okazji NIE psuła niczego, co działa:
 *
 *  • pobrane zdarzenia wchodzą do strumienia jako WYSŁANE — inaczej telefon odesłałby
 *    serwerowi jego własne dane i robiłby to w kółko;
 *  • dedup po `uuid` chroni wpis, który czeka jeszcze w outboxie;
 *  • kursor należy do PILOTA — po zalogowaniu kolegi na tym samym telefonie
 *    odtwarzamy od początku, a nie od cudzej pozycji;
 *  • brak sieci to zwykły wynik, nie awaria: strumień zostaje nietknięty.
 */

import { AuthService } from '../application/auth/authService';
import {
  EVENT_RESTORE_MAX_AGE_MS,
  EVENT_RESTORE_MAX_PAGES,
  EVENT_RESTORE_META_CURSOR,
  EventRestore,
} from '../application/sync/eventRestore';
import { EventsRepo } from '../application/eventsRepo';
import {
  ServerUnreachableError,
  type AuthTokens,
  type PushResult,
  type RemoteEventPage,
  type RemoteTaskSuggestions,
  type RemoteThemePrefs,
  type ServerPort,
  type SessionSyncStatus,
  type StoredCredentials,
} from '../application/ports';
import type { Event } from '../domain';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { PinCrypto } from '../infrastructure/auth/pinCrypto';
import { FixedClock } from '../infrastructure/clock';

const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const PILOT = { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz' };

/** Zdarzenie „z serwera" — koperta §5.1 BEZ `syncedAt` (to pole telefonu). */
function remote(uuid: string, over: Partial<Omit<Event, 'syncedAt'>> = {}) {
  return {
    uuid,
    sessionUuid: 'sess-1',
    aircraftId: 'SP-AXA',
    picId: 'TMK',
    dualId: null,
    type: 'session_claim',
    deviceTime: T0,
    gpsTime: T0,
    payload: { mode: 'free' },
    schemaVersion: 1,
    ...over,
  } as Omit<Event, 'syncedAt'>;
}

class MemoryCredentials {
  constructor(private stored: StoredCredentials | null) {}
  load = async () => this.stored;
  save = async (c: StoredCredentials) => {
    this.stored = c;
  };
  clear = async () => {
    this.stored = null;
  };
}

/** Serwer-skrypt dla `GET /me/events`: rejestruje kursory, odpowiada z kolejki. */
class PullServer implements ServerPort {
  calls: { token: string; cursor: string | null | undefined }[] = [];
  script: Array<RemoteEventPage | Error> = [];

  async pullEvents(
    token: string,
    params: { cursor?: string | null; limit?: number },
  ): Promise<RemoteEventPage> {
    this.calls.push({ token, cursor: params.cursor });
    const next = this.script.shift();
    if (next == null) throw new Error('scenariusz /me/events się skończył');
    if (next instanceof Error) throw next;
    return next;
  }

  login = async (): Promise<AuthTokens> => ({ token: 'jwt-1', refreshToken: 'r1', pilot: PILOT });
  refresh = async (): Promise<AuthTokens> => ({ token: 'jwt-2', refreshToken: 'r2', pilot: PILOT });
  pushEvents = async (): Promise<PushResult> => ({ accepted: 0, duplicates: 0, flags: [] });
  pushTraces = async (_t: string, entries: unknown[]) => ({ accepted: entries.length });
  getSessionTrack = async (): Promise<never> => {
    throw new Error('ta atrapa nie obsługuje śladu sesji');
  };
  getReference = async () => ({ data: { aircraft: [], pilots: [] }, etag: null });
  getAircraftState = async () => ({
    aircraftId: 'SP-AXA',
    claimPicId: null,
    claimSince: null,
    handover: null,
    lastSyncAt: null,
  });
  getFuelChain = async () => ({ before: null, after: null });
  getSyncStatus = async (): Promise<SessionSyncStatus> => {
    throw new Error('nieużywane w tych testach');
  };
  getTaskSuggestions = async (): Promise<RemoteTaskSuggestions> => {
    throw new Error('nieużywane w tych testach');
  };
  getPrefs = async (): Promise<RemoteThemePrefs> => {
    throw new Error('nieużywane w tych testach');
  };
  putPrefs = async (): Promise<RemoteThemePrefs> => {
    throw new Error('nieużywane w tych testach');
  };
}

function harness(pilot = PILOT) {
  const clock = new FixedClock(T0);
  const repo = new EventsRepo(new InMemoryAdapter(), { clock, generateId: () => 'id' });
  const server = new PullServer();
  const credentials = new MemoryCredentials({
    token: 'jwt-1',
    refreshToken: 'r1',
    pilot,
    pin: null,
  });
  const auth = new AuthService(server, credentials, new PinCrypto());
  return { clock, repo, server, credentials, restore: new EventRestore(repo, server, auth) };
}

/** Strona „na drucie" — domyślnie ostatnia (telefon dogonił serwer). */
const page = (
  events: Omit<Event, 'syncedAt'>[],
  over: Partial<RemoteEventPage> = {},
): RemoteEventPage => ({ events, nextCursor: 'c-end', hasMore: false, ...over });

describe('EventRestore', () => {
  it('telefon po czyszczeniu pamięci odbudowuje rejestr — strona po stronie', async () => {
    const { repo, server, restore } = harness();
    server.script = [
      page([remote('e-1'), remote('e-2', { type: 'engine_start' })], {
        nextCursor: 'c-1',
        hasMore: true,
      }),
      page([remote('e-3', { type: 'engine_stop' })]),
    ];

    const outcome = await restore.restore();

    expect(outcome).toEqual({ kind: 'pulled', fetched: 3, inserted: 3, complete: true });
    expect((await repo.getAllEvents()).map((e) => e.uuid)).toEqual(['e-1', 'e-2', 'e-3']);
    // Druga strona pytana OD kursora pierwszej — inaczej pętla stałaby w miejscu.
    expect(server.calls.map((c) => c.cursor)).toEqual([null, 'c-1']);
  });

  it('pobrane zdarzenia NIE trafiają do outboxa', async () => {
    // Przyszły Z serwera, więc serwer je ma. Bez stempla wysyłki telefon odesłałby
    // własnemu serwerowi jego własne dane — przy każdej okazji synchronizacji.
    const { repo, server, restore } = harness();
    server.script = [page([remote('e-1')])];

    await restore.restore();

    expect(await repo.getOutboxCount()).toBe(0);
    expect((await repo.getEvent('e-1'))?.syncedAt).toBe(T0);
  });

  it('zdarzenie czekające w outboxie zostaje nietknięte (dedup po uuid)', async () => {
    // Ten sam wpis może wisieć lokalnie jako niewysłany i jednocześnie leżeć już
    // na serwerze (odpowiedź nie doszła). O jego losie rozstrzyga WYSYŁKA, nie odczyt:
    // pobranie nie ma prawa ani go zdublować, ani po cichu wyjąć z kolejki.
    const { repo, server, restore } = harness();
    await repo.appendEvent({
      uuid: 'e-1',
      sessionUuid: 'sess-1',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      type: 'session_claim',
      payload: { mode: 'free' },
    } as never);
    server.script = [page([remote('e-1')])];

    const outcome = await restore.restore();

    expect(outcome).toMatchObject({ fetched: 1, inserted: 0 });
    expect(await repo.getAllEvents()).toHaveLength(1);
    expect(await repo.getOutboxCount()).toBe(1);
  });

  it('kursor jest zapamiętany — kolejne odtworzenie pyta OD KOŃCA, nie od nowa', async () => {
    const { clock, server, restore } = harness();
    server.script = [page([remote('e-1')], { nextCursor: 'c-1' })];
    await restore.restore();

    clock.advance(EVENT_RESTORE_MAX_AGE_MS + 1);
    server.script = [page([], { nextCursor: null })];
    const second = await restore.restoreIfStale();

    expect(second).toEqual({ kind: 'pulled', fetched: 0, inserted: 0, complete: true });
    expect(server.calls.map((c) => c.cursor)).toEqual([null, 'c-1']);
  });

  it('brama wieku wycisza puls: drugie pytanie w oknie nie rusza serwera', async () => {
    const { clock, server, restore } = harness();
    server.script = [page([remote('e-1')])];
    await restore.restoreIfStale();

    clock.advance(EVENT_RESTORE_MAX_AGE_MS - 1);
    expect(await restore.restoreIfStale()).toEqual({ kind: 'fresh' });
    expect(server.calls).toHaveLength(1);
  });

  it('brak sieci → `skipped`, lokalny strumień bez zmian', async () => {
    const { repo, server, restore } = harness();
    server.script = [new ServerUnreachableError()];

    expect(await restore.restore()).toEqual({ kind: 'skipped' });
    expect(await repo.getAllEvents()).toHaveLength(0);
  });

  it('sieć znika w połowie odtwarzania — to, co weszło, ZOSTAJE razem z kursorem', async () => {
    // Pełne odtworzenie sezonu to kilkanaście stron na łączu, które bywa jednym paskiem.
    // Przerwanie nie może kasować pobranego ani cofać pozycji: następna okazja podejmuje
    // pracę tam, gdzie stanęła.
    const { repo, server, restore } = harness();
    server.script = [
      page([remote('e-1')], { nextCursor: 'c-1', hasMore: true }),
      new ServerUnreachableError(),
    ];

    const outcome = await restore.restore();

    expect(outcome).toEqual({ kind: 'pulled', fetched: 1, inserted: 1, complete: false });
    expect(await repo.getAllEvents()).toHaveLength(1);
    expect(await repo.getMeta(EVENT_RESTORE_META_CURSOR)).toBe(
      JSON.stringify({ pilotId: 'TMK', cursor: 'c-1' }),
    );
    // Przerwane odtworzenie NIE stempluje bramy wieku — dokończenie ma iść przy
    // najbliższej okazji, a nie za kwadrans.
    server.script = [page([remote('e-2')], { nextCursor: 'c-2' })];
    expect(await restore.restoreIfStale()).toMatchObject({ kind: 'pulled', complete: true });
    expect(server.calls.at(-1)?.cursor).toBe('c-1');
  });

  it('kursor należy do PILOTA — kolega na tym samym telefonie zaczyna od początku', async () => {
    // Bez tego telefon klubowy powtórzyłby awarię, którą ten moduł naprawia: pytałby
    // od pozycji poprzednika i uznał, że nowy pilot nie ma żadnej historii.
    const { repo, server } = harness();
    await repo.setMeta(
      EVENT_RESTORE_META_CURSOR,
      JSON.stringify({ pilotId: 'KRZ', cursor: 'c-krz' }),
    );

    const auth = new AuthService(
      server,
      new MemoryCredentials({ token: 'jwt-1', refreshToken: 'r1', pilot: PILOT, pin: null }),
      new PinCrypto(),
    );
    server.script = [page([remote('e-1')])];
    await new EventRestore(repo, server, auth).restore();

    expect(server.calls[0]?.cursor).toBeNull();
  });

  it('urządzenie bez profilu → `skipped` (nie ma czyjego rejestru odtwarzać)', async () => {
    const { repo, server } = harness();
    const auth = new AuthService(server, new MemoryCredentials(null), new PinCrypto());

    expect(await new EventRestore(repo, server, auth).restore()).toEqual({ kind: 'skipped' });
    expect(server.calls).toHaveLength(0);
  });

  it('serwer bez końca („hasMore" zawsze) nie zawiesza pętli okazji', async () => {
    // Pas bezpieczeństwa, nie limit historii: przebieg kończy się po `MAX_PAGES`,
    // a reszta dochodzi przy następnej okazji — kursor jest zapisany po każdej stronie.
    const { server, restore } = harness();
    server.script = Array.from({ length: EVENT_RESTORE_MAX_PAGES + 5 }, (_, i) =>
      page([remote(`e-${i}`)], { nextCursor: `c-${i}`, hasMore: true }),
    );

    const outcome = await restore.restore();

    expect(outcome).toMatchObject({ kind: 'pulled', complete: false });
    expect(server.calls).toHaveLength(EVENT_RESTORE_MAX_PAGES);
  });
});
