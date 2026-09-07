/**
 * UZ Aero - testy „Poprzednich dni" (ekran 12: `queries.historyDays` + `screens/historyDays`).
 *
 * Sedno po issue #35: ekran pokazuje sesje z dni WCZEŚNIEJSZYCH (dzisiejsze mieszkają
 * na 01), kafelek niesie te same trzy wielkości co kafelek sesji na „Mój dzień"
 * (Loty / Blok / Lot), a plakietka wysyłki istnieje wyłącznie wtedy, gdy coś czeka
 * w kolejce. Podział na grupy robi okno korekty (24 h od zdania samolotu), sesja
 * TRZYMANA nie jest historią, a liczby na karcie liczy ten sam `projectSession`,
 * co ekran 10 - test przepuszcza kanoniczny dzień przez PRAWDZIWE repo i sprawdza
 * gotowe napisy.
 */

import { CORRECTION_WINDOW_MS } from '../domain';
import { EventsRepo, SessionQueries } from '../application';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { FixedClock } from '../infrastructure/clock';
import {
  buildHistory,
  editableBadge,
  remainingLabel,
  uploadSpec,
} from '../ui/screens/logic/historyDays';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
/** Nazajutrz - z tego punktu widzenia sesja z 22 CZE jest „poprzednim dniem". */
const nextDay = (h: number, m: number): number => at(h, m) + 24 * 3_600_000;

function harness() {
  let seq = 0;
  const clock = new FixedClock(at(8, 0));
  const repo = new EventsRepo(new InMemoryAdapter(), {
    clock,
    generateId: () => `id-${(seq += 1)}`,
  });
  return { repo, queries: new SessionQueries(repo), clock };
}

/** Zamknięta sesja: claim → preflight → bieg silnika z lotem → zdanie samolotu. */
async function writeDay(
  repo: EventsRepo,
  sessionUuid: string,
  dayStart: number,
  aircraftId = 'SP-AXA',
): Promise<void> {
  const t = (offsetMin: number): number => dayStart + offsetMin * 60_000;
  const base = { sessionUuid, aircraftId, picId: 'TMK', dualId: null } as const;
  await repo.appendEvent({ ...base, type: 'session_claim', payload: { mode: 'free' }, deviceTime: t(0) });
  await repo.appendEvent({
    ...base,
    type: 'preflight_confirm',
    payload: {
      operation: 'skoki',
      departureIcao: null,
      arrivalIcao: null,
      reading: { fuelL: 150, mh: 1234.5 },
      client: null,
      mhFormat: 'hhmm',
    },
    deviceTime: t(0),
  });
  await repo.appendEvent({ ...base, type: 'engine_start', payload: {}, deviceTime: t(12) });
  await repo.appendEvent({ ...base, type: 'takeoff', payload: { method: 'auto' }, deviceTime: t(25) });
  await repo.appendEvent({
    ...base,
    type: 'drop',
    payload: { dropNumber: 1, altitudeFt: 13_000, jumpers: { tandem: 2, aff: 1, solo: 1 }, client: null },
    deviceTime: t(48),
  });
  await repo.appendEvent({ ...base, type: 'landing', payload: { method: 'auto' }, deviceTime: t(78) });
  await repo.appendEvent({ ...base, type: 'engine_stop', payload: {}, deviceTime: t(154) });
  await repo.appendEvent({
    ...base,
    type: 'day_close',
    // BEZ `dutyEnd` - dokładnie tak, jak wysyła to ekran „Zdaj samolot" (§3.6a: zdanie
    // maszyny nie kończy dnia pilota). Fixture podawał tu godzinę i przez to ukrywał
    // wadę, w której historia gubiła każdą poprawnie zdaną sesję.
    payload: { finalReading: { fuelL: 110, mh: 1236.87 } },
    deviceTime: t(525),
  });
}

describe('poprzednie dni (ekran 12)', () => {
  it('operacja w oknie → grupa „Możesz jeszcze poprawić" z terminem i odliczaniem', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0)); // zdanie 16:45, okno do 23 CZE 16:45

    const now = nextDay(9, 0); // 23 CZE 09:00 - zostało 7 h 45 min
    /* Rezolwer znaku - jak w `myDay.test.ts`: identyfikator w świecie testowym JEST
       znakiem, więc mapowanie jest tożsamością, ale podane JAWNIE mówi, że kafelek
       bierze znak z cache'u floty, a nie z projekcji (2026-08-30). */
    const regOf = (id: string) => id.toUpperCase();
    const groups = buildHistory(await queries.historyDays(), now, false, regOf);

    expect(groups.closed).toHaveLength(0);
    expect(groups.editable).toHaveLength(1);
    const day = groups.editable[0]!;
    // Nagłówkiem kafelka historii jest DATA (na 01 - numer sesji w dobie, issue #42).
    expect(day.title).toBe('22 CZERWCA 2026');
    expect(day.aircraft).toBe('SP-AXA');
    // Godziny BIEGU SILNIKA, nie przejęcia - bez nich dwie sesje tej samej doby na tej
    // samej maszynie byłyby nie do odróżnienia.
    expect(day.times).toBe('08:12 → 10:34 UTC');
    // Te same trzy wielkości i te same nazwy, co kafelek sesji na 01 (issue #35 pkt 6;
    // od issue #42 dosłownie z tej samej funkcji `sessionStats`).
    // „Sesja" (czas trzymania maszyny) i „Skoczków" wypadły z kafelka.
    expect(day.stats).toEqual([
      { k: 'Loty', v: '1' },
      { k: 'Blok', v: '2:22' }, // 8:12 → 10:34, ta sama liczba co na ekranie 10
      { k: 'Lot', v: '0:53' }, // 8:25 → 9:18
    ]);
    // Model 2026-08-10: okno kotwiczy się w ZDANIU samolotu (zatwierdzenie logu),
    // nie w zgaszeniu silnika.
    expect(day.deadline).toBe('Korekta do 23 CZE 16:45');
    expect(day.remaining).toBe('zostało 7 h 45 min');
  });

  it('po oknie 24 h operacja przechodzi do „Zamknięte"', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));

    const groups = buildHistory(
      await queries.historyDays(),
      at(16, 45) + CORRECTION_WINDOW_MS + 60_000,
    );

    expect(groups.editable).toHaveLength(0);
    expect(groups.closed).toHaveLength(1);
    // Karta zamknięta jest pełnoprawnym wejściem w podgląd (10b) - musi wiedzieć,
    // KTÓRY strumień otworzyć (issue #35 pkt 2).
    expect(groups.closed[0]!.sessionUuid).toBe('sess-1');
  });

  it('operacji z DZISIEJSZEJ doby tu nie ma - te stoją na „Mój dzień"', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));

    // Ta sama sesja, oglądana jeszcze tego samego dnia: zdana, okno otwarte - a mimo to
    // ekran „Poprzednie dni" jej nie pokazuje (issue #35 pkt 1).
    const sameDay = buildHistory(await queries.historyDays(), at(20, 0));
    expect(sameDay.editable).toHaveLength(0);
    expect(sameDay.closed).toHaveLength(0);

    // Nazajutrz ta sama sesja jest już historią.
    const tomorrow = buildHistory(await queries.historyDays(), nextDay(9, 0));
    expect(tomorrow.editable).toHaveLength(1);
  });

  it('operacja spod północy należy do doby URUCHOMIENIA silnika (tak jak na 01)', async () => {
    const { repo, queries } = harness();
    // Silnik rusza 22 CZE o 23:12, gaśnie 23 CZE o 01:34, zdanie 23 CZE o 07:45.
    await writeDay(repo, 'sess-noc', at(23, 0), 'SP-KLM');

    // 23 CZE rano: dobą dzisiejszą jest 23 CZE, a sesja należy do 22 CZE - widać ją.
    const groups = buildHistory(await queries.historyDays(), nextDay(9, 0));
    expect(groups.editable.map((d) => d.sessionUuid)).toEqual(['sess-noc']);
    expect(groups.editable[0]!.times).toBe('23:12 → 01:34 UTC');
  });

  it('operacja TRZYMANA nie jest historią - ma kokpit, nie kartę', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));
    // Druga sesja bez zdania samolotu.
    const base = { sessionUuid: 'sess-2', aircraftId: 'SP-FGK', picId: 'TMK', dualId: null } as const;
    await repo.appendEvent({ ...base, type: 'session_claim', payload: { mode: 'free' }, deviceTime: at(18, 0) });

    const groups = buildHistory(await queries.historyDays(), nextDay(9, 0));
    const uuids = [...groups.editable, ...groups.closed].map((d) => d.sessionUuid);
    expect(uuids).toEqual(['sess-1']);
  });

  it('plakietka wysyłki: nic przy pustej kolejce, licznik przy zaległości', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-old', at(8, 0) - 5 * 24 * 3_600_000, 'SP-FGK');
    await writeDay(repo, 'sess-new', at(8, 0));
    // Stara sesja wysłana w całości, nowa czeka w kolejce.
    const all = await repo.getAllEvents();
    await repo.markSynced(all.filter((e) => e.sessionUuid === 'sess-old').map((e) => e.uuid));

    const days = await queries.historyDays();
    expect(days.map((d) => d.state.sessionUuid)).toEqual(['sess-new', 'sess-old']);

    const groups = buildHistory(days, nextDay(9, 0));
    expect(groups.editable[0]!.upload).toEqual({
      label: 'Oczekuje na przesłanie · 8',
      state: 'queued',
    });
    // „Wysłane" NIE ISTNIEJE - to stan domyślny, więc karta nie mówi o nim nic
    // (issue #35 pkt 3, ta sama reguła co SyncChip online).
    expect(groups.closed[0]!.upload).toBeNull();
  });

  it('plakietka rozróżnia kolejkę od wysyłki w toku', () => {
    expect(uploadSpec(0, false)).toBeNull();
    expect(uploadSpec(0, true)).toBeNull();
    expect(uploadSpec(3, false)).toEqual({
      label: 'Oczekuje na przesłanie · 3',
      state: 'queued',
    });
    expect(uploadSpec(3, true)).toEqual({
      label: 'W trakcie wysyłania · 3',
      state: 'sending',
    });
  });

  it('plakietka na 01: najświeższa operacja w oknie, ale nigdy z dnia dzisiejszego', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));

    // Tego samego dnia plakietka milczy: sesję poprawia się kafelkiem tuż obok,
    // a plakietka obiecywałaby coś, czego pilot w historii nie znajdzie.
    expect(editableBadge(await queries.historyDays(), at(20, 0))).toBeNull();

    expect(editableBadge(await queries.historyDays(), nextDay(9, 0))).toBe(
      '22 CZE - można poprawić',
    );
    expect(
      editableBadge(await queries.historyDays(), at(16, 45) + CORRECTION_WINDOW_MS + 60_000),
    ).toBeNull();
  });

  it('odliczanie: godziny z zerem wiodącym minut, poniżej godziny same minuty', () => {
    expect(remainingLabel(23 * 3_600_000 + 4 * 60_000)).toBe('zostało 23 h 04 min');
    expect(remainingLabel(42 * 60_000)).toBe('zostało 42 min');
    expect(remainingLabel(30_000)).toBe('zostało 1 min'); // zaokrąglenie W GÓRĘ - nie „0 min"
  });
});

/** Zapis bez biegu silnika (09C): claim → preflight → zdanie. Odczyt końcowy do wyboru. */
async function writeNoRun(
  repo: EventsRepo,
  sessionUuid: string,
  dayStart: number,
  finalReading: { fuelL: number; mh: number },
): Promise<void> {
  const t = (offsetMin: number): number => dayStart + offsetMin * 60_000;
  const base = { sessionUuid, aircraftId: 'SP-FGK', picId: 'TMK', dualId: null } as const;
  await repo.appendEvent({ ...base, type: 'session_claim', payload: { mode: 'free' }, deviceTime: t(0) });
  await repo.appendEvent({
    ...base,
    type: 'preflight_confirm',
    payload: {
      operation: 'skoki',
      departureIcao: null,
      arrivalIcao: null,
      reading: { fuelL: 240, mh: 2815.2 },
      client: null,
      mhFormat: 'decimal',
    },
    deviceTime: t(1),
  });
  await repo.appendEvent({
    ...base,
    type: 'day_close',
    payload: { finalReading, noFlightReason: 'weather' },
    deviceTime: t(75),
  });
}

describe('poprzednie dni - unieważnienie i treść operacji (issue #75)', () => {
  it('sesja unieważniona (także przez administratora) wypada z historii i z plakietki', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));
    // Tak wraca unieważnienie z panelu: zwykłe zdarzenie strumienia (`GET /me/events`).
    await repo.appendEvent({
      sessionUuid: 'sess-1',
      aircraftId: 'SP-AXA',
      picId: 'TMK',
      dualId: null,
      type: 'session_void',
      payload: { reason: 'wpis testowy' },
      deviceTime: nextDay(8, 0),
    });

    const days = await queries.historyDays();
    const groups = buildHistory(days, nextDay(9, 0));
    expect(groups.editable).toHaveLength(0);
    expect(groups.closed).toHaveLength(0);
    expect(editableBadge(days, nextDay(9, 0))).toBeNull();
  });

  it('zapis PUSTY (odczyty równe przejęciu, bez biegu) nie ma karty ani plakietki', async () => {
    const { repo, queries } = harness();
    await writeNoRun(repo, 'sess-empty', at(9, 10), { fuelL: 240, mh: 2815.2 });

    const days = await queries.historyDays();
    const groups = buildHistory(days, nextDay(9, 0));
    expect(groups.editable).toHaveLength(0);
    expect(groups.closed).toHaveLength(0);
    expect(editableBadge(days, nextDay(9, 0))).toBeNull();
  });

  it('zapis bez biegu ze ZMIENIONYM odczytem ma kartę z godzinami zajęcia maszyny', async () => {
    const { repo, queries } = harness();
    await writeNoRun(repo, 'sess-changed', at(9, 10), { fuelL: 236, mh: 2815.2 });

    const groups = buildHistory(await queries.historyDays(), nextDay(9, 0));
    expect(groups.editable.map((d) => d.sessionUuid)).toEqual(['sess-changed']);
    // Godziny ZAJĘCIA (przejęcie → zdanie): jedyna para godzin, jaką ten zapis ma.
    expect(groups.editable[0]!.times).toBe('09:10 → 10:25 UTC');
    expect(groups.editable[0]!.stats).toEqual([
      { k: 'Loty', v: '0' },
      { k: 'Blok', v: '0:00' },
      { k: 'Lot', v: '0:00' },
    ]);
  });
});
