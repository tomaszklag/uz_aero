/**
 * UZ Aero - testy store'u sesji (cienka warstwa nad `application`).
 *
 * Store nie ma własnej logiki dnia - sprawdzamy dokładnie to, za co odpowiada:
 * przekazanie kontekstu do komend, odświeżenie projekcji po zapisie, wystawienie
 * ostrzeżeń i błędu do UI oraz licznik outboxa dla SyncChip.
 *
 * Zustand działa w Node - store testuje się bez renderowania czegokolwiek.
 */

import { DomainRuleError } from '../domain';
import { EventsRepo } from '../application/eventsRepo';
import type {
  EventRestore,
  EventRestoreOutcome,
  ReferenceSync,
  SyncEngine,
  ThemePrefsSync,
  TraceSync,
} from '../application';
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
    expect(store().projection.preflightAt).toBe(min(0));
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
    await expect(store().takeoff('manual')).rejects.toBeInstanceOf(DomainRuleError);

    expect(store().lastError).toMatch(/Start bez pracującego silnika/);
    expect(store().projection.inFlight).toBe(false);
    expect(store().events).toHaveLength(2); // nic nie doszło
  });

  it('odrzucenie zdarzenia z AUTODETEKCJI nie idzie na ekran (issue #30)', async () => {
    const { clock, store } = attach();
    await openDay(clock);

    clock.set(min(25));
    // Ta sama reguła, ten sam wyjątek do wołającego - ale pilot nic nie nacisnął,
    // więc czerwony baner „Nie zapisano" opisywałby pomyłkę MASZYNY jako jego stratę.
    await expect(store().takeoff('auto')).rejects.toBeInstanceOf(DomainRuleError);

    expect(store().lastError).toBeNull();
    expect(store().events).toHaveLength(2); // nic nie doszło - cisza dotyczy tylko UI
  });

  it('cisza obejmuje WYŁĄCZNIE odmowę reguły - awaria zapisu zostaje widoczna', async () => {
    const { repo, clock, store } = attach();
    await openDay(clock);
    clock.set(min(12));
    await store().startEngine();

    // Padnięty magazyn to nie spór automatu z rejestrem, tylko utrata danych.
    jest
      .spyOn(repo, 'appendStamped')
      .mockRejectedValueOnce(new Error('SQLite: database is locked'));

    clock.set(min(20));
    await expect(store().takeoff('auto')).rejects.toThrow('database is locked');
    expect(store().lastError).toMatch(/database is locked/);
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
    // Stan sprzed tej wersji aplikacji: dzień otwarty, klucza nie ma - writer headless
    // nie miałby do czego przypisać fixów po śmierci procesu.
    await repo.deleteMeta(SESSION_META_KEYS.activeSessionUuid);

    await store().loadSession(SESSION);
    expect(await repo.getMeta(SESSION_META_KEYS.activeSessionUuid)).toBe(SESSION);
  });

  /**
   * Odtworzenie rejestru (§4.9, issue #32) - store jest tu cienki i odpowiada
   * dokładnie za dwie rzeczy: powiedzieć ekranom, KIEDY pustemu rejestrowi wolno
   * wierzyć, i kazać im przeliczyć projekcje, gdy pobranie coś dopisało.
   */
  describe('restoreEvents', () => {
    /** Warstwa synca podmieniona w całości - store'a interesuje tylko WYNIK. */
    function attachRestore(...script: EventRestoreOutcome[]) {
      const calls: number[] = [];
      const restore = {
        restoreIfStale: async (): Promise<EventRestoreOutcome> => {
          calls.push(1);
          return script.shift() ?? { kind: 'fresh' };
        },
      } as unknown as EventRestore;

      useSessionStore
        .getState()
        .attachSync(
          null as unknown as SyncEngine,
          null as unknown as ReferenceSync,
          null as unknown as TraceSync,
          null as unknown as ThemePrefsSync,
          restore,
        );
      return { calls };
    }

    it('podłączenie warstwy synca wstrzymuje wiarę w pusty rejestr do pierwszego pobrania', async () => {
      const { store } = attach();
      // Bez warstwy synca lokalny rejestr JEST całą prawdą - nie ma na co czekać.
      expect(store().streamHydrated).toBe(true);

      attachRestore({ kind: 'pulled', fetched: 0, inserted: 0, complete: true });
      expect(store().streamHydrated).toBe(false);

      await store().restoreEvents();
      expect(store().streamHydrated).toBe(true);
    });

    it('offline też odblokowuje ekran - bez sieci lokalny rejestr jest całą prawdą', async () => {
      const { store } = attach();
      attachRestore({ kind: 'skipped' });

      await store().restoreEvents();
      expect(store().streamHydrated).toBe(true);
    });

    it('licznik zmian strumienia rośnie TYLKO po faktycznym dopisaniu zdarzeń', async () => {
      // Pusta dosyłka zdarza się przy każdej okazji; przeliczanie po niej całego
      // rejestru na otwartym ekranie byłoby pracą bez skutku.
      const { store } = attach();
      attachRestore(
        { kind: 'pulled', fetched: 3, inserted: 0, complete: true },
        { kind: 'pulled', fetched: 3, inserted: 2, complete: true },
      );

      await store().restoreEvents();
      expect(store().streamRevision).toBe(0);

      await store().restoreEvents();
      expect(store().streamRevision).toBe(1);
    });

    it('wylogowanie cofa zgodę na pusty rejestr - na telefonie może usiąść kolega', async () => {
      const { store } = attach();
      attachRestore({ kind: 'skipped' });
      await store().restoreEvents();

      store().reset();
      expect(store().streamHydrated).toBe(false);
    });

    it('syncNow przy NIEPUSTYM outboksie najpierw pyta serwer (bez bramy wieku), potem wysyła (issue #81)', async () => {
      // Decyzja panelu o zakończeniu operacji ma być w lokalnym rejestrze, ZANIM
      // silnik przemiecie kolejkę - inaczej zdanie z telefonu wyścignęłoby ją na serwer.
      const { clock, store } = attach();
      const calls: string[] = [];
      const restore = {
        restoreIfStale: async (): Promise<EventRestoreOutcome> => {
          calls.push('restoreIfStale');
          return { kind: 'fresh' };
        },
        restore: async (): Promise<EventRestoreOutcome> => {
          calls.push('restore');
          return { kind: 'pulled', fetched: 0, inserted: 0, complete: true };
        },
      } as unknown as EventRestore;
      const sync = {
        syncOnce: async () => {
          calls.push('push');
          return { kind: 'idle' as const };
        },
      } as unknown as SyncEngine;
      useSessionStore
        .getState()
        .attachSync(
          sync,
          null as unknown as ReferenceSync,
          null as unknown as TraceSync,
          null as unknown as ThemePrefsSync,
          restore,
        );

      // Pusty outbox: nie ma o co pytać - sama wysyłka (czyli `idle`).
      await store().syncNow();
      expect(calls).toEqual(['push']);

      // Zaległość w kolejce: najpierw dosyłka z serwera, potem wysyłka.
      calls.length = 0;
      await openDay(clock);
      expect(store().outboxCount).toBeGreaterThan(0);
      await store().syncNow();
      expect(calls).toEqual(['restore', 'push']);
    });

    it('`restoreEventsNow` pyta serwer BEZ bramy wieku - druga połowa ręcznego syncu', async () => {
      // Issue #75 pkt 1: unieważnienie wpisane przez administratora ma zejść na telefon
      // od razu po „SYNCHRONIZUJ TERAZ"/„PONÓW PRÓBĘ", a nie do kwadransa później.
      const { store } = attach();
      const gated: number[] = [];
      const forced: number[] = [];
      const restore = {
        restoreIfStale: async (): Promise<EventRestoreOutcome> => {
          gated.push(1);
          return { kind: 'fresh' };
        },
        restore: async (): Promise<EventRestoreOutcome> => {
          forced.push(1);
          return { kind: 'pulled', fetched: 1, inserted: 1, complete: true };
        },
      } as unknown as EventRestore;
      useSessionStore
        .getState()
        .attachSync(
          null as unknown as SyncEngine,
          null as unknown as ReferenceSync,
          null as unknown as TraceSync,
          null as unknown as ThemePrefsSync,
          restore,
        );

      const before = store().streamRevision;
      await store().restoreEventsNow();
      expect(gated).toHaveLength(0);
      expect(forced).toHaveLength(1);
      // Dopisany wiersz przelicza projekcje, jak w drodze z pętli okazji.
      expect(store().streamRevision).toBe(before + 1);
    });
  });

  /**
   * WYŚCIG RĘCZNEGO PRZYCISKU Z AUTODETEKCJĄ (zgłoszenie z urządzenia, 2026-08-26:
   * „Kołowanie" 2x pod rząd w logu). Pilot tapie „Taxi" w tej samej sekundzie,
   * w której automat wykrywa ruch z tych samych fixów. Obrona miała dwie warstwy
   * i obie mają to samo ślepe pole - ZAPIS W LOCIE:
   *  • sito `taxiWrite` (ścieżka auto) czyta `projection.taxiing`, a projekcja
   *    odświeża się dopiero PO zakończeniu zapisu;
   *  • twarda reguła `ALREADY_TAXIING` czyta stan z bazy PRZED dopisaniem - dwa
   *    nakładające się zapisy oba widzą „kołowania nie ma" i oba wchodzą.
   * Stąd serializacja w store: drugi zapis czeka na pierwszy i ogląda ŚWIEŻĄ
   * projekcję - duplikat oddaje wynik tamtego zapisu zamiast dopisywać własny.
   */
  describe('taxi - zapisy zserializowane, wyścig nie duplikuje kołowania', () => {
    it('równoległe manual+auto dają JEDNO zdarzenie taxi, bez błędu dla pilota', async () => {
      const { repo, clock, store } = attach();
      await openDay(clock);
      clock.set(min(12));
      await store().startEngine();

      clock.set(min(14));
      await Promise.all([store().taxi('manual'), store().taxi('auto', null, min(14))]);

      const taxis = (await repo.getAllEvents()).filter((e) => e.type === 'taxi');
      expect(taxis).toHaveLength(1);
      // Duplikat rozstrzygnięty po cichu - pilot nie dostaje błędu o stanie,
      // który właśnie chciał osiągnąć.
      expect(store().lastError).toBeNull();
      expect(store().projection.taxiing).toBe(true);
    });

    it('po starcie kołowanie wolno zapisać znów - serializacja nie zjada nowego faktu', async () => {
      const { repo, clock, store } = attach();
      await openDay(clock);
      clock.set(min(12));
      await store().startEngine();
      clock.set(min(14));
      await store().taxi('auto', null, min(14));
      clock.set(min(20));
      await store().takeoff('manual');
      clock.set(min(40));
      await store().landing('manual');

      // Dobieg po lądowaniu - nowy wpis, nie duplikat (kołowanie zamknął start).
      clock.set(min(41));
      await store().taxi('auto', null, min(41));

      const taxis = (await repo.getAllEvents()).filter((e) => e.type === 'taxi');
      expect(taxis).toHaveLength(2);
    });
  });

  it('loadSession zdanego samolotu usuwa osierocony active_session_uuid', async () => {
    const { repo, clock, store } = attach();
    await openDay(clock);
    clock.set(min(300));
    // BEZ `dutyEnd` - tak zdaje samolot ekran 09B (§3.6a). Z podaną godziną fixture
    // ukrywał wadę: klucz usługi w tle zostawał przy sesji, której pilot już nie ma.
    await store().releaseAircraft({ finalReading: { fuelL: 150, mh: 1234.5 } });
    // Symulacja crasha między day_close a czyszczeniem klucza.
    await repo.setMeta(SESSION_META_KEYS.activeSessionUuid, SESSION);

    await store().loadSession(SESSION);
    expect(await repo.getMeta(SESSION_META_KEYS.activeSessionUuid)).toBeNull();
  });
});
