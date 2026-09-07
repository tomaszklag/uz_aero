/**
 * UZ Aero - ZGŁOSZENIA BŁĘDÓW: magazyn lokalny + wysyłka (issue #87).
 *
 * Sedno kontraktu jest OFFLINE-FIRST i tylko o to chodzi w tym pliku: zgłoszenie
 * zapisuje się bez sieci i nie ginie, gdy sieci nie ma także później. Pilot zauważa
 * błąd tam, gdzie pracuje - czyli często w hangarze bez zasięgu - a formularz, który
 * wymaga połączenia, w teren by nie pojechał (§4.1).
 *
 * Księgowość jest lustrem outboxa i śladu: wysłane dostaje stempel i znika z telefonu
 * (serwer ma odtąd jedyną kopię), nieudana próba zostawia wpis w kolejce.
 */

import { AuthService } from '../application/auth/authService';
import { BUG_REPORT_BATCH_LIMIT, BugReportSync } from '../application/sync/bugReportSync';
import {
  ServerUnreachableError,
  type AuthTokens,
  type NewBugReport,
  type RemoteBugReport,
  type ServerPort,
  type StoredCredentials,
} from '../application/ports';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { PinCrypto } from '../infrastructure/auth/pinCrypto';

const T0 = Date.UTC(2026, 8, 4, 9, 41, 0);
const PILOT = { id: 'TMK', code: 'TMK', name: 'Tomasz Małkiewicz' };
const CREDS: StoredCredentials = { token: 'jwt-1', refreshToken: 'r1', pilot: PILOT };

class MemoryCredentials {
  // Zgłoszenie rejestracyjne (logowanie Google) - nieużywane w tych testach.
  loadRegistration = async (): Promise<null> => null;
  saveRegistration = async (_registration: unknown): Promise<void> => {};
  clearRegistration = async (): Promise<void> => {};
  load = async () => CREDS;
  save = async (_c: StoredCredentials) => {};
  clear = async () => {};
}

class BugServer implements ServerPort {
  async loginWithGoogle(): Promise<never> {
    throw new Error('nieużywane');
  }

  async registrationStatus(): Promise<never> {
    throw new Error('nieużywane');
  }

  pushed: RemoteBugReport[][] = [];
  fail = false;

  pushBugReports = async (_t: string, reports: RemoteBugReport[]) => {
    if (this.fail) throw new ServerUnreachableError();
    this.pushed.push(reports);
    return { accepted: reports.length, duplicates: 0 };
  };

  login = async (): Promise<AuthTokens> => ({ token: 'jwt-1', refreshToken: 'r1', pilot: PILOT });
  refresh = async (): Promise<AuthTokens> => ({ token: 'jwt-2', refreshToken: 'r2', pilot: PILOT });
  pushEvents = async () => ({ accepted: 0, duplicates: 0, flags: [] });
  pushTraces = async () => ({ accepted: 0 });
  getReference = async () => ({ data: { aircraft: [], pilots: [] }, etag: null });
  getReadingsChain = async () => ({ before: null, after: null, oil: null });
  getAircraftState = async () => {
    throw new Error('nieużywane');
  };
  getSyncStatus = async () => {
    throw new Error('nieużywane');
  };
  getSessionTrack = async (): Promise<never> => {
    throw new Error('nieużywane');
  };
  getTaskSuggestions = async () => {
    throw new Error('nieużywane');
  };
  pullEvents = async () => ({ events: [], nextCursor: null, hasMore: false });
  getPrefs = async () => {
    throw new Error('nieużywane');
  };
  putPrefs = async () => {
    throw new Error('nieużywane');
  };
}

const report = (uuid: string, over: Partial<NewBugReport> = {}): NewBugReport => ({
  uuid,
  createdAt: T0,
  severity: 'annoying',
  description: 'Czas lotu nie przeliczył się po korekcie.',
  screen: 'OPERACJA (10)',
  appVersion: '1.4.0',
  sessionUuid: 'S1',
  context: { route: 'Stats' },
  ...over,
});

function harness() {
  const store = new InMemoryAdapter();
  const server = new BugServer();
  const sync = new BugReportSync(
    store,
    server,
    new AuthService(server, new MemoryCredentials(), new PinCrypto()),
  );
  return { store, server, sync };
}

describe('magazyn zgłoszeń', () => {
  it('zapis nie wymaga sieci i zostaje w kolejce', async () => {
    const { store } = harness();
    await store.appendBugReport(report('b1'));

    expect(await store.pendingBugReportCount()).toBe(1);
    expect((await store.getPendingBugReports(10))[0]).toMatchObject({
      uuid: 'b1',
      sentAt: null,
      context: { route: 'Stats' },
    });
  });

  it('ten sam uuid dwa razy to nadal jedno zgłoszenie', async () => {
    const { store } = harness();
    await store.appendBugReport(report('b1'));
    await store.appendBugReport(report('b1', { description: 'inna treść' }));

    const pending = await store.getPendingBugReports(10);
    expect(pending).toHaveLength(1);
    // Wygrywa PIERWSZY zapis - tak samo jak w rejestrze zdarzeń (`INSERT OR IGNORE`).
    expect(pending[0]!.description).toBe('Czas lotu nie przeliczył się po korekcie.');
  });
});

describe('wysyłka zgłoszeń', () => {
  it('wysłane znika z telefonu - jedyną kopią zostaje serwer', async () => {
    const { store, server, sync } = harness();
    await store.appendBugReport(report('b1'));
    await store.appendBugReport(report('b2'));

    expect(await sync.uploadOnce()).toBe(2);
    expect(server.pushed).toHaveLength(1);
    expect(server.pushed[0]!.map((r) => r.uuid)).toEqual(['b1', 'b2']);
    expect(await store.pendingBugReportCount()).toBe(0);
    expect(await store.getPendingBugReports(10)).toEqual([]);
  });

  it('czas jedzie na drut jako ISO, a `sentAt` w ogóle nie jedzie', async () => {
    const { store, server, sync } = harness();
    await store.appendBugReport(report('b1'));
    await sync.uploadOnce();

    const wire = server.pushed[0]![0]!;
    expect(wire.createdAt).toBe(new Date(T0).toISOString());
    // Stempel wysyłki jest księgowością TELEFONU - kopercie serwera nic po nim.
    expect(wire).not.toHaveProperty('sentAt');
  });

  it('brak zasięgu zostawia zgłoszenie w kolejce, a następna okazja je zabiera', async () => {
    const { store, server, sync } = harness();
    await store.appendBugReport(report('b1'));

    server.fail = true;
    expect(await sync.uploadOnce()).toBe(0);
    expect(await store.pendingBugReportCount()).toBe(1);

    server.fail = false;
    expect(await sync.uploadOnce()).toBe(1);
    expect(await store.pendingBugReportCount()).toBe(0);
  });

  it('pusta kolejka nie rozmawia z serwerem', async () => {
    const { server, sync } = harness();
    expect(await sync.uploadOnce()).toBe(0);
    expect(server.pushed).toEqual([]);
  });

  it('paczka ma sufit - reszta jedzie następną okazją', async () => {
    const { store, server, sync } = harness();
    for (let i = 0; i < BUG_REPORT_BATCH_LIMIT + 3; i += 1) {
      await store.appendBugReport(report(`b${i}`));
    }

    expect(await sync.uploadOnce()).toBe(BUG_REPORT_BATCH_LIMIT);
    expect(await store.pendingBugReportCount()).toBe(3);
    expect(await sync.uploadOnce()).toBe(3);
    expect(server.pushed).toHaveLength(2);
  });
});
