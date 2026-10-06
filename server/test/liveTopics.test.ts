/**
 * Ninerdeck (serwer) - KTO DOSTAJE `changed` (4.0.0, `docs/kanal-klubu.md` §4; epik Z-E #246).
 *
 * Po każdym zapisie serwer ogłasza tematy bez treści, a odbiorców wyznacza reguła z §4:
 *  - `booking:<id>` i `calendar:<doba klubu>` - cały klub;
 *  - `aircraft:<id>` - posiadacze „Obserwowania samolotów";
 *  - `session:<uuid>`, `log:<doba UTC>`, `attention` - posiadacze „Podglądu klubu".
 * Testy idą prawdziwymi trasami i czytają sygnały z atrapy, która je ZAPISUJE - to ona
 * odpowiada na pytanie „kto dostał który temat". Doby kalendarza liczy strefa klubu
 * (świat testowy: Europe/Warsaw), więc termin przez północ klubu ma dwie doby.
 */

import { describe, expect, it } from 'vitest';

import { BookingClockJob } from '../src/application/common/commands/bookingClock.ts';
import { ClubSignals } from '../src/application/common/notify/clubSignals.ts';
import type { LiveAudience } from '../src/application/common/ports.ts';
import { PgBookingsRepo } from '../src/infrastructure/pg/common/bookingsRepo.ts';
import { PgClubSettingsRepo } from '../src/infrastructure/pg/common/clubSettingsRepo.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/common/sessionsProjection.ts';
import { FakeLiveSignals } from './fakeLiveSignals.ts';
import { silentNotifier } from './fakePush.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { bearer, grant, login, panelSession, type Harness } from './routeClients.ts';
import { ORG_A } from './testWorld.ts';

const D22 = Date.UTC(2026, 5, 22);
const D23 = Date.UTC(2026, 5, 23);
const H = 3_600_000;
const iso = (t: number): string => new Date(t).toISOString();

const CLUB: LiveAudience = { kind: 'club' };
const WATCHERS: LiveAudience = { kind: 'capability', capability: 'fleet.watch' };
const REVIEWERS: LiveAudience = { kind: 'capability', capability: 'panel.access' };

/** Temat → odbiorcy, z sygnałów `changed` zapisanych od ostatniego `clear()`. */
function received(live: FakeLiveSignals): Map<string, LiveAudience[]> {
  const out = new Map<string, LiveAudience[]>();
  for (const signal of live.signals) {
    if (signal.kind !== 'changed') continue;
    for (const t of signal.topics) out.set(t, [...(out.get(t) ?? []), ...signal.audiences]);
  }
  return out;
}

const topicsOf = (live: FakeLiveSignals, prefix: string): string[] =>
  [...received(live).keys()].filter((t) => t.startsWith(prefix)).sort();

const writer = (token: string) => ({ ...bearer(token), ...ADMIN_CSRF_HEADERS });

async function book(h: Harness, token: string, id: string, from: number, to: number) {
  const res = await h.app.inject({
    method: 'POST',
    url: '/bookings',
    headers: bearer(token),
    payload: { id, aircraftId: 'SP-AXA', startsAt: iso(from), endsAt: iso(to), operation: 'skoki' },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res;
}

/** KRZ jest jedyną osobą kroku „Mechanik" - rezerwacja PWI czeka na jego zgodę. */
async function withApprover(h: Harness): Promise<void> {
  await grant(h, 'KRZ', 'reservations.approve');
  const res = await h.app.inject({
    method: 'PUT',
    url: '/admin/api/approval-steps',
    headers: await panelSession(h.app, 'AKO'),
    payload: { steps: [{ label: 'Mechanik', memberIds: ['KRZ'] }] },
  });
  expect(res.statusCode, res.body).toBe(200);
}

/** Operacja PWI na SP-AXA 22 czerwca, zdana - opcjonalnie z przejęciem z rezerwacji. */
function flight(sessionUuid: string, reservationId: string | null = null) {
  const at = (h: number, m: number): number => D22 + (h * 60 + m) * 60_000;
  const event = (uuid: string, type: string, time: number, payload: Record<string, unknown>) => ({
    uuid: `${sessionUuid}-${uuid}`,
    sessionUuid,
    aircraftId: 'SP-AXA',
    picId: 'PWI',
    dualId: null,
    type,
    deviceTime: time,
    gpsTime: time,
    payload,
    schemaVersion: 1,
  });
  return [
    event('claim', 'session_claim', at(8, 0), { mode: 'free', ...(reservationId == null ? {} : { reservationId }) }),
    event('preflight', 'preflight_confirm', at(8, 0), {
      operation: 'skoki',
      departureIcao: 'EPKK',
      arrivalIcao: null,
      reading: { fuelL: 150, mh: 1234.5 },
      client: null,
      mhFormat: 'hhmm',
    }),
    event('start', 'engine_start', at(8, 12), {}),
    event('takeoff', 'takeoff', at(8, 25), { method: 'auto' }),
    event('landing', 'landing', at(9, 18), { method: 'auto' }),
    event('stop', 'engine_stop', at(9, 30), {}),
    event('close', 'day_close', at(9, 40), { finalReading: { fuelL: 120, mh: 1236.0 } }),
  ];
}

async function send(h: Harness, token: string, events: unknown[]) {
  const res = await h.app.inject({ method: 'POST', url: '/events', headers: bearer(token), payload: { events } });
  expect(res.statusCode, res.body).toBe(200);
}

describe('kto dostaje `changed` - kalendarz i rezerwacje', () => {
  it('rezerwacja: termin i doba kalendarza całemu klubowi, karta samolotu obserwującym', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    h.live.clear();

    await book(h, pwi, 'rez-1', D23 + 8 * H, D23 + 10 * H);
    const got = received(h.live);
    expect(got.get('booking:rez-1')).toEqual([CLUB]);
    expect(got.get('calendar:2026-06-23')).toEqual([CLUB]);
    expect(got.get('aircraft:SP-AXA')).toEqual([WATCHERS]);
    // Dziennik i „Do sprawdzenia" mówią o LOTACH - rezerwacja ich nie rusza.
    expect(topicsOf(h.live, 'log:')).toEqual([]);
    expect(got.has('attention')).toBe(false);
  });

  it('przesunięcie odświeża OBIE doby, odwołanie - dobę terminu', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    await book(h, pwi, 'rez-1', D23 + 8 * H, D23 + 10 * H);

    h.live.clear();
    const moved = await h.app.inject({
      method: 'PATCH',
      url: '/bookings/rez-1',
      headers: bearer(pwi),
      payload: { startsAt: iso(D23 + 2 * 86_400_000 + 8 * H), endsAt: iso(D23 + 2 * 86_400_000 + 10 * H) },
    });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(topicsOf(h.live, 'calendar:')).toEqual(['calendar:2026-06-23', 'calendar:2026-06-25']);

    h.live.clear();
    const cancelled = await h.app.inject({ method: 'DELETE', url: '/bookings/rez-1', headers: bearer(pwi), payload: {} });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(topicsOf(h.live, 'calendar:')).toEqual(['calendar:2026-06-25']);
    expect(received(h.live).get('booking:rez-1')).toEqual([CLUB]);
  });

  it('wyłączenie z użytku z panelu: doby kalendarza i karta samolotu', async () => {
    const h = await testHarness();
    const ako = await login(h.app, 'AKO');
    h.live.clear();

    const res = await h.app.inject({
      method: 'POST',
      url: '/admin/api/bookings/blocks',
      headers: writer(ako),
      payload: {
        id: 'blk-1',
        aircraftId: 'SP-AXA',
        startsAt: iso(D23 + 6 * H),
        endsAt: iso(D23 + 30 * H),
        blockReason: 'maintenance',
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(topicsOf(h.live, 'calendar:')).toEqual(['calendar:2026-06-23', 'calendar:2026-06-24']);
    expect(received(h.live).get('aircraft:SP-AXA')).toEqual([WATCHERS]);
  });

  it('decyzja o zgodzie i zmiana ścieżki przerysowują kartę czekającej rezerwacji', async () => {
    const h = await testHarness();
    await withApprover(h);
    const pwi = await login(h.app, 'PWI');
    const made = await book(h, pwi, 'rez-1', D23 + 8 * H, D23 + 10 * H);
    expect(made.json().status).toBe('pending');

    // Zmiana ścieżki: krok dołożony PRZED bieżącym przekierowuje sprawę.
    h.live.clear();
    await grant(h, 'JSE', 'reservations.approve');
    const steps = await h.app.inject({
      method: 'PUT',
      url: '/admin/api/approval-steps',
      headers: await panelSession(h.app, 'AKO'),
      payload: { steps: [{ label: 'Instruktor', memberIds: ['JSE'] }, { label: 'Mechanik', memberIds: ['KRZ'] }] },
    });
    expect(steps.statusCode, steps.body).toBe(200);
    expect(received(h.live).get('booking:rez-1')).toEqual([CLUB]);

    // Decyzja pierwszego kroku.
    h.live.clear();
    const jse = await login(h.app, 'JSE');
    const decided = await h.app.inject({
      method: 'POST',
      url: '/bookings/rez-1/decision',
      headers: bearer(jse),
      payload: { decision: 'approved' },
    });
    expect(decided.statusCode, decided.body).toBe(200);
    expect(received(h.live).get('booking:rez-1')).toEqual([CLUB]);
    expect(received(h.live).get('calendar:2026-06-23')).toEqual([CLUB]);
  });

  it('zadanie okresowe: wygaszona rezerwacja znika z kalendarza na żywo', async () => {
    const h = await testHarness();
    await withApprover(h);
    const pwi = await login(h.app, 'PWI');
    await book(h, pwi, 'rez-1', D23 + 8 * H, D23 + 10 * H);

    const live = new FakeLiveSignals();
    const job = new BookingClockJob(
      h.db,
      new PgBookingsRepo(),
      new PgSessionsProjection(),
      { now: () => new Date(D23 + 8 * H + 60_000) },
      silentNotifier(h.db),
      new ClubSignals(live, h.db, new PgClubSettingsRepo(), new PgSessionsProjection()),
    );
    expect((await job.run()).expired).toBe(1);
    expect(received(live).get('booking:rez-1')).toEqual([CLUB]);
    expect(received(live).get('calendar:2026-06-23')).toEqual([CLUB]);
  });
});

describe('kto dostaje `changed` - dziennik, karta samolotu, „Do sprawdzenia"', () => {
  it('przyjęcie lotu: dziennik i „Do sprawdzenia" podglądowi klubu, karta samolotu obserwującym', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    h.live.clear();

    await send(h, pwi, flight('sess-1'));
    const got = received(h.live);
    expect(got.get('session:sess-1')).toEqual([REVIEWERS]);
    expect(got.get('log:2026-06-22')).toEqual([REVIEWERS]);
    expect(got.get('attention')).toEqual([REVIEWERS]);
    expect(got.get('aircraft:SP-AXA')).toEqual([WATCHERS]);
    // Lot nie jest terminem kalendarza - kalendarz odświeża rezerwacja, nie operacja.
    expect(topicsOf(h.live, 'calendar:')).toEqual([]);

    // Ponowiona paczka (słabe łącze) niczego nie zmienia - i niczego nie ogłasza.
    h.live.clear();
    await send(h, pwi, flight('sess-1'));
    expect(h.live.signals).toEqual([]);
  });

  it('przejęcie z rezerwacji: zrealizowany termin odświeża kalendarz', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    await book(h, pwi, 'rez-1', D22 + 8 * H, D22 + 10 * H);
    h.live.clear();

    await send(h, pwi, flight('sess-1', 'rez-1'));
    expect(received(h.live).get('booking:rez-1')).toEqual([CLUB]);
    expect(received(h.live).get('calendar:2026-06-22')).toEqual([CLUB]);
  });

  it('korekta z panelu: operacja, doba dziennika i „Do sprawdzenia"', async () => {
    const h = await testHarness();
    const pwi = await login(h.app, 'PWI');
    await send(h, pwi, flight('sess-1'));
    // Poprawiona godzina nie może być z przyszłości - panel poprawia lot po fakcie
    // (logowanie PO przesunięciu zegara: token żyje godzinę).
    h.clock.advance(4 * H);
    const ako = await login(h.app, 'AKO');
    h.live.clear();

    const res = await h.app.inject({
      method: 'POST',
      url: '/admin/api/sessions/sess-1/corrections',
      headers: writer(ako),
      payload: {
        targetUuid: 'sess-1-stop',
        action: 'retime',
        newTime: D22 + (9 * 60 + 35) * 60_000,
        reason: 'Godzinę potwierdza książka samolotu.',
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const got = received(h.live);
    expect(got.get('session:sess-1')).toEqual([REVIEWERS]);
    expect(got.get('log:2026-06-22')).toEqual([REVIEWERS]);
    expect(got.get('attention')).toEqual([REVIEWERS]);
    expect(got.get('aircraft:SP-AXA')).toEqual([WATCHERS]);
  });

  it('odczyt z panelu i zmiana floty: wyłącznie karta samolotu', async () => {
    const h = await testHarness();
    const ako = await login(h.app, 'AKO');
    h.live.clear();

    const reading = await h.app.inject({
      method: 'POST',
      url: '/admin/api/fleet/SP-AXA/readings',
      headers: writer(ako),
      payload: { mh: 1240, fuelL: 120, oilL: null, note: 'Po remoncie.' },
    });
    expect(reading.statusCode, reading.body).toBe(201);
    expect([...received(h.live).entries()]).toEqual([['aircraft:SP-AXA', [WATCHERS]]]);

    h.live.clear();
    const patched = await h.app.inject({
      method: 'PATCH',
      url: '/admin/api/fleet/SP-AXA',
      headers: writer(ako),
      payload: { type: 'Cessna 172N' },
    });
    expect(patched.statusCode, patched.body).toBe(200);
    expect([...received(h.live).entries()]).toEqual([['aircraft:SP-AXA', [WATCHERS]]]);
  });
});

describe('kto dostaje `changed` - zlecenia', () => {
  it('„Odczytane" rusza wyłącznie zlecenie; zmiana zlecenia - także jego termin', async () => {
    const h = await testHarness();
    const ako = await login(h.app, 'AKO');
    const created = await h.app.inject({
      method: 'POST',
      url: '/orders',
      headers: bearer(ako),
      payload: {
        id: 'zl-1',
        aircraftId: 'SP-AXA',
        startsAt: iso(D23 + 8 * H),
        endsAt: iso(D23 + 10 * H),
        operation: 'przelot',
        note: 'przelot na przegląd',
        seats: { pic: 'sought', dual: 'none' },
        audience: { kind: 'per_seat', pic: { pilotIds: ['PWI'], groupIds: [] }, dual: null },
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const bookingId = created.json().order.bookingId as string | undefined;

    const pwi = await login(h.app, 'PWI');
    h.live.clear();
    expect((await h.app.inject({ method: 'POST', url: '/orders/zl-1/seen', headers: bearer(pwi) })).statusCode).toBe(204);
    expect([...received(h.live).keys()].sort()).toEqual(['order:zl-1', 'orders']);

    h.live.clear();
    const edited = await h.app.inject({
      method: 'PATCH',
      url: '/orders/zl-1',
      headers: bearer(ako),
      payload: { startsAt: iso(D23 + 32 * H), endsAt: iso(D23 + 34 * H) },
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(topicsOf(h.live, 'calendar:')).toEqual(['calendar:2026-06-23', 'calendar:2026-06-24']);
    expect(received(h.live).get('aircraft:SP-AXA')).toEqual([WATCHERS]);
    if (bookingId != null) expect(received(h.live).get(`booking:${bookingId}`)).toEqual([CLUB]);
  });
});

describe('doby kalendarza i operacje bez wiersza', () => {
  const signals = async () => {
    const h = await testHarness();
    const live = new FakeLiveSignals();
    return { live, club: new ClubSignals(live, h.db, new PgClubSettingsRepo(), new PgSessionsProjection()) };
  };

  it('termin przez północ KLUBU ma dwie doby; zmiana maszyny odświeża obie karty', async () => {
    const { live, club } = await signals();
    // 21:00-23:30 UTC = 23:00-01:30 w Warszawie.
    await club.booking(ORG_A, { id: 'rez-n', aircraftId: 'SP-AXB', startsAt: D23 + 21 * H, endsAt: D23 + 23.5 * H }, {
      aircraftId: 'SP-AXA',
      startsAt: D23 + 21 * H,
      endsAt: D23 + 23.5 * H,
    });
    expect(topicsOf(live, 'calendar:')).toEqual(['calendar:2026-06-23', 'calendar:2026-06-24']);
    expect(topicsOf(live, 'aircraft:')).toEqual(['aircraft:SP-AXA', 'aircraft:SP-AXB']);
  });

  it('długie wyłączenie z użytku ogłasza najwyżej dwa miesiące dób', async () => {
    const { live, club } = await signals();
    await club.booking(ORG_A, { id: 'blk', aircraftId: 'SP-AXA', startsAt: D23, endsAt: D23 + 100 * 86_400_000 });
    expect(topicsOf(live, 'calendar:')).toHaveLength(62);
  });

  it('operacja, której projekcja nie zna, dostaje sam temat operacji', async () => {
    const { live, club } = await signals();
    await club.operations(ORG_A, ['nieznana']);
    expect([...received(live).entries()]).toEqual([['session:nieznana', [REVIEWERS]]]);
  });
});
