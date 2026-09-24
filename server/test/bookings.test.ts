/**
 * Ninerdeck (serwer) - REZERWACJE: trasy telefonu i panelu (milestone 3.0.0, issue #158;
 * `docs/rezerwacje.md` §2, §4, §5).
 *
 * Pod obserwacją:
 *  1. **nakładanie odbija BAZA**, a trasa mówi CO stoi w tym czasie - samo „zajęte"
 *     kazałoby pilotowi zgadywać, czy to przegląd, czy kolega;
 *  2. **zetknięcie co do minuty przechodzi** (zakres półotwarty) - ta sama reguła, co
 *     przy operacjach: 10:00-12:00 nie koliduje z 08:00-10:00;
 *  3. **odwołanie ZWALNIA termin natychmiast**, a wiersz zostaje w zapisie;
 *  4. **`POST` jest idempotentny po uuidzie klienta** - to jest warunek pracy w terenie:
 *     telefon ponawia przy zerwanym łączu, a ponowienie nie ma prawa dać drugiej soboty;
 *  5. **cudzej rezerwacji nie da się tknąć**, a odwołanie jej z panelu WYMAGA powodu;
 *  6. **wyłączenie z użytku blokuje rezerwacje**, także maszyny stojącej w serwisie;
 *  7. **`session_claim` z `reservationId` przestawia rezerwację na `fulfilled`** - jedyne
 *     zetknięcie rejestru z rezerwacją i tylko w jedną stronę;
 *  8. **slot zwalnia się sam po godzinie**, gdy nikt po maszynę nie przyszedł.
 *
 * Wyścigu dwóch rezerwacji NIE DA SIĘ tu odegrać (PGlite: jedno połączenie i mutex -
 * ta uwaga stoi też w `adminExports.test.ts`). Sprawdzamy, że ograniczenie ISTNIEJE
 * i odbija sekwencyjnie; o równoległość dba baza produkcyjna - po to jest ograniczenie
 * zamiast sprawdzenia w kodzie.
 */

import { describe, expect, it } from 'vitest';

import { BookingReleaseJob } from '../src/application/common/commands/bookingRelease.ts';
import { PgBookingsRepo } from '../src/infrastructure/pg/common/bookingsRepo.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/common/sessionsProjection.ts';
import { silentNotifier } from './fakePush.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

const login = (app: App, who: string): Promise<string> =>
  app
    .inject({ method: 'POST', url: '/auth/google', payload: { idToken: googleTokenFor(who) } })
    .then((res) => res.json().token as string);

async function panelCookie(app: App, who: string): Promise<Record<string, string>> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/auth/login',
    headers: ADMIN_CSRF_HEADERS,
    payload: { idToken: googleTokenFor(who) },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'ninerdeck_admin')!;
  return { cookie: `ninerdeck_admin=${cookie.value}`, ...ADMIN_CSRF_HEADERS };
}

/**
 * Okno testów stoi W PRZYSZŁOŚCI względem zegara, bo rezerwacja opisuje ZAMIAR -
 * a termin, który minął, jest twardo odrzucany (`booking_in_past`).
 */
const TERAZ = Date.UTC(2026, 5, 22, 8, 0, 0);
const JUTRO = TERAZ + 86_400_000;
const H = 3_600_000;
const iso = (t: number): string => new Date(t).toISOString();

let seq = 0;
const nextId = (): string => `b-${(seq += 1)}`;

const create = (
  app: App,
  token: string,
  from: number,
  to: number,
  over: Record<string, unknown> = {},
) =>
  app.inject({
    method: 'POST',
    url: '/bookings',
    headers: bearer(token),
    payload: {
      id: nextId(),
      aircraftId: 'SP-AXA',
      startsAt: iso(from),
      endsAt: iso(to),
      operation: 'skoki',
      ...over,
    },
  });

const calendar = (app: App, token: string, days = 3) =>
  app.inject({
    method: 'GET',
    url: `/bookings?from=${iso(JUTRO - H)}&to=${iso(JUTRO + days * 86_400_000)}`,
    headers: bearer(token),
  });

describe('rezerwacje: zapis z telefonu', () => {
  it('bez tokenu → 401, a rezerwacja wraca na siatce kalendarza', async () => {
    const { app } = await testHarness();
    expect((await app.inject({ method: 'GET', url: '/bookings?from=x&to=y' })).statusCode).toBe(401);

    const ako = await login(app, 'AKO');
    const made = await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H);
    expect(made.statusCode, made.body).toBe(201);
    expect(made.json().status).toBe('confirmed');
    expect(made.json().pilotId).toBe('AKO');

    const view = await calendar(app, ako);
    expect(view.statusCode).toBe(200);
    expect(view.json().bookings).toHaveLength(1);
    // Siatka dób przychodzi zawsze - to ona odpowiada na pytanie o strefę klubu,
    // a telefon liczy z niej położenie rezerwacji bez ani jednej konwersji stref.
    expect(view.json().timezone).toBe('Europe/Warsaw');
    expect(view.json().days.length).toBeGreaterThan(2);
    expect(Date.parse(view.json().days[1].startsAt)).toBe(
      Date.parse(view.json().days[0].endsAt),
    );
  });

  it('CUDZA zajętość niesie tylko to, co ekran z niej czyta', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const pwi = await login(app, 'PWI');

    // Rezerwacja z KOMPLETEM pól: trasa, drugi pilot, plan i notatka - czyli
    // dokładnie to, czego nie ma prawa zobaczyć kolega z klubu (przegląd W7).
    const made = await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H, {
      operation: 'przelot',
      fromIcao: 'EPKK',
      toIcao: 'EPRJ',
      plannedAirMin: 90,
      plannedFuelL: 120,
      note: 'Odbiór części w Jasionce',
    });
    expect(made.statusCode, made.body).toBe(201);

    // WŁAŚCICIEL widzi swoje w całości - to jego plan i jego karta rezerwacji.
    const moje = (await calendar(app, ako)).json().bookings[0];
    expect(moje.note).toBe('Odbiór części w Jasionce');
    expect(moje.fromIcao).toBe('EPKK');
    expect(moje.plannedFuelL).toBe(120);

    // KOLEGA z tego samego klubu dostaje pięć rzeczy, których używa oś floty,
    // karta samolotu i ostrzeżenie o kolizji - i ani pola więcej.
    const cudze = (await calendar(app, pwi)).json().bookings[0];
    expect(Object.keys(cudze).sort()).toEqual([
      'aircraftId',
      'blockReason',
      'endsAt',
      'id',
      'kind',
      'pilotId',
      'startsAt',
      'status',
    ]);

    // To samo na karcie rezerwacji: cudzy termin otwarty z osi mówi, KTO i KIEDY.
    const karta = await app.inject({
      url: `/bookings/${made.json().id}`,
      headers: bearer(pwi),
    });
    expect(karta.statusCode).toBe(200);
    expect(karta.json().booking.note).toBeUndefined();
    expect(karta.json().booking.pilotId).toBe('AKO');
  });

  it('NAKŁADKA odbija się i mówi, CO stoi w tym czasie', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const pwi = await login(app, 'PWI');

    await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H);
    const kolizja = await create(app, pwi, JUTRO + 9 * H, JUTRO + 11 * H);

    expect(kolizja.statusCode).toBe(409);
    expect(kolizja.json().error).toBe('slot_taken');
    // Ekran ma napisać, kto trzyma termin - bez tego pilot nie wie, czy prosić kolegę,
    // czy czekać na wyjście maszyny z przeglądu.
    expect(kolizja.json().taken.pilotId).toBe('AKO');
    expect(kolizja.json().taken.kind).toBe('flight');
    // WIEK kolidującej zajętości stoi OBOK niej: „weszła 3 minuty temu" znaczy co
    // innego niż „stoi od tygodnia", a na siatce kalendarza ta liczba nie znaczy nic,
    // więc do wspólnego kształtu zajętości nie wchodzi.
    expect(Number.isFinite(Date.parse(kolizja.json().takenAt))).toBe(true);
    // …ale nie mówi o niej NIC ponad to: notatka i plan cudzego lotu nie są
    // odpowiedzią na pytanie „czemu nie mogę zapisać" (W7).
    expect(kolizja.json().taken.note).toBeUndefined();
    expect(kolizja.json().taken.plannedFuelL).toBeUndefined();
  });

  it('ZETKNIĘCIE CO DO MINUTY PRZECHODZI', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const pwi = await login(app, 'PWI');

    await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H);
    const druga = await create(app, pwi, JUTRO + 10 * H, JUTRO + 12 * H);
    expect(druga.statusCode, druga.body).toBe(201);
  });

  it('POWTÓRZONY ZAPIS wraca TYM SAMYM terminem, nie drugim', async () => {
    // Warunek pracy w terenie: kolejka wysyła do skutku, więc „do skutku" musi być
    // bezpieczne. Uuid nadaje klient i to on jest całą idempotencją.
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const payload = {
      id: 'stala-rezerwacja',
      aircraftId: 'SP-AXA',
      startsAt: iso(JUTRO + 8 * H),
      endsAt: iso(JUTRO + 10 * H),
      operation: 'skoki',
    };
    const pierwszy = await app.inject({ method: 'POST', url: '/bookings', headers: bearer(ako), payload });
    const drugi = await app.inject({ method: 'POST', url: '/bookings', headers: bearer(ako), payload });

    expect(pierwszy.statusCode).toBe(201);
    // 200, nie 201: nic właśnie nie powstało i odpowiedź nie ma prawa tego udawać.
    expect(drugi.statusCode).toBe(200);
    expect(drugi.json().id).toBe(pierwszy.json().id);
    expect((await calendar(app, ako)).json().bookings).toHaveLength(1);
  });

  it('ODWOŁANIE zwalnia termin NATYCHMIAST, a wiersz zostaje w zapisie', async () => {
    const { app, db } = await testHarness();
    const ako = await login(app, 'AKO');
    const pwi = await login(app, 'PWI');

    const made = await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H);
    const id = made.json().id as string;

    const cancelled = await app.inject({
      method: 'DELETE',
      url: `/bookings/${id}`,
      headers: bearer(ako),
      payload: {},
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe('cancelled');

    // Ten sam termin wchodzi od razu…
    const nowa = await create(app, pwi, JUTRO + 8 * H, JUTRO + 10 * H);
    expect(nowa.statusCode, nowa.body).toBe(201);
    // …a odwołany wiersz NIE ZNIKA z bazy: rejestr planów też jest zapisem.
    const { rows } = await db.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [id]);
    expect(rows[0]!.status).toBe('cancelled');
  });

  it('CUDZEJ rezerwacji pilot nie tknie - ani przesunie, ani odwoła', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const pwi = await login(app, 'PWI');

    const made = await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H);
    const id = made.json().id as string;

    const przesuniecie = await app.inject({
      method: 'PATCH',
      url: `/bookings/${id}`,
      headers: bearer(pwi),
      payload: { endsAt: iso(JUTRO + 14 * H) },
    });
    expect(przesuniecie.statusCode).toBe(403);
    expect(przesuniecie.json().error).toBe('not_your_booking');

    const odwolanie = await app.inject({
      method: 'DELETE',
      url: `/bookings/${id}`,
      headers: bearer(pwi),
      payload: {},
    });
    expect(odwolanie.statusCode).toBe(403);
  });

  it('WŁASNĄ wolno przesunąć, a przesunięcie w nakładkę odbija się jak zapis', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const pwi = await login(app, 'PWI');

    const moja = await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H);
    await create(app, pwi, JUTRO + 12 * H, JUTRO + 14 * H);

    const ok = await app.inject({
      method: 'PATCH',
      url: `/bookings/${moja.json().id}`,
      headers: bearer(ako),
      payload: { endsAt: iso(JUTRO + 11 * H), note: 'przedłużam' },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().note).toBe('przedłużam');

    const wKolizje = await app.inject({
      method: 'PATCH',
      url: `/bookings/${moja.json().id}`,
      headers: bearer(ako),
      payload: { endsAt: iso(JUTRO + 13 * H) },
    });
    expect(wKolizje.statusCode).toBe(409);
    expect(wKolizje.json().taken.pilotId).toBe('PWI');
  });

  it('TERMIN, KTÓRY MINĄŁ, i maszyna poza służbą - dwie różne odmowy', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');

    const wstecz = await create(app, ako, TERAZ - 4 * H, TERAZ - 2 * H);
    expect(wstecz.statusCode).toBe(400);
    expect(wstecz.json().error).toBe('booking_in_past');

    // SP-KWA jest w świecie testowym wyłączona ze służby.
    const wylaczona = await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H, { aircraftId: 'SP-KWA' });
    expect(wylaczona.statusCode).toBe(409);
    expect(wylaczona.json().error).toBe('aircraft_disabled');

    const nieznana = await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H, { aircraftId: 'SP-NIC' });
    expect(nieznana.statusCode).toBe(404);
    expect(nieznana.json().error).toBe('aircraft_not_found');
  });
});

describe('rezerwacje: panel', () => {
  it('rezerwacja ZA PILOTA zostawia ślad w dzienniku audytu', async () => {
    const { app, db } = await testHarness();
    const session = await panelCookie(app, 'AKO');

    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/bookings',
      headers: session,
      payload: {
        id: nextId(),
        aircraftId: 'SP-AXA',
        pilotId: 'PWI',
        startsAt: iso(JUTRO + 8 * H),
        endsAt: iso(JUTRO + 10 * H),
        operation: 'skoki',
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().pilotId).toBe('PWI');
    expect(res.json().createdBy).toBe('AKO');

    const { rows } = await db.query<{ action: string; details: Record<string, unknown> }>(
      `SELECT action, details FROM admin_audit WHERE action = 'booking.create'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details.pilotId).toBe('PWI');
  });

  it('WYŁĄCZENIE Z UŻYTKU blokuje rezerwacje - także maszyny stojącej w serwisie', async () => {
    const { app } = await testHarness();
    const session = await panelCookie(app, 'AKO');
    const ako = await login(app, 'AKO');

    const blokada = await app.inject({
      method: 'POST',
      url: '/admin/api/bookings/blocks',
      headers: session,
      payload: {
        id: nextId(),
        aircraftId: 'SP-KWA',
        startsAt: iso(JUTRO),
        endsAt: iso(JUTRO + 2 * 86_400_000),
        blockReason: 'maintenance',
      },
    });
    // SP-KWA jest wyłączona ze służby - i właśnie takiej maszynie planuje się przegląd.
    expect(blokada.statusCode, blokada.body).toBe(201);

    const naSluzbie = await app.inject({
      method: 'POST',
      url: '/admin/api/bookings/blocks',
      headers: session,
      payload: {
        id: nextId(),
        aircraftId: 'SP-AXA',
        startsAt: iso(JUTRO + 6 * H),
        endsAt: iso(JUTRO + 20 * H),
        blockReason: 'defect',
      },
    });
    expect(naSluzbie.statusCode, naSluzbie.body).toBe(201);

    const proba = await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H);
    expect(proba.statusCode).toBe(409);
    expect(proba.json().taken.kind).toBe('block');
    expect(proba.json().taken.blockReason).toBe('defect');
  });

  it('ODWOŁANIE CUDZEJ wymaga POWODU, a pilot czyta go w aplikacji', async () => {
    const { app } = await testHarness();
    const session = await panelCookie(app, 'AKO');
    const pwi = await login(app, 'PWI');

    const made = await create(app, pwi, JUTRO + 8 * H, JUTRO + 10 * H);
    const id = made.json().id as string;

    const bezPowodu = await app.inject({
      method: 'POST',
      url: `/admin/api/bookings/${id}/cancel`,
      headers: session,
      payload: {},
    });
    expect(bezPowodu.statusCode).toBe(400);
    expect(bezPowodu.json().error).toBe('reason_required');

    const zPowodem = await app.inject({
      method: 'POST',
      url: `/admin/api/bookings/${id}/cancel`,
      headers: session,
      payload: { reason: 'przegląd 100 h wchodzi na tę sobotę' },
    });
    expect(zPowodem.statusCode, zPowodem.body).toBe(200);
    expect(zPowodem.json().closeReason).toBe('przegląd 100 h wchodzi na tę sobotę');
  });

  it('PILOT nie wejdzie na trasy panelu', async () => {
    const { app } = await testHarness();
    // PWI jest zwykłym pilotem - nie ma nawet wejścia do panelu.
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/auth/login',
      headers: ADMIN_CSRF_HEADERS,
      payload: { idToken: googleTokenFor('PWI') },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('rezerwacje: zetknięcie z rejestrem i z czasem', () => {
  it('`session_claim` z `reservationId` przestawia rezerwację na `fulfilled`', async () => {
    const { app, db } = await testHarness();
    const ako = await login(app, 'AKO');
    const made = await create(app, ako, JUTRO + 8 * H, JUTRO + 10 * H);
    const id = made.json().id as string;

    const at = JUTRO + 8 * H;
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: bearer(ako),
      payload: {
        events: [
          {
            uuid: 'ev-claim-rez',
            sessionUuid: 'S-REZ',
            aircraftId: 'SP-AXA',
            picId: 'AKO',
            dualId: null,
            type: 'session_claim',
            deviceTime: at,
            gpsTime: at,
            payload: { mode: 'free', reservationId: id },
            schemaVersion: 1,
          },
        ],
      },
    });
    expect(res.statusCode, res.body).toBe(200);

    const { rows } = await db.query<{ status: string; session_uuid: string | null }>(
      'SELECT status, session_uuid FROM bookings WHERE id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('fulfilled');
    expect(rows[0]!.session_uuid).toBe('S-REZ');
  });

  it('NIEZNANA rezerwacja w `session_claim` NIE odrzuca paczki', async () => {
    // Rezerwacja nie jest warunkiem lotu: pilot mógł wejść w lot z rezerwacji odwołanej
    // w międzyczasie przez administratora, a zapis lotu jest ważniejszy niż porządek
    // w kalendarzu.
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const at = JUTRO + 8 * H;
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: bearer(ako),
      payload: {
        events: [
          {
            uuid: 'ev-claim-widmo',
            sessionUuid: 'S-WIDMO',
            aircraftId: 'SP-AXA',
            picId: 'AKO',
            dualId: null,
            type: 'session_claim',
            deviceTime: at,
            gpsTime: at,
            payload: { mode: 'free', reservationId: 'nie-ma-takiej' },
            schemaVersion: 1,
          },
        ],
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().accepted).toBe(1);
  });

  it('SLOT ZWALNIA SIĘ SAM po godzinie bez przejęcia maszyny', async () => {
    const { app, db } = await testHarness();
    const ako = await login(app, 'AKO');

    // Rezerwacja na TERAZ: zapis przechodzi, bo reguła patrzy na KONIEC terminu.
    const start = TERAZ - 10 * 60_000;
    const made = await create(app, ako, start, start + 4 * H);
    expect(made.statusCode, made.body).toBe(201);
    const id = made.json().id as string;

    const job = (now: Date) =>
      new BookingReleaseJob(
        db,
        new PgBookingsRepo(),
        new PgSessionsProjection(),
        { now: () => now },
        silentNotifier(db),
      ).run();

    // Pół godziny po starcie pilot jest po prostu spóźniony.
    const wczesnie = await job(new Date(start + 30 * 60_000));
    expect(wczesnie.released).toBe(0);

    const poGodzinie = await job(new Date(start + 70 * 60_000));
    expect(poGodzinie.released).toBe(1);

    const { rows } = await db.query<{ status: string; close_reason: string | null }>(
      'SELECT status, close_reason FROM bookings WHERE id = $1',
      [id],
    );
    // `released`, nie `cancelled`: nikt tego nie odwołał, tylko upłynął czas…
    expect(rows[0]!.status).toBe('released');
    // …więc nie ma też powodu - `close_reason` niesie zdanie CZŁOWIEKA.
    expect(rows[0]!.close_reason).toBeNull();
  });

  it('MASZYNA WZIĘTA w terminie NIE zwalnia rezerwacji', async () => {
    const { app, db } = await testHarness();
    const ako = await login(app, 'AKO');

    const start = TERAZ - 10 * 60_000;
    const made = await create(app, ako, start, start + 4 * H);
    const id = made.json().id as string;

    // Pilot przyszedł kwadrans PRZED czasem - operacja zahacza o okno rezerwacji.
    await app.inject({
      method: 'POST',
      url: '/events',
      headers: bearer(ako),
      payload: {
        events: [
          {
            uuid: 'ev-claim-wziete',
            sessionUuid: 'S-WZIETE',
            aircraftId: 'SP-AXA',
            picId: 'AKO',
            dualId: null,
            type: 'session_claim',
            deviceTime: start - 15 * 60_000,
            gpsTime: start - 15 * 60_000,
            payload: { mode: 'free' },
            schemaVersion: 1,
          },
        ],
      },
    });

    const run = await new BookingReleaseJob(
      db,
      new PgBookingsRepo(),
      new PgSessionsProjection(),
      { now: () => new Date(start + 70 * 60_000) },
      silentNotifier(db),
    ).run();
    expect(run.released).toBe(0);

    const { rows } = await db.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [id]);
    expect(rows[0]!.status).toBe('confirmed');
  });
});

describe('rezerwacje: sugestie slotów', () => {
  const pytaj = (app: App, token: string, minutes: number, over: Record<string, string> = {}) =>
    app.inject({
      method: 'GET',
      url:
        '/bookings/suggestions?' +
        new URLSearchParams({
          aircraftId: 'SP-AXA',
          day: iso(JUTRO),
          minutes: String(minutes),
          ...over,
        }).toString(),
      headers: bearer(token),
    });

  it('PUSTY DZIEŃ daje propozycje i mówi, skąd wzięło się okno', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');

    const res = await pytaj(app, ako, 120);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().suggestions.length).toBeGreaterThan(0);
    // Świat testowy nie ma lotniska macierzystego, więc okno jest DOMYŚLNE - i trasa
    // to mówi, zamiast udawać rachunek z efemeryd, którego nie było.
    expect(res.json().window.basis).toBe('default');
    expect(res.json().day.date).toBe(iso(JUTRO).slice(0, 10));
  });

  it('SUGESTIA PRZYLEGA do cudzej rezerwacji, a nie stoi na środku pustego rzędu', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');
    const pwi = await login(app, 'PWI');

    // Ktoś trzyma maszynę przez dwie godziny. Propozycja dla kolejnego pilota ma
    // PRZYLEGAĆ do tej rezerwacji, a nie stanąć gdziekolwiek w wolnym dniu.
    const zajete = { from: JUTRO + 8 * H, to: JUTRO + 10 * H };
    await create(app, pwi, zajete.from, zajete.to);

    const res = await pytaj(app, ako, 120);
    const pierwsza = res.json().suggestions[0];
    // Dokleja się od strony, po której zostaje dość miejsca: okno doby lotnej kończy
    // się niedługo po tej rezerwacji, więc dwie godziny mieszczą się tylko PRZED nią.
    expect(Date.parse(pierwsza.endsAt)).toBe(zajete.from);
    expect(pierwsza.reason).toBe('next-to-booking');
    expect(pierwsza.gapAfterMin).toBe(0);
  });

  it('WYŁĄCZENIE Z UŻYTKU liczy się jak każda inna zajętość', async () => {
    const { app } = await testHarness();
    const session = await panelCookie(app, 'AKO');
    const ako = await login(app, 'AKO');

    const blok = await app.inject({
      method: 'POST',
      url: '/admin/api/bookings/blocks',
      headers: session,
      payload: {
        id: nextId(),
        aircraftId: 'SP-AXA',
        // Od poprzedniego wieczora, bo okno doby lotnej zaczyna się o szóstej rano
        // CZASU KLUBU, czyli o 04:00 UTC - na długo przed `JUTRO`.
        startsAt: iso(JUTRO - 12 * H),
        endsAt: iso(JUTRO + 2 * 86_400_000),
        blockReason: 'maintenance',
      },
    });

    expect(blok.statusCode, blok.body).toBe(201);

    // Maszyna stoi w serwisie całą dobę - sugestii z tego dnia być nie może, a pusta
    // lista NIE JEST błędem.
    const res = await pytaj(app, ako, 60);
    expect(res.statusCode).toBe(200);
    expect(res.json().suggestions).toEqual([]);
  });

  it('PORA DNIA przesuwa propozycje, gdy pilot ją poda', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');

    // Pora musi leżeć W OKNIE doby lotnej - prośba o godzinę po zmroku nie ma czego
    // przesunąć, bo tam i tak nie ma kandydatów.
    const bez = await pytaj(app, ako, 60);
    const z = await pytaj(app, ako, 60, { preferredAt: iso(JUTRO + 6 * H) });
    expect(Date.parse(z.json().suggestions[0].startsAt)).toBeGreaterThan(
      Date.parse(bez.json().suggestions[0].startsAt),
    );
  });

  it('żądanie bez sensu odbija się 400, a nie pustą listą', async () => {
    const { app } = await testHarness();
    const ako = await login(app, 'AKO');

    expect((await pytaj(app, ako, 0)).statusCode).toBe(400);
    expect((await pytaj(app, ako, 60, { day: 'wczoraj' })).statusCode).toBe(400);
  });

  it('bez tokenu → 401', async () => {
    const { app } = await testHarness();
    const res = await app.inject({
      method: 'GET',
      url: '/bookings/suggestions?aircraftId=SP-AXA&day=' + iso(JUTRO) + '&minutes=60',
    });
    expect(res.statusCode).toBe(401);
  });
});
