/**
 * UZ Aero — testy store'u sesji (cienka warstwa nad `application`).
 *
 * Store nie ma własnej logiki dnia — sprawdzamy dokładnie to, za co odpowiada:
 * przekazanie kontekstu do komend, odświeżenie projekcji po zapisie, wystawienie
 * ostrzeżeń i błędu do UI oraz licznik outboxa dla SyncChip.
 *
 * Zustand działa w Node — store testuje się bez renderowania czegokolwiek.
 */

import { DomainRuleError } from '../domain';
import { EventsRepo } from '../application/eventsRepo';
import { SESSION_META_KEYS } from '../application/ports';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { FixedClock } from '../infrastructure/clock';
import { useSessionStore } from '../ui/store/sessionStore';

const SESSION = 'sess-1';
const AC = 'sp-axa';
const PIC = 'tmk';

const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);
const min = (m: number): number => T0 + m * 60_000;

function attach() {
  const clock = new FixedClock(min(0));
  let n = 0;
  const repo = new EventsRepo(new InMemoryAdapter(), { clock, generateId: () => `id-${++n}` });
  useSessionStore.getState().reset();
  useSessionStore.getState().attachRepo(repo);
  return { repo, clock, store: () => useSessionStore.getState() };
}

async function openDay(clock: FixedClock): Promise<void> {
  const s = useSessionStore.getState();
  clock.set(min(-5));
  await s.claim({ sessionUuid: SESSION, aircraftId: AC, picId: PIC, dualId: null, mode: 'free' });
  clock.set(min(0));
  await s.confirmPreflight({
    operation: 'skoki',
    dutyStart: min(0),
    reading: { fuelL: 150, mh: 1234.5 },
  });
}

describe('useSessionStore', () => {
  it('claim ustawia kontekst, a kolejne akcje odświeżają projekcję', async () => {
    const { clock, store } = attach();
    await openDay(clock);

    clock.set(min(12));
    await store().startEngine();

    expect(store().context?.sessionUuid).toBe(SESSION);
    expect(store().projection.engineRunning).toBe(true);
    expect(store().projection.dutyStart).toBe(min(0));
    expect(store().events).toHaveLength(3);
  });

  it('outboxCount zasila SyncChip; markSynced go zeruje', async () => {
    const { repo, clock, store } = attach();
    await openDay(clock);

    expect(store().outboxCount).toBe(2);
    expect(store().synced).toBe(false);

    await store().markSynced((await repo.getOutbox()).map((e) => e.uuid));
    expect(store().outboxCount).toBe(0);
    expect(store().synced).toBe(true);
  });

  it('odrzucenie reguły trafia do lastError i leci dalej do wołającego', async () => {
    const { clock, store } = attach();
    await openDay(clock);

    clock.set(min(25));
    await expect(store().takeoff('auto')).rejects.toBeInstanceOf(DomainRuleError);

    expect(store().lastError).toMatch(/Start bez pracującego silnika/);
    expect(store().projection.inFlight).toBe(false);
    expect(store().events).toHaveLength(2); // nic nie doszło
  });

  it('miękka flaga ląduje w warnings, a zdarzenie zostaje zapisane', async () => {
    const { clock, store } = attach();
    await openDay(clock);
    clock.set(min(12));
    await store().startEngine();

    clock.set(min(20));
    await store().drop({ jumpers: { tandem: 1, aff: 0, solo: 0 } });

    expect(store().warnings.map((w) => w.code)).toEqual(['DROP_ON_GROUND']);
    expect(store().lastError).toBeNull();
    expect(store().projection.drops.count).toBe(1);
  });

  it('loadSession odtwarza kontekst i projekcję po restarcie aplikacji', async () => {
    const { clock, store } = attach();
    await openDay(clock);
    clock.set(min(12));
    await store().startEngine();

    store().reset();
    expect(store().context).toBeNull();

    await store().loadSession(SESSION);
    expect(store().context).toEqual({
      sessionUuid: SESSION,
      aircraftId: AC,
      picId: PIC,
      dualId: null,
    });
    expect(store().projection.engineRunning).toBe(true);
  });

  it('loadSession otwartego dnia odtwarza active_session_uuid (upgrade w środku dnia)', async () => {
    const { repo, clock, store } = attach();
    await openDay(clock);
    // Stan sprzed tej wersji aplikacji: dzień otwarty, klucza nie ma — writer headless
    // nie miałby do czego przypisać fixów po śmierci procesu.
    await repo.deleteMeta(SESSION_META_KEYS.activeSessionUuid);

    await store().loadSession(SESSION);
    expect(await repo.getMeta(SESSION_META_KEYS.activeSessionUuid)).toBe(SESSION);
  });

  it('loadSession zdanego samolotu usuwa osierocony active_session_uuid', async () => {
    const { repo, clock, store } = attach();
    await openDay(clock);
    clock.set(min(300));
    await store().releaseAircraft({ finalReading: { fuelL: 150, mh: 1234.5 }, dutyEnd: min(300) });
    // Symulacja crasha między day_close a czyszczeniem klucza.
    await repo.setMeta(SESSION_META_KEYS.activeSessionUuid, SESSION);

    await store().loadSession(SESSION);
    expect(await repo.getMeta(SESSION_META_KEYS.activeSessionUuid)).toBeNull();
  });
});
