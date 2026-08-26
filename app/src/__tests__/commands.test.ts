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
import { SESSION_META_KEYS } from '../application/ports';
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
        consumption: null,
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
      commands.releaseAircraft(CTX, {
        finalReading: { fuelL: 112, mh: MH_START - 2 },
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

  it('zrzut z zerowym składem zapisuje `jumpers: null` — „nie podano", nie „zero" (issue #21)', async () => {
    // Arkusz nie ma pola „bez deklaracji": pilot po prostu nie rusza liczników.
    // Znak tej decyzji normalizuje komenda, żeby nie zależał od ekranu.
    const { commands, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);
    clock.set(min(12));
    await commands.startEngine(CTX);
    clock.set(min(25));
    await commands.takeoff(CTX, 'auto');

    clock.set(min(40));
    const result = await commands.drop(CTX, { jumpers: { tandem: 0, aff: 0, solo: 0 } });
    expect(result.event.type === 'drop' && result.event.payload.jumpers).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('załadunek zapisuje się na ziemi; skład normalizuje się jak przy zrzucie (issue #21)', async () => {
    const { commands, repo, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);
    clock.set(min(12));
    await commands.startEngine(CTX);

    clock.set(min(15));
    const declared = await commands.boarding(CTX, { jumpers: { tandem: 2, aff: 1, solo: 0 } });
    expect(declared.event.type).toBe('boarding');
    expect(declared.event.type === 'boarding' && declared.event.payload.jumpers).toEqual({
      tandem: 2,
      aff: 1,
      solo: 0,
    });
    expect(declared.warnings).toEqual([]);
    expect(await repo.getEvent(declared.event.uuid)).not.toBeNull();

    clock.set(min(17));
    const bare = await commands.boarding(CTX, { jumpers: { tandem: 0, aff: 0, solo: 0 } });
    expect(bare.event.type === 'boarding' && bare.event.payload.jumpers).toBeNull();

    // Prefill dla arkusza zrzutu bierze się z projekcji — ostatni załadunek wygrywa.
    const state = projectSession(await repo.getSessionEvents(SESSION));
    expect(state.boarding).toEqual({ jumpers: null, at: min(17) });
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
    const closed = await commands.releaseAircraft(CTX, {
      finalReading: { fuelL: 160, mh: MH_START + 142 / 60 },
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

describe('SessionCommands — active_session_uuid dla zapisu headless (GPS w tle)', () => {
  // Klucz żyje dokładnie tak długo, jak pilot TRZYMA SAMOLOT: writer headless czyta go
  // po śmierci procesu, więc osierocona wartość przypisałaby fixy do cudzej sesji,
  // a brakująca — wyrzuciła ślad do kosza. Inny cykl życia niż `current_session_uuid`,
  // którego nikt nie czyści (`navigation/resumeTarget.ts` decyduje po `state.closed`).

  it('claim zapisuje klucz, udane day_close go czyści', async () => {
    const { adapter, commands, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);

    expect(await adapter.getMeta(SESSION_META_KEYS.activeSessionUuid)).toBe(SESSION);

    clock.set(min(300));
    await commands.releaseAircraft(CTX, {
      finalReading: { fuelL: 150, mh: MH_START },
    });

    expect(await adapter.getMeta(SESSION_META_KEYS.activeSessionUuid)).toBeNull();
  });

  it('odrzucone day_close NIE czyści klucza (dzień wciąż trwa)', async () => {
    const { adapter, commands, clock, seedCache } = setup();
    await seedCache();
    await openDay(commands, clock);
    clock.set(min(12));
    await commands.startEngine(CTX, { fieldElevationFt: 780 });

    // Zamknięcie dnia przy pracującym silniku jest odrzucane — usługa tła ma dalej
    // wiedzieć, do której sesji pisać.
    clock.set(min(30));
    await expect(
      commands.releaseAircraft(CTX, { finalReading: { fuelL: 150, mh: MH_START } }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    expect(await adapter.getMeta(SESSION_META_KEYS.activeSessionUuid)).toBe(SESSION);
  });

  it('odrzucony claim niczego nie zapisuje', async () => {
    const { adapter, commands, clock, seedCache } = setup();
    await seedCache();
    clock.set(min(-5));
    await commands.claim({ ...CTX, mode: 'free' });
    // Czysty stan klucza — inaczej nie odróżnimy „nie zapisał" od „zapisał to samo".
    await adapter.deleteMeta(SESSION_META_KEYS.activeSessionUuid);

    await expect(commands.claim({ ...CTX, mode: 'free' })).rejects.toBeInstanceOf(DomainRuleError);
    expect(await adapter.getMeta(SESSION_META_KEYS.activeSessionUuid)).toBeNull();
  });
});

/**
 * Sesja = jeden bieg silnika (2026-08-10). Blok `closeLeg` (potwierdzenie wzlotu)
 * zniknął razem z komendą i zdarzeniem — sesję zatwierdza `releaseAircraft`.
 * Tu zostaje gwardia, przez którą tamte testy nie miały prawa dalej istnieć:
 * ich helper `twoCycles()` budował DWA biegi w jednej sesji.
 */
describe('jeden bieg silnika na sesję (2026-08-10)', () => {
  it('drugi startEngine po zakończonym biegu jest odrzucany', async () => {
    const h = setup();
    await openDay(h.commands, h.clock);

    h.clock.set(min(12));
    await h.commands.startEngine(CTX);
    h.clock.set(min(154));
    await h.commands.stopEngine(CTX);

    h.clock.set(min(195));
    await expect(h.commands.startEngine(CTX)).rejects.toMatchObject({
      code: 'SESSION_ALREADY_RAN',
    });
  });
});

/**
 * Ręczny wpis CAŁEGO lotu (ekran 15) — komenda składa kompletną sesję po fakcie.
 *
 * Dwie własności są tu ważniejsze od szczęśliwej ścieżki: czasy pilota mają być czasami
 * ZDARZEŃ (jadą w `gpsTime`, chwila zapisu zostaje w `deviceTime`), a próba generalna ma
 * chronić strumień przed osieroconą sesją — odrzucony komplet nie zapisuje NICZEGO.
 */
describe('manualFlight — kompletna sesja po fakcie (ekrany 15 → 15C)', () => {
  const T_START = min(600);
  const t = (m: number): number => T_START + m * 60_000;
  const input = (over: object = {}) => ({
    sessionUuid: 'sess-manual',
    aircraftId: AC,
    picId: PIC,
    dualId: null,
    operation: 'skoki' as const,
    departureIcao: 'EPZG',
    arrivalIcao: null,
    client: 'Skydive ZG',
    engine: { start: T_START, stop: t(54) },
    flights: [{ takeoff: t(6), landing: t(49) }],
    initialReading: { fuelL: 121, mh: MH_START },
    finalReading: { fuelL: 98, mh: MH_START + 0.9 },
    notes: 'lot spisany z kartki',
    ...over,
  });

  it('tworzy ZAMKNIĘTĄ sesję z jednym biegiem i jednym lotem o czasach pilota', async () => {
    const h = setup();
    h.clock.set(min(700)); // zapis godzinę PO locie — wpis po fakcie

    await h.commands.manualFlight(input());
    const s = await h.queries.sessionState('sess-manual');

    expect(s.closed).toBe(true);
    expect(s.legs).toHaveLength(1);
    expect(s.legs[0]!.startedAt).toBe(T_START);
    expect(s.legs[0]!.stoppedAt).toBe(t(54));
    expect(s.flights).toHaveLength(1);
    expect(s.blockTimeMs).toBe(54 * 60_000);
    expect(s.fuel.startL).toBe(121);
    expect(s.fuel.endL).toBe(98);
    // Okno korekty rusza od TERAZ (zapis), nie od przeszłego zatrzymania silnika —
    // inaczej wpis sprzed dwóch dni rodziłby się z oknem już wygasłym.
    expect(s.closedAt).toBe(min(700));
  });

  /**
   * PARITA Z LOTEM AUTOMATYCZNYM (2026-08-16): zadanie z kroku 2 ląduje w payloadzie
   * `preflight_confirm` — poprzednia wersja wpisywała twardo `operation: 'inne'`
   * i lot szkolny z kartki gubił Duala bezpowrotnie.
   */
  it('niesie komplet zadania: operację, lotnisko, klienta i Duala', async () => {
    const h = setup();
    h.clock.set(min(700));

    await h.commands.manualFlight(input({ dualId: 'uczen-1' }));
    const s = await h.queries.sessionState('sess-manual');

    expect(s.operation).toBe('skoki');
    expect(s.departureIcao).toBe('EPZG');
    expect(s.client).toBe('Skydive ZG');
    expect(s.dualId).toBe('uczen-1');
  });

  /**
   * Znacznik „RĘCZNIE" jest JAWNY na `session_claim` (2026-08-16): z metody zdarzeń
   * nie da się go wywieść, bo `manual` niesie też zwykły lot z ręcznymi przyciskami.
   */
  it('sesja z wpisu niesie manualEntry; sesja z kokpitu NIE', async () => {
    const h = setup();
    h.clock.set(min(700));

    await h.commands.manualFlight(input());
    expect((await h.queries.sessionState('sess-manual')).manualEntry).toBe(true);

    await h.commands.claim({ ...CTX, mode: 'free', previousPicId: null });
    expect((await h.queries.sessionState(SESSION)).manualEntry).toBe(false);
  });

  it('przyjmuje WIELE lotów i sortuje je po czasie niezależnie od kolejności listy', async () => {
    const h = setup();
    h.clock.set(min(700));

    await h.commands.manualFlight(
      input({
        flights: [
          { takeoff: t(30), landing: t(45) }, // podane w odwrotnej kolejności
          { takeoff: t(6), landing: t(20) },
        ],
      }),
    );
    const s = await h.queries.sessionState('sess-manual');

    expect(s.flights).toHaveLength(2);
    expect(s.flights[0]!.takeoffAt).toBe(t(6));
    expect(s.flights[1]!.takeoffAt).toBe(t(30));
  });

  it('zrzuty wchodzą między start a lądowanie swojej pary, z klientem z zadania', async () => {
    const h = setup();
    h.clock.set(min(700));

    await h.commands.manualFlight(
      input({
        flights: [{ takeoff: t(6), landing: t(49) }],
        drops: [{ at: t(20), jumpers: { tandem: 2, aff: 0, solo: 1 }, altitudeFt: 4000 }],
      }),
    );
    const s = await h.queries.sessionState('sess-manual');
    const events = await h.repo.getAllEvents();
    const drop = events.find((e) => e.type === 'drop')!;
    const takeoff = events.find((e) => e.type === 'takeoff')!;
    const landing = events.find((e) => e.type === 'landing')!;

    expect(s.drops.count).toBe(1);
    expect(s.drops.jumpers).toEqual({ tandem: 2, aff: 0, solo: 1 });
    expect((drop.payload as { client: string }).client).toBe('Skydive ZG');
    // W strumieniu zrzut stoi MIĘDZY startem a lądowaniem — porządek czasu, nie formularza.
    expect(events.indexOf(drop)).toBeGreaterThan(events.indexOf(takeoff));
    expect(events.indexOf(drop)).toBeLessThan(events.indexOf(landing));
  });

  /**
   * PALIWO MA TRZY STANY (2026-08-16): przed uruchomieniem, dolewki, po locie.
   * Dolewka przed biegiem wchodzi do strumienia PRZED `engine_start` — sesja
   * z tankowaniem daje się wreszcie wpisać, a rachunek zużycia się domyka.
   */
  it('dolewka przed uruchomieniem zapisuje się i nie psuje rachunku paliwa', async () => {
    const h = setup();
    h.clock.set(min(700));

    await h.commands.manualFlight(
      input({
        initialReading: { fuelL: 112, mh: MH_START },
        refuels: [{ at: t(-10), beforeL: 64, addedL: 48, afterL: 112 }],
        finalReading: { fuelL: 76, mh: MH_START + 0.9 },
      }),
    );
    const s = await h.queries.sessionState('sess-manual');

    expect(s.closed).toBe(true);
    expect(s.fuel.addedL).toBe(48);
    // 112 przy przejęciu + 48 dolane − 76 po locie = 84 L zużycia — trójka się domyka.
    expect(s.fuel.consumedL).toBe(112 + 48 - 76);
  });

  /**
   * Dolewka w ŚRODKU biegu silnika jest błędem danych, nie wariantem: dolewa się
   * przy zatrzymanym śmigle. Komenda wstawia ją w jej miejscu czasowym, więc próba
   * generalna odrzuca CAŁY wpis nazwanym błędem — zamiast cicho przesuwać zdarzenie.
   */
  it('dolewka w środku biegu odrzuca cały wpis (REFUEL_ENGINE_RUNNING)', async () => {
    const h = setup();
    h.clock.set(min(700));

    await expect(
      h.commands.manualFlight(
        input({ refuels: [{ at: t(25), beforeL: 90, addedL: 20, afterL: 110 }] }),
      ),
    ).rejects.toMatchObject({ code: 'REFUEL_ENGINE_RUNNING' });

    expect(await h.repo.getAllEvents()).toHaveLength(0);
  });

  it('nie dotyka bieżącej sesji w session_meta — wpis historyczny nie jest „wznowieniem"', async () => {
    const h = setup();
    h.clock.set(min(700));

    await h.commands.manualFlight(input());

    expect(await h.queries.currentSession()).toBeNull();
  });

  it('próba generalna: odrzucony komplet nie zapisuje ANI JEDNEGO zdarzenia', async () => {
    const h = setup();
    h.clock.set(min(700));

    // Cofnięty licznik MH odbije się dopiero na `day_close` — czyli na OSTATNIM
    // kandydacie. Bez próby generalnej wszystkie wcześniejsze już byłyby w bazie.
    await expect(
      h.commands.manualFlight(input({ finalReading: { fuelL: 98, mh: MH_START - 1 } })),
    ).rejects.toMatchObject({ code: 'MH_REGRESSION' });

    expect(await h.repo.getAllEvents()).toHaveLength(0);
  });
});
