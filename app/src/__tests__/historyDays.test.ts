/**
 * Ninerdeck - testy HISTORII (zakładka 24: `queries.historyDays` + `screens/historyDays`).
 *
 * Sedno po 3.0.0 (epik R-E): zakładka obejmuje WSZYSTKIE operacje - dzisiejsze i
 * wcześniejsze - bo Pulpit pokazuje same sumy, a wiersz operacji jest jedynymi drzwiami
 * do korekty w oknie 24 h. Dzień jest NAGŁÓWKIEM grupy, operacje zwartymi wierszami,
 * a liczby stoją bez etykiet. Domyślnie widać to, co można poprawić; reszta czeka
 * zwinięta w archiwum.
 *
 * Test przepuszcza kanoniczny dzień przez PRAWDZIWE repo i sprawdza gotowe napisy -
 * liczby liczy ten sam `projectSession`, co ekran 10.
 */

import { CORRECTION_WINDOW_MS } from '../domain';
import { EventsRepo, SessionQueries } from '../application';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { FixedClock } from '../infrastructure/clock';
import { buildHistoryLog, dayLabel, uploadSpec } from '../ui/screens/logic/historyDays';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;
/** Nazajutrz - z tego punktu widzenia sesja z 22 CZE jest „wczorajsza". */
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
    // BEZ `dutyEnd` - dokładnie tak, jak wysyła to ekran „Zdaj samolot" (§3.6a).
    payload: { finalReading: { fuelL: 110, mh: 1236.87 } },
    deviceTime: t(525),
  });
}

describe('historia - wiersz operacji (zakładka 24)', () => {
  it('operacja w oknie korekty: godziny biegu, sygnatura, trójka BEZ etykiet i ołówek', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0)); // zdanie 16:45, okno do 23 CZE 16:45

    const now = nextDay(9, 0);
    /* Rezolwer znaku - jak w `myDay.test.ts`: identyfikator w świecie testowym JEST
       znakiem, ale podany JAWNIE mówi, że wiersz bierze znak z cache'u floty. */
    const regOf = (id: string) => id.toUpperCase();
    const vm = buildHistoryLog(await queries.historyDays(), now, false, regOf);

    expect(vm.archive).toHaveLength(0);
    expect(vm.open).toHaveLength(1);
    const op = vm.open[0]!.ops[0]!;

    expect(op.aircraft).toBe('SP-AXA');
    // Godziny BIEGU SILNIKA, nie przejęcia - bez nich dwie operacje tej samej doby
    // na tej samej maszynie byłyby nie do odróżnienia.
    expect(op.times).toBe('08:12 → 10:34 UTC');
    // Trójka bez etykiet: loty, blok, czas w powietrzu - kolejność stała w całej aplikacji.
    expect(op.nums).toEqual(['1', '2:22', '0:53']);
    // Okno kotwiczy się w ZDANIU samolotu (model 2026-08-10), nie w zgaszeniu silnika.
    expect(op.editable).toBe(true);
    expect(op.deadline).toBe('Korekta do 23 CZE 16:45');
  });

  it('po oknie 24 h operacja schodzi do ARCHIWUM i zmienia skutek tapnięcia na podgląd', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));

    const vm = buildHistoryLog(
      await queries.historyDays(),
      at(16, 45) + CORRECTION_WINDOW_MS + 60_000,
    );

    expect(vm.open).toHaveLength(0);
    expect(vm.archive).toHaveLength(1);
    expect(vm.archiveCount).toBe(1);
    const op = vm.archive[0]!.ops[0]!;
    // Wiersz zamknięty jest pełnoprawnym wejściem w podgląd (10b) - musi wiedzieć,
    // KTÓRY strumień otworzyć.
    expect(op.sessionUuid).toBe('sess-1');
    expect(op.editable).toBe(false);
    // Termin gaśnie razem z oknem: plakietka istnieje WYŁĄCZNIE przy stanie odchylonym.
    expect(op.deadline).toBeNull();
  });

  it('DZISIEJSZE operacje są tutaj - to odejście od issue #35, wymuszone Pulpitem', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));

    // Ta sama operacja oglądana jeszcze tego samego dnia: do 3.0.0 ekran jej NIE pokazywał,
    // bo stała na „Mój dzień". Pulpit ma same sumy, więc drzwi do korekty są tutaj.
    const sameDay = buildHistoryLog(await queries.historyDays(), at(20, 0));
    expect(sameDay.open).toHaveLength(1);
    expect(sameDay.open[0]!.label).toBe('Dzisiaj · 22 CZERWCA');
    expect(sameDay.open[0]!.ops[0]!.editable).toBe(true);
  });

  it('operacja spod północy należy do doby URUCHOMIENIA silnika (tak jak na Pulpicie)', async () => {
    const { repo, queries } = harness();
    // Silnik rusza 22 CZE o 23:12, gaśnie 23 CZE o 01:34, zdanie 23 CZE o 07:45.
    await writeDay(repo, 'sess-noc', at(23, 0), 'SP-KLM');

    const vm = buildHistoryLog(await queries.historyDays(), nextDay(9, 0));
    expect(vm.open).toHaveLength(1);
    expect(vm.open[0]!.label).toBe('Wczoraj · 22 CZERWCA');
    expect(vm.open[0]!.ops.map((o) => o.sessionUuid)).toEqual(['sess-noc']);
    expect(vm.open[0]!.ops[0]!.times).toBe('23:12 → 01:34 UTC');
  });

  it('operacja TRZYMANA nie jest historią - ma kokpit, nie wiersz', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));
    // Druga operacja bez zdania samolotu.
    const base = { sessionUuid: 'sess-2', aircraftId: 'SP-FGK', picId: 'TMK', dualId: null } as const;
    await repo.appendEvent({ ...base, type: 'session_claim', payload: { mode: 'free' }, deviceTime: at(18, 0) });

    const vm = buildHistoryLog(await queries.historyDays(), nextDay(9, 0));
    const uuids = [...vm.open, ...vm.archive].flatMap((d) => d.ops.map((o) => o.sessionUuid));
    expect(uuids).toEqual(['sess-1']);
  });
});

describe('historia - grupy dni', () => {
  it('dzień z KILKOMA operacjami dostaje sumę, dzień z jedną - nie', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-a', at(8, 0));
    await writeDay(repo, 'sess-b', at(12, 0), 'SP-BKL');

    const vm = buildHistoryLog(await queries.historyDays(), at(20, 0));
    expect(vm.open).toHaveLength(1);
    const dzien = vm.open[0]!;
    expect(dzien.ops).toHaveLength(2);
    // Suma tej samej trójki: dwa loty, dwa razy 2:22 bloku i dwa razy 0:53 w powietrzu.
    expect(dzien.total).toEqual(['2', '4:44', '1:46']);

    // Przy jednej operacji suma byłaby przepisaniem wiersza tuż wyżej.
    const sama = harness();
    await writeDay(sama.repo, 'sess-sama', at(8, 0));
    const jedna = buildHistoryLog(await sama.queries.historyDays(), at(20, 0));
    expect(jedna.open[0]!.ops).toHaveLength(1);
    expect(jedna.open[0]!.total).toBeNull();
  });

  it('dni idą od NAJNOWSZEGO, a operacje wewnątrz doby chronologicznie', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'wczoraj', at(8, 0) - 24 * 3_600_000, 'SP-FGK');
    await writeDay(repo, 'dzis-pozna', at(12, 0), 'SP-BKL');
    await writeDay(repo, 'dzis-wczesna', at(8, 0));

    // 15:00, a nie 20:00: wczorajsze okno korekty gaśnie o 16:45, więc później ten
    // dzień jest już archiwum - a ten test pyta o KOLEJNOŚĆ, nie o podział.
    const vm = buildHistoryLog(await queries.historyDays(), at(15, 0));
    expect(vm.open.map((d) => d.label)).toEqual(['Dzisiaj · 22 CZERWCA', 'Wczoraj · 21 CZERWCA']);
    expect(vm.open[0]!.ops.map((o) => o.sessionUuid)).toEqual(['dzis-wczesna', 'dzis-pozna']);
  });

  it('archiwum to dni BEZ ani jednej operacji do poprawienia, z licznikiem operacji', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'stara-1', at(8, 0) - 5 * 24 * 3_600_000, 'SP-FGK');
    await writeDay(repo, 'stara-2', at(12, 0) - 5 * 24 * 3_600_000, 'SP-KLM');
    await writeDay(repo, 'swieza', at(8, 0));

    const vm = buildHistoryLog(await queries.historyDays(), at(20, 0));
    expect(vm.open.flatMap((d) => d.ops.map((o) => o.sessionUuid))).toEqual(['swieza']);
    // Licznik przy przycisku liczy OPERACJE, nie dni - to one są tym, czego pilot szuka.
    expect(vm.archiveCount).toBe(2);
    expect(vm.archive).toHaveLength(1);
  });

  it('nazwa doby: dziś i wczoraj po imieniu, starsze datą z rokiem', () => {
    const teraz = at(20, 0);
    expect(dayLabel(DAY, teraz)).toBe('Dzisiaj · 22 CZERWCA');
    expect(dayLabel(DAY - 86_400_000, teraz)).toBe('Wczoraj · 21 CZERWCA');
    // Bez roku „11 CZERWCA" po pół roku nie mówi, o który rok chodzi.
    expect(dayLabel(DAY - 11 * 86_400_000, teraz)).toBe('11 CZERWCA 2026');
  });
});

describe('historia - plakietka wysyłki', () => {
  it('nic przy pustej kolejce, licznik przy zaległości', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-old', at(8, 0) - 5 * 24 * 3_600_000, 'SP-FGK');
    await writeDay(repo, 'sess-new', at(8, 0));
    // Stara operacja wysłana w całości, nowa czeka w kolejce.
    const all = await repo.getAllEvents();
    await repo.markSynced(all.filter((e) => e.sessionUuid === 'sess-old').map((e) => e.uuid));

    const days = await queries.historyDays();
    expect(days.map((d) => d.state.sessionUuid)).toEqual(['sess-new', 'sess-old']);

    const vm = buildHistoryLog(days, nextDay(9, 0));
    expect(vm.open[0]!.ops[0]!.upload).toEqual({
      label: 'Oczekuje na przesłanie · 8',
      state: 'queued',
    });
    // „Wysłane" NIE ISTNIEJE - to stan domyślny, więc wiersz nie mówi o nim nic
    // (issue #35 pkt 3, ta sama reguła co SyncChip online).
    expect(vm.archive[0]!.ops[0]!.upload).toBeNull();
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

describe('historia - unieważnienie i treść operacji (issue #75)', () => {
  it('operacja unieważniona (także przez administratora) wypada z historii', async () => {
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

    const vm = buildHistoryLog(await queries.historyDays(), nextDay(9, 0));
    expect(vm.open).toHaveLength(0);
    expect(vm.archive).toHaveLength(0);
  });

  it('zapis PUSTY (odczyty równe przejęciu, bez biegu) nie ma wiersza', async () => {
    const { repo, queries } = harness();
    await writeNoRun(repo, 'sess-empty', at(9, 10), { fuelL: 240, mh: 2815.2 });

    const vm = buildHistoryLog(await queries.historyDays(), nextDay(9, 0));
    expect(vm.open).toHaveLength(0);
    expect(vm.archive).toHaveLength(0);
  });

  it('zapis bez biegu ze ZMIENIONYM odczytem ma wiersz z godzinami zajęcia maszyny', async () => {
    const { repo, queries } = harness();
    await writeNoRun(repo, 'sess-changed', at(9, 10), { fuelL: 236, mh: 2815.2 });

    const vm = buildHistoryLog(await queries.historyDays(), nextDay(9, 0));
    const op = vm.open[0]!.ops[0]!;
    expect(op.sessionUuid).toBe('sess-changed');
    // Godziny ZAJĘCIA (przejęcie → zdanie): jedyna para godzin, jaką ten zapis ma.
    expect(op.times).toBe('09:10 → 10:25 UTC');
    expect(op.nums).toEqual(['0', '0:00', '0:00']);
  });
});
