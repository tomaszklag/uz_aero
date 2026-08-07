/**
 * UZ Aero — testy historii dni (ekran 12: `queries.historyDays` + `screens/historyDays`).
 *
 * Sedno: podział na grupy robi okno korekty (24 h od `day_close`), dzień OTWARTY nie
 * jest historią (ma kokpit), a liczby na karcie liczy ten sam `projectSession`,
 * co ekran 10 — test przepuszcza kanoniczny dzień przez PRAWDZIWE repo i sprawdza
 * gotowe napisy.
 */

import { CORRECTION_WINDOW_MS } from '../domain';
import { EventsRepo, SessionQueries } from '../application';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { FixedClock } from '../infrastructure/clock';
import { buildHistory, editableBadge, remainingLabel } from '../ui/screens/logic/historyDays';

const DAY = Date.UTC(2026, 5, 22);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

function harness() {
  let seq = 0;
  const clock = new FixedClock(at(8, 0));
  const repo = new EventsRepo(new InMemoryAdapter(), {
    clock,
    generateId: () => `id-${(seq += 1)}`,
  });
  return { repo, queries: new SessionQueries(repo), clock };
}

/** Zamknięty dzień: claim → preflight → cykl z lotem 8:25–9:18 → day_close. */
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
      // Meldunek GODZINĘ PRZED przejęciem samolotu — tak wygląda zwykły dzień: pilot jest
      // na lotnisku od 07:00, a maszynę bierze o 08:00. Te dwie godziny rozsuwamy celowo,
      // żeby karta historii nie mogła pomylić sesji samolotu ze służbą pilota (§3.6a).
      dutyStart: t(-60),
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
    // BEZ `dutyEnd` — dokładnie tak, jak wysyła to ekran „Zdaj samolot" (§3.6a: zdanie
    // maszyny nie kończy dnia pilota). Fixture podawał tu godzinę i przez to ukrywał
    // wadę, w której historia gubiła każdą poprawnie zdaną sesję.
    payload: { finalReading: { fuelL: 110, mh: 1236.87 } },
    deviceTime: t(525),
  });
}

describe('historia dni (ekran 12)', () => {
  it('dzień w oknie → grupa „Możesz jeszcze poprawić" z terminem i odliczaniem', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0)); // day_close 16:45

    const now = at(17, 41); // 41 min po zamknięciu — zostało 23 h 04 min
    const groups = buildHistory(await queries.historyDays(), now);

    expect(groups.closed).toHaveLength(0);
    expect(groups.editable).toHaveLength(1);
    const day = groups.editable[0]!;
    expect(day.date).toBe('22 CZERWCA 2026');
    expect(day.aircraft).toBe('SP-AXA');
    expect(day.stats).toEqual([
      { k: 'Loty', v: '1' },
      { k: 'Block', v: '2:22' }, // 8:12 → 10:34, ta sama liczba co na ekranie 10
      // Karta opisuje SESJĘ SAMOLOTU: przejęcie 08:00 → zdanie 16:45 = 8:45. Służba
      // pilota trwała 9:45 (meldunek 07:00) i celowo NIE jest tą liczbą — należy do
      // pilota, nie do maszyny, i potrafi objąć kilka samolotów (§3.6a).
      { k: 'Sesja', v: '8:45' },
      { k: 'Skoczków', v: '4' },
    ]);
    // §3.6a: okno kotwiczy się w WZLOCIE, nie w zdaniu samolotu. Cykl kończy się
    // o 10:34, więc termin to 23 CZE 10:34 — a nie 16:45, kiedy pilot oddał maszynę.
    // Poprawiamy DANE LOTU, a te powstały o 10:34.
    expect(day.deadline).toBe('Korekta do 23 CZE 10:34');
    expect(day.remaining).toBe('zostało 16 h 53 min');
  });

  it('po oknie 24 h dzień przechodzi do „Zamknięte"', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));

    const groups = buildHistory(
      await queries.historyDays(),
      at(16, 45) + CORRECTION_WINDOW_MS + 60_000,
    );

    expect(groups.editable).toHaveLength(0);
    expect(groups.closed).toHaveLength(1);
  });

  it('dzień OTWARTY nie jest historią — ma kokpit, nie kartę', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));
    // Drugi dzień bez day_close.
    const base = { sessionUuid: 'sess-2', aircraftId: 'SP-FGK', picId: 'TMK', dualId: null } as const;
    await repo.appendEvent({ ...base, type: 'session_claim', payload: { mode: 'free' }, deviceTime: at(18, 0) });

    const groups = buildHistory(await queries.historyDays(), at(18, 30));
    const uuids = [...groups.editable, ...groups.closed].map((d) => d.sessionUuid);
    expect(uuids).toEqual(['sess-1']);
  });

  it('tag wysyłki liczy się z outboxa TEJ sesji; najnowszy dzień pierwszy', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-old', at(8, 0) - 5 * 24 * 3_600_000, 'SP-FGK');
    await writeDay(repo, 'sess-new', at(8, 0));
    // Stary dzień wysłany w całości, nowy czeka w kolejce.
    const all = await repo.getAllEvents();
    await repo.markSynced(all.filter((e) => e.sessionUuid === 'sess-old').map((e) => e.uuid));

    const days = await queries.historyDays();
    expect(days.map((d) => d.state.sessionUuid)).toEqual(['sess-new', 'sess-old']);

    const groups = buildHistory(days, at(17, 0));
    expect(groups.editable[0]!.sync).toEqual({ label: 'W kolejce · 8 zdarzeń', pending: true });
    expect(groups.closed[0]!.sync).toEqual({ label: 'Wysłane', pending: false });
  });

  it('plakietka splasha: najświeższy dzień w oknie albo null', async () => {
    const { repo, queries } = harness();
    await writeDay(repo, 'sess-1', at(8, 0));

    expect(editableBadge(await queries.historyDays(), at(17, 0))).toBe('22 CZE — można poprawić');
    expect(
      editableBadge(await queries.historyDays(), at(16, 45) + CORRECTION_WINDOW_MS + 60_000),
    ).toBeNull();
  });

  it('odliczanie: godziny z zerem wiodącym minut, poniżej godziny same minuty', () => {
    expect(remainingLabel(23 * 3_600_000 + 4 * 60_000)).toBe('zostało 23 h 04 min');
    expect(remainingLabel(42 * 60_000)).toBe('zostało 42 min');
    expect(remainingLabel(30_000)).toBe('zostało 1 min'); // zaokrąglenie W GÓRĘ — nie „0 min"
  });
});
