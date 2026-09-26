/**
 * Ninerdeck (serwer) - ŚCIEŻKA AKCEPTACJI END-TO-END (milestone 3.1.0, issue #164;
 * `docs/rezerwacje.md` §11, §12).
 *
 * Domena ma własny komplet (`approvals.test.ts`); tutaj sprawdzamy to, czego czysta
 * funkcja z definicji nie dowiedzie - że ścieżka ułożona w PANELU rozstrzyga rezerwację
 * złożoną z TELEFONU, że decyzja zmienia wiersz i budzi właściwe osoby, i że nic z tego
 * nie przecieka do drugiego klubu.
 *
 * Pod obserwacją:
 *  1. **klub bez ścieżki pracuje dokładnie jak w 3.0.0** - `confirmed` od razu;
 *  2. **`pending` TRZYMA SLOT** - inaczej „czekam na akceptację" znaczyłoby „ktoś mi to
 *     zaraz zajmie";
 *  3. **kroki idą po kolei**, a w kroku wystarczy zgoda JEDNEJ osoby z listy;
 *  4. **rezerwujący pomija własne kroki** z adnotacją `self`, a nie brakiem wpisu;
 *  5. **odmowa wymaga powodu** i kończy sprawę, zwalniając termin;
 *  6. **decyduje ten, kto MA ZDOLNOŚĆ i stoi na liście kroku** - administrator
 *     odblokowuje każdy krok;
 *  7. **dołożenie kroku COFA sprawę w toku**, a zapadłe decyzje zostają przy SWOICH
 *     krokach (bo wskazują `id`, nie numer);
 *  8. **rezerwacja nierozstrzygnięta do początku terminu WYGASA** i zwalnia slot;
 *  9. **akceptujący widzi komplet pól** cudzej rezerwacji - bez nich zgoda zapadałaby
 *     na podstawie samych godzin.
 *
 * Mechanik z §11.2 - zwykły pilot bez wejścia do panelu - jest tu KRZ: dostaje wyłącznie
 * `reservations.approve`, więc każdy jego przypadek dowodzi przy okazji, że decyzja nie
 * wymaga dostępu do panelu.
 */

import { describe, expect, it } from 'vitest';

import { BookingClockJob } from '../src/application/common/commands/bookingClock.ts';
import { PgBookingsRepo } from '../src/infrastructure/pg/common/bookingsRepo.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/common/sessionsProjection.ts';
import { silentNotifier } from './fakePush.ts';
import { ADMIN_CSRF_HEADERS, testHarness } from './helpers.ts';
import { googleTokenFor } from './testIdentityProvider.ts';
import { ORG_A } from './testWorld.ts';

type Harness = Awaited<ReturnType<typeof testHarness>>;
type App = Harness['app'];
type Db = Harness['db'];

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

const TERAZ = Date.UTC(2026, 5, 22, 8, 0, 0);
const JUTRO = TERAZ + 86_400_000;
const H = 3_600_000;
const iso = (t: number): string => new Date(t).toISOString();

let seq = 0;
const nextId = (): string => `ap-${(seq += 1)}`;

const book = (app: App, token: string, from = JUTRO + 8 * H, to = JUTRO + 10 * H) =>
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
      note: 'zabieram dwóch tandemów',
    },
  });

const decide = (
  app: App,
  token: string,
  id: string,
  body: { decision: 'approved' | 'rejected'; reason?: string | null },
) =>
  app.inject({
    method: 'POST',
    url: `/bookings/${id}/decision`,
    headers: bearer(token),
    payload: body,
  });

const card = (app: App, token: string, id: string) =>
  app.inject({ method: 'GET', url: `/bookings/${id}`, headers: bearer(token) });

/** Ścieżka układana tak, jak zrobi to panel: `PUT /admin/api/approval-steps`. */
const setPath = (
  app: App,
  cookie: Record<string, string>,
  steps: { id?: string; label: string; memberIds: string[] }[],
) =>
  app.inject({
    method: 'PUT',
    url: '/admin/api/approval-steps',
    headers: cookie,
    payload: { steps },
  });

/**
 * Zdolność nadana ręcznie - tak samo jak zrobiłby to ekran zakresu z #197, tylko bez
 * przechodzenia przez panel. KRZ dostaje WYŁĄCZNIE prawo akceptacji: ani `panel.access`,
 * ani niczego innego. To jest mechanik z §11.2.
 */
const grantApprove = (db: Db, pilotId: string) =>
  db.query(
    `INSERT INTO membership_capabilities (org_id, pilot_id, capability)
     VALUES ($2, $1, 'reservations.approve') ON CONFLICT DO NOTHING`,
    [pilotId, ORG_A],
  );

const inbox = (app: App, token: string) =>
  app.inject({ method: 'GET', url: '/me/notifications', headers: bearer(token) });

describe('klub bez ścieżki pracuje dokładnie jak w 3.0.0', () => {
  it('rezerwacja potwierdza się od razu, a karta nie ma ani jednego kroku', async () => {
    const { app } = await testHarness();
    const pwi = await login(app, 'PWI');

    const made = await book(app, pwi);
    expect(made.statusCode, made.body).toBe(201);
    expect(made.json().status).toBe('confirmed');

    const view = await card(app, pwi, made.json().id);
    expect(view.json().approval).toEqual({ outcome: 'confirmed', steps: [] });
  });
});

describe('ścieżka dwóch kroków', () => {
  it('rezerwacja czeka, kroki idą PO KOLEI, a komplet zgód potwierdza', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    await grantApprove(db, 'JSE');
    const cookie = await panelCookie(app, 'AKO');
    const path = await setPath(app, cookie, [
      { label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Szef wyszkolenia', memberIds: ['JSE'] },
    ]);
    expect(path.statusCode, path.body).toBe(200);

    const pwi = await login(app, 'PWI');
    const made = await book(app, pwi);
    expect(made.json().status).toBe('pending');
    const id = made.json().id as string;

    // Krok 2 jeszcze nie pyta - JSE stoi w kolejce za mechanikiem. Ani KRZ, ani JSE
    // nie mają `reservations.manage`, więc kolejność obowiązuje ich bez wyjątku;
    // administrator odblokowuje każdy krok i ma na to własny przypadek niżej.
    const jse = await login(app, 'JSE');
    const zaWcześnie = await decide(app, jse, id, { decision: 'approved' });
    expect(zaWcześnie.statusCode, zaWcześnie.body).toBe(403);
    expect(zaWcześnie.json().error).toBe('not_your_step');

    const krz = await login(app, 'KRZ');
    const krok1 = await decide(app, krz, id, { decision: 'approved' });
    expect(krok1.statusCode, krok1.body).toBe(200);
    expect(krok1.json().status).toBe('pending');
    expect(krok1.json().approval.steps[1].current).toBe(true);

    const krok2 = await decide(app, jse, id, { decision: 'approved' });
    expect(krok2.statusCode, krok2.body).toBe(200);
    expect(krok2.json().status).toBe('confirmed');
    expect(krok2.json().approval.outcome).toBe('confirmed');
  });

  it('REZERWACJA CZEKAJĄCA TRZYMA SLOT - inaczej „czekam" znaczyłoby „zaraz mi to zajmą"', async () => {
    const { app } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['BNO'] }]);

    const pwi = await login(app, 'PWI');
    const made = await book(app, pwi);
    expect(made.json().status).toBe('pending');

    const jse = await login(app, 'JSE');
    const kolizja = await book(app, jse);
    expect(kolizja.statusCode, kolizja.body).toBe(409);
    expect(kolizja.json().error).toBe('slot_taken');
  });

  it('w kroku wystarczy zgoda JEDNEJ osoby z listy', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    await grantApprove(db, 'JSE');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ', 'JSE'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    const jse = await login(app, 'JSE');
    const decyzja = await decide(app, jse, id, { decision: 'approved' });
    expect(decyzja.statusCode, decyzja.body).toBe(200);
    expect(decyzja.json().status).toBe('confirmed');
  });
});

describe('rezerwujący pomija własne kroki', () => {
  it('krok, na którym sam stoi, przechodzi z adnotacją `self` - a nie brakiem wpisu', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [
      { label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Szef wyszkolenia', memberIds: ['BNO'] },
    ]);

    // Rezerwuje SAM mechanik - jego krok przechodzi, pyta dopiero szef wyszkolenia.
    const krz = await login(app, 'KRZ');
    const made = await book(app, krz);
    expect(made.json().status).toBe('pending');

    const view = await card(app, krz, made.json().id);
    const steps = view.json().approval.steps as { label: string; decision: { via: string } | null; current: boolean }[];
    expect(steps[0]!.decision?.via).toBe('self');
    expect(steps[1]!.decision).toBeNull();
    expect(steps[1]!.current).toBe(true);
  });

  it('rezerwujący na liście WSZYSTKICH kroków dostaje `confirmed` od razu', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [
      { label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Szef wyszkolenia', memberIds: ['KRZ', 'BNO'] },
    ]);

    const krz = await login(app, 'KRZ');
    const made = await book(app, krz);
    expect(made.json().status).toBe('confirmed');

    // Pominięcia są ZAPISANE, więc po miesiącu widać, że krok przeszedł sam.
    const { rows } = await testPath(app, krz, made.json().id);
    expect(rows.map((s) => s.decision?.via)).toEqual(['self', 'self']);
  });
});

describe('odmowa', () => {
  it('bez powodu odbija się, z powodem kończy sprawę i ZWALNIA termin', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;
    const krz = await login(app, 'KRZ');

    const bezPowodu = await decide(app, krz, id, { decision: 'rejected' });
    expect(bezPowodu.statusCode, bezPowodu.body).toBe(400);
    expect(bezPowodu.json().error).toBe('reason_required');

    const sameSpacje = await decide(app, krz, id, { decision: 'rejected', reason: '   ' });
    expect(sameSpacje.statusCode).toBe(400);

    const odmowa = await decide(app, krz, id, {
      decision: 'rejected',
      reason: 'Maszyna na przeglądzie 100 h.',
    });
    expect(odmowa.statusCode, odmowa.body).toBe(200);
    expect(odmowa.json().status).toBe('rejected');

    // Termin wrócił do puli natychmiast - ktoś inny może go wziąć.
    const jse = await login(app, 'JSE');
    expect((await book(app, jse)).statusCode).toBe(201);

    // Powód czyta pilot: na karcie i w wiadomości.
    const view = await card(app, pwi, id);
    expect(view.json().approval.steps[0].decision.reason).toBe('Maszyna na przeglądzie 100 h.');

    const wiadomosci = await inbox(app, pwi);
    const odmowaMsg = (wiadomosci.json().items as { kind: string; payload: Record<string, unknown> }[]).find(
      (n) => n.kind === 'booking_rejected',
    );
    expect(odmowaMsg?.payload.reason).toBe('Maszyna na przeglądzie 100 h.');
  });

  it('po odmowie nie da się już zatwierdzić', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ', 'BNO'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;
    const krz = await login(app, 'KRZ');
    await decide(app, krz, id, { decision: 'rejected', reason: 'Nie ma zgody.' });

    const bno = await login(app, 'BNO');
    const poZamknieciu = await decide(app, bno, id, { decision: 'approved' });
    expect(poZamknieciu.statusCode, poZamknieciu.body).toBe(409);
    expect(poZamknieciu.json().error).toBe('not_pending');
  });
});

describe('kto może zdecydować', () => {
  it('BEZ zdolności `reservations.approve` - 403, choćby stał na liście kroku', async () => {
    const { app } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');
    // JSE stoi na liście, ale zdolności nie dostał - lista kroku i zdolność odpowiadają
    // na dwa RÓŻNE pytania i potrzebne są obie (§11.2).
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['JSE'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    const jse = await login(app, 'JSE');
    const proba = await decide(app, jse, id, { decision: 'approved' });
    expect(proba.statusCode, proba.body).toBe(403);
    expect(proba.json().error).toBe('forbidden');
  });

  it('osoba spoza ścieżki ze zdolnością - 403 `not_your_step`', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    await grantApprove(db, 'JSE');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    const jse = await login(app, 'JSE');
    const proba = await decide(app, jse, id, { decision: 'approved' });
    expect(proba.statusCode, proba.body).toBe(403);
    expect(proba.json().error).toBe('not_your_step');
  });

  it('ADMINISTRATOR odblokowuje każdy krok - inaczej jedno odejście z klubu blokuje wszystko', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    // AKO ma `reservations.manage`, a na liście kroku nie stoi.
    const ako = await login(app, 'AKO');
    const decyzja = await decide(app, ako, id, { decision: 'approved' });
    expect(decyzja.statusCode, decyzja.body).toBe(200);
    expect(decyzja.json().status).toBe('confirmed');
  });
});

describe('ścieżka jest ZAWSZE BIEŻĄCA', () => {
  it('dołożenie kroku COFA sprawę w toku, a zapadłe decyzje zostają przy SWOICH krokach', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    const pierwsza = await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);
    const mechanik = pierwsza.json().steps[0] as { id: string };

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;
    const krz = await login(app, 'KRZ');
    const zgoda = await decide(app, krz, id, { decision: 'approved' });
    expect(zgoda.json().status).toBe('confirmed');

    // Administrator dokłada krok PRZED mechanikiem. Rezerwacja już potwierdzona nie
    // wraca do kolejki - decyzja jest faktem, a status wiersza jej skutkiem.
    await setPath(app, cookie, [
      { label: 'Szef wyszkolenia', memberIds: ['BNO'] },
      { id: mechanik.id, label: 'Mechanik', memberIds: ['KRZ'] },
    ]);

    const view = await card(app, pwi, id);
    const steps = view.json().approval.steps as { label: string; decision: unknown; current: boolean }[];
    // Zgoda mechanika ZOSTAŁA przy mechaniku, choć jest teraz drugi w kolejności.
    expect(steps.map((s) => s.label)).toEqual(['Szef wyszkolenia', 'Mechanik']);
    expect(steps[0]!.decision).toBeNull();
    expect(steps[1]!.decision).not.toBeNull();
    // Sprawa jest w toku od nowa: nowy krok czeka na decyzję.
    expect(view.json().approval.outcome).toBe('pending');
    expect(steps[0]!.current).toBe(true);
  });

  it('krok ZDJĘTY ze ścieżki przestaje być pytany, a jego decyzja zostaje w rejestrze', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    const pierwsza = await setPath(app, cookie, [
      { label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Szef wyszkolenia', memberIds: ['BNO'] },
    ]);
    const szef = (pierwsza.json().steps as { id: string; label: string }[])[1]!;

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;
    const krz = await login(app, 'KRZ');
    await decide(app, krz, id, { decision: 'approved' });

    // Klub zdejmuje mechanika ze ścieżki. Zostaje sam szef wyszkolenia.
    await setPath(app, cookie, [{ id: szef.id, label: 'Szef wyszkolenia', memberIds: ['BNO'] }]);

    const view = await card(app, pwi, id);
    expect(view.json().approval.steps).toHaveLength(1);
    expect(view.json().approval.outcome).toBe('pending');

    // Decyzja pod zdjętym krokiem NIE ZNIKŁA z bazy - rejestr jest append-only.
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM booking_approvals WHERE booking_id = $1`,
      [id],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('krok BEZ ANI JEDNEJ OSOBY jest odrzucany przy zapisie ścieżki', async () => {
    const { app } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');
    const proba = await setPath(app, cookie, [{ label: 'Mechanik', memberIds: [] }]);
    expect(proba.statusCode, proba.body).toBe(400);
    expect(proba.json()).toMatchObject({ error: 'step_without_members', stepLabel: 'Mechanik' });
  });

  it('krok obsadzony osobą z CUDZEGO klubu jest odrzucany', async () => {
    const { app } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');
    const proba = await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['BAD'] }]);
    expect(proba.statusCode, proba.body).toBe(400);
    expect(proba.json().error).toBe('member_not_in_org');
  });
});

describe('zapis ścieżki domyka i przekierowuje sprawy w toku (#207)', () => {
  const audytZapisu = async (db: Db) => {
    const { rows } = await db.query<{ details: unknown }>(
      `SELECT details FROM admin_audit WHERE action = 'approval.steps' ORDER BY id DESC LIMIT 1`,
    );
    const d = rows[0]!.details;
    return (typeof d === 'string' ? JSON.parse(d) : d) as { confirmed: number; moved: number };
  };

  it('zdjęcie ostatniego brakującego kroku POTWIERDZA sprawę z kompletem zgód i zawiadamia pilota', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    const pierwsza = await setPath(app, cookie, [
      { label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Szef wyszkolenia', memberIds: ['BNO'] },
    ]);
    const mechanik = (pierwsza.json().steps as { id: string }[])[0]!;

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;
    const krz = await login(app, 'KRZ');
    expect((await decide(app, krz, id, { decision: 'approved' })).json().status).toBe('pending');

    // Klub zdejmuje szefa wyszkolenia. Sprawa ma komplet zgód na NOWEJ ścieżce - do #207
    // stała w `pending`, nikt nie mógł jej domknąć i wygasała jako „nikt nie zdecydował".
    const zapis = await setPath(app, cookie, [{ id: mechanik.id, label: 'Mechanik', memberIds: ['KRZ'] }]);
    expect(zapis.statusCode, zapis.body).toBe(200);
    expect(zapis.json().reconciled).toEqual({ confirmed: 1, moved: 0 });

    const view = await card(app, pwi, id);
    expect(view.json().booking.status).toBe('confirmed');
    expect(view.json().approval.outcome).toBe('confirmed');

    // Pilot dostaje TĘ SAMĄ wiadomość, co po ostatniej zgodzie kroku.
    const skrzynka = await inbox(app, pwi);
    expect(skrzynka.json().items.map((i: { kind: string }) => i.kind)).toEqual(['booking_approved']);

    // Dziennik mówi, ile spraw ten zapis domknął.
    expect(await audytZapisu(db)).toMatchObject({ confirmed: 1, moved: 0 });
  });

  it('wyczyszczenie całej ścieżki potwierdza WSZYSTKIE czekające sprawy', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const jse = await login(app, 'JSE');
    const a = (await book(app, pwi)).json().id as string;
    const b = (await book(app, jse, JUTRO + 12 * H, JUTRO + 13 * H)).json().id as string;

    // Klub wyłącza akceptację. Bez tego przebiegu obie sprawy stałyby w `pending`
    // w klubie, który nie ma już czego pytać.
    const zapis = await setPath(app, cookie, []);
    expect(zapis.json().reconciled).toEqual({ confirmed: 2, moved: 0 });
    expect((await card(app, pwi, a)).json().booking.status).toBe('confirmed');
    expect((await card(app, jse, b)).json().booking.status).toBe('confirmed');
    expect((await inbox(app, jse)).json().items[0].kind).toBe('booking_approved');
  });

  it('zdjęcie kroku BIEŻĄCEGO przesuwa sprawę do następnego i prosi jego osoby', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    await grantApprove(db, 'BNO');
    const cookie = await panelCookie(app, 'AKO');
    const pierwsza = await setPath(app, cookie, [
      { label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Szef wyszkolenia', memberIds: ['BNO'] },
    ]);
    const szef = (pierwsza.json().steps as { id: string }[])[1]!;

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;
    const bno = await login(app, 'BNO');
    expect((await inbox(app, bno)).json().items).toHaveLength(0);

    // Mechanik znika ze ścieżki, zanim zdecydował. Sprawa czeka teraz na szefa - a ten
    // musi się o tym dowiedzieć, bo przy złożeniu nikt go nie pytał (kroki idą po kolei).
    const zapis = await setPath(app, cookie, [
      { id: szef.id, label: 'Szef wyszkolenia', memberIds: ['BNO'] },
    ]);
    expect(zapis.json().reconciled).toEqual({ confirmed: 0, moved: 1 });

    const wiadomosci = (await inbox(app, bno)).json().items as { kind: string; payload: { stepLabel: string } }[];
    expect(wiadomosci).toHaveLength(1);
    expect(wiadomosci[0]!.kind).toBe('approval_requested');
    expect(wiadomosci[0]!.payload.stepLabel).toBe('Szef wyszkolenia');

    const view = await card(app, pwi, id);
    expect(view.json().approval.outcome).toBe('pending');
    expect(view.json().approval.steps[0].current).toBe(true);
    // I szef może teraz zdecydować - sprawa nie utknęła.
    expect((await decide(app, bno, id, { decision: 'approved' })).json().status).toBe('confirmed');
  });

  it('krok DOŁOŻONY przed bieżącym prosi swoje osoby, a krok bieżący nie dostaje drugiej prośby', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    await grantApprove(db, 'BNO');
    const cookie = await panelCookie(app, 'AKO');
    const pierwsza = await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);
    const mechanik = (pierwsza.json().steps as { id: string }[])[0]!;

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    // Dołożenie kroku COFA sprawę (§11.2) - i od #207 nowy krok pierwszy dowiaduje się
    // o tym od razu, zamiast czekać, aż ktoś zajrzy do kolejki.
    const zapis = await setPath(app, cookie, [
      { label: 'Szef wyszkolenia', memberIds: ['BNO'] },
      { id: mechanik.id, label: 'Mechanik', memberIds: ['KRZ'] },
    ]);
    expect(zapis.json().reconciled).toEqual({ confirmed: 0, moved: 1 });

    const bno = await login(app, 'BNO');
    const wiadomosci = (await inbox(app, bno)).json().items as { kind: string; payload: { stepLabel: string } }[];
    expect(wiadomosci.map((w) => [w.kind, w.payload.stepLabel])).toEqual([
      ['approval_requested', 'Szef wyszkolenia'],
    ]);
    // Mechanik miał prośbę od złożenia i nie dostaje jej po raz drugi.
    const krz = await login(app, 'KRZ');
    expect((await inbox(app, krz)).json().items).toHaveLength(1);
    expect((await card(app, pwi, id)).json().approval.steps[0].current).toBe(true);
  });

  it('krok dołożony z REZERWUJĄCYM na liście przechodzi sam - z adnotacją `self`', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    const pierwsza = await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);
    const mechanik = (pierwsza.json().steps as { id: string }[])[0]!;

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    // Krok z PWI na liście dochodzi ZA mechanikiem: nikt nie prosi człowieka o zgodę
    // na własny plan, także po zmianie ścieżki. Sprawa dalej czeka na mechanika.
    const druga = await setPath(app, cookie, [
      { id: mechanik.id, label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Potwierdzenie pilota', memberIds: ['PWI'] },
    ]);
    expect(druga.json().reconciled).toEqual({ confirmed: 0, moved: 0 });
    const kroki = (await card(app, pwi, id)).json().approval.steps as {
      label: string;
      current: boolean;
      decision: { via: string } | null;
    }[];
    expect(kroki[0]!.current).toBe(true);
    expect(kroki[1]!.decision?.via).toBe('self');
    expect((await inbox(app, pwi)).json().items).toHaveLength(0);

    // A gdy mechanik znika, pominięcie jest kompletem zgód.
    const potwierdzenie = (druga.json().steps as { id: string }[])[1]!;
    const trzecia = await setPath(app, cookie, [
      { id: potwierdzenie.id, label: 'Potwierdzenie pilota', memberIds: ['PWI'] },
    ]);
    expect(trzecia.json().reconciled).toEqual({ confirmed: 1, moved: 0 });
    expect((await card(app, pwi, id)).json().booking.status).toBe('confirmed');
  });

  it('zmiana OBSADY kroku bieżącego nie rodzi prośby - sprawa czeka tam, gdzie czekała', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    await grantApprove(db, 'BNO');
    const cookie = await panelCookie(app, 'AKO');
    const pierwsza = await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);
    const mechanik = (pierwsza.json().steps as { id: string }[])[0]!;
    const pwi = await login(app, 'PWI');
    await book(app, pwi);

    const zapis = await setPath(app, cookie, [
      { id: mechanik.id, label: 'Mechanik', memberIds: ['KRZ', 'BNO'] },
    ]);
    expect(zapis.json().reconciled).toEqual({ confirmed: 0, moved: 0 });
    // Osoba dopisana do kroku widzi sprawę w kolejce; budzika za to nie ma.
    const bno = await login(app, 'BNO');
    expect((await inbox(app, bno)).json().items).toHaveLength(0);
    const kolejka = await app.inject({ url: '/me/approvals/queue', headers: bearer(bno) });
    expect(kolejka.json().items).toHaveLength(1);
  });
});

describe('termin nadszedł, a decyzji nie ma (§11.5)', () => {
  it('rezerwacja WYGASA, zwalnia slot i mówi o tym pilotowi', async () => {
    const { app, db } = await testHarness();
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['BNO'] }]);

    const pwi = await login(app, 'PWI');
    const start = TERAZ + 2 * H;
    const made = await book(app, pwi, start, start + 2 * H);
    expect(made.json().status).toBe('pending');
    const id = made.json().id as string;

    const job = (now: Date) =>
      new BookingClockJob(
        db,
        new PgBookingsRepo(),
        new PgSessionsProjection(),
        { now: () => now },
        silentNotifier(db),
      ).run();

    // Przed terminem nic się nie dzieje - sprawa ma jeszcze czas.
    expect((await job(new Date(start - H))).expired).toBe(0);

    const poTerminie = await job(new Date(start + 60_000));
    expect(poTerminie.expired).toBe(1);

    const { rows } = await db.query<{ status: string; close_reason: string | null }>(
      'SELECT status, close_reason FROM bookings WHERE id = $1',
      [id],
    );
    // Stan OSOBNY od `released` (tam maszyny nie przejęto, tu zgody nie wydano)
    // i BEZ powodu - `close_reason` niesie zdanie CZŁOWIEKA.
    expect(rows[0]!.status).toBe('expired');
    expect(rows[0]!.close_reason).toBeNull();

    // Termin wrócił do puli.
    const jse = await login(app, 'JSE');
    expect((await book(app, jse, start, start + 2 * H)).statusCode).toBe(201);

    const wiadomosci = await inbox(app, pwi);
    expect(
      (wiadomosci.json().items as { kind: string }[]).some((n) => n.kind === 'booking_expired'),
    ).toBe(true);
  });
});

describe('skrzynka', () => {
  it('prośba trafia do osób kroku BIEŻĄCEGO i do nikogo więcej', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [
      { label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Szef wyszkolenia', memberIds: ['BNO'] },
    ]);

    const pwi = await login(app, 'PWI');
    await book(app, pwi);

    const krz = await login(app, 'KRZ');
    const mechanik = await inbox(app, krz);
    expect(mechanik.json().unread).toBe(1);
    expect(mechanik.json().items[0].kind).toBe('approval_requested');
    expect(mechanik.json().items[0].payload.stepLabel).toBe('Mechanik');
    // Skrzynka mówi telefonowi, czy ta osoba AKCEPTUJE (epik R-J): akceptującego prosi
    // się o zgodę na powiadomienia od razu, rezerwującego dopiero przy jego sprawie.
    expect(mechanik.json().approver).toBe(true);
    expect((await inbox(app, pwi)).json().approver).toBe(false);

    // Krok 2 jeszcze nie pyta, więc BNO nie dostaje nic - budzenie wszystkich naraz
    // jest dokładnie tym, przed czym broni kolejność kroków.
    const bno = await login(app, 'BNO');
    expect((await inbox(app, bno)).json().items).toHaveLength(0);
  });

  it('przeczytanie gasi licznik, a CUDZEJ wiadomości nie da się tknąć', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    await book(app, pwi);

    const krz = await login(app, 'KRZ');
    const id = (await inbox(app, krz)).json().items[0].id as string;

    const cudza = await app.inject({
      method: 'POST',
      url: `/me/notifications/${id}/read`,
      headers: bearer(pwi),
    });
    expect(cudza.statusCode).toBe(404);

    const swoja = await app.inject({
      method: 'POST',
      url: `/me/notifications/${id}/read`,
      headers: bearer(krz),
    });
    expect(swoja.statusCode).toBe(204);
    expect((await inbox(app, krz)).json().unread).toBe(0);
  });
});

describe('akceptujący jest TRZECIM widzem na drucie (§17)', () => {
  it('widzi komplet pól cudzej rezerwacji; zwykły członek klubu - nie', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    const krz = await login(app, 'KRZ');
    const widok = await card(app, krz, id);
    expect(widok.json().booking.operation).toBe('skoki');
    expect(widok.json().booking.note).toBe('zabieram dwóch tandemów');

    // JSE jest zwykłym członkiem klubu i nie zyskuje ANI JEDNEGO pola.
    const jse = await login(app, 'JSE');
    const waski = await card(app, jse, id);
    expect(waski.json().booking.operation).toBeUndefined();
    expect(waski.json().booking.note).toBeUndefined();
  });

  it('ścieżka i POWÓD ODMOWY cudzej rezerwacji nie jadą do zwykłego członka klubu (przegląd 3.1.0)', async () => {
    // Powód odmowy to zdanie akceptującego DO PILOTA - treść tej samej klasy, co notatka.
    // Panel ukrywał go wąskiemu widzowi od początku; telefon oddawał go każdemu w klubie.
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;
    const krz = await login(app, 'KRZ');
    expect((await decide(app, krz, id, { decision: 'rejected', reason: 'Nie w tym tygodniu.' })).statusCode).toBe(200);

    const jse = await login(app, 'JSE');
    const obcy = await card(app, jse, id);
    expect(obcy.statusCode).toBe(200);
    expect(obcy.json().approval).toBeNull();

    // Właściciel i akceptujący widzą ścieżkę jak dotąd.
    expect((await card(app, pwi, id)).json().approval.steps[0].decision.reason).toBe('Nie w tym tygodniu.');
    expect((await card(app, krz, id)).json().approval.steps[0].decision.reason).toBe('Nie w tym tygodniu.');
  });
});

/**
 * PANEL (issue #165): kolejka „czeka na Twoją decyzję" i decyzja z biurka. Decyzja
 * z panelu przechodzi TYM SAMYM rdzeniem i trafia do TEGO SAMEGO rejestru, co z telefonu
 * - bez wpisu w dzienniku audytu (decyzja właściciela 2026-09-23).
 */
describe('panel: kolejka decyzji i decyzja z biurka', () => {
  const queue = (app: App, cookie: Record<string, string>) =>
    app.inject({ method: 'GET', url: '/admin/api/approvals/queue', headers: cookie });

  const decideFromPanel = (
    app: App,
    cookie: Record<string, string>,
    id: string,
    body: { decision: 'approved' | 'rejected'; reason?: string | null },
  ) =>
    app.inject({
      method: 'POST',
      url: `/admin/api/bookings/${id}/decision`,
      headers: cookie,
      payload: body,
    });

  it('kolejka pokazuje WYŁĄCZNIE sprawy stojące na MOIM kroku bieżącym, najstarsze pierwsze', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [
      { label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Szef wyszkolenia', memberIds: ['AKO', 'BNO'] },
    ]);

    const pwi = await login(app, 'PWI');
    const pierwsza = (await book(app, pwi)).json().id as string;
    const druga = (await book(app, pwi, JUTRO + 11 * H, JUTRO + 12 * H)).json().id as string;

    // AKO stoi na kroku 2 - dopóki mechanik nie zatwierdzi, jego kolejka jest PUSTA,
    // choć w klubie czekają dwie sprawy. Kolejka cudzego kroku nie jest jego sprawą.
    expect((await queue(app, cookie)).json().items).toEqual([]);

    const krz = await login(app, 'KRZ');
    await decide(app, krz, druga, { decision: 'approved' });
    await decide(app, krz, pierwsza, { decision: 'approved' });

    const res = await queue(app, cookie);
    expect(res.statusCode, res.body).toBe(200);
    const items = res.json().items as {
      booking: { id: string; note: string };
      step: { label: string; members: number; next: string | null };
    }[];
    // Najstarsza ZŁOŻONA pierwsza - to ona jest najbliżej wygaśnięcia.
    expect(items.map((i) => i.booking.id)).toEqual([pierwsza, druga]);
    expect(items[0]!.step).toEqual({
      id: expect.any(String),
      label: 'Szef wyszkolenia',
      members: 2,
      next: null,
    });
    // Panel widzi komplet pól cudzej rezerwacji - bez notatki zgoda zapadałaby na
    // podstawie samych godzin.
    expect(items[0]!.booking.note).toBe('zabieram dwóch tandemów');
  });

  it('decyzja z panelu: ten sam rdzeń, ten sam rejestr, ŻADNEGO wpisu audytu; historia z osobą', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [
      { label: 'Mechanik', memberIds: ['KRZ'] },
      { label: 'Szef wyszkolenia', memberIds: ['AKO'] },
    ]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    // AKO ma `reservations.manage`, więc odblokowuje z panelu krok MECHANIKA - druga
    // zapora przed zakleszczeniem ścieżki (§11.2). Zapis jest jego i jawny.
    const krok1 = await decideFromPanel(app, cookie, id, { decision: 'approved' });
    expect(krok1.statusCode, krok1.body).toBe(200);
    expect(krok1.json().status).toBe('pending');
    expect(krok1.json().approval.steps[0].decision).toMatchObject({
      decision: 'approved',
      via: 'person',
      decidedBy: 'AKO',
    });

    const krok2 = await decideFromPanel(app, cookie, id, { decision: 'approved' });
    expect(krok2.json().status).toBe('confirmed');

    // Karta w panelu niesie OSOBĘ decydującą (H5), telefon - nie (§9.4).
    const panelCard = await app.inject({ url: `/admin/api/bookings/${id}`, headers: cookie });
    expect(panelCard.statusCode, panelCard.body).toBe(200);
    expect(panelCard.json().approval.steps.map((s: { decision: { decidedBy: string } }) => s.decision.decidedBy)).toEqual(['AKO', 'AKO']);
    const phoneCard = await card(app, pwi, id);
    expect(phoneCard.json().approval.steps[0].decision).not.toHaveProperty('decidedBy');

    // Rejestrem decyzji jest `booking_approvals`; w dzienniku audytu nic nie przybyło.
    const audit = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM admin_audit WHERE action LIKE 'approval.%' AND action <> 'approval.steps'`,
    );
    expect(Number(audit.rows[0]!.n)).toBe(0);
  });

  it('odmowa z panelu wymaga powodu; bez `approve` ani `manage` - 403', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    // JSE dostaje SAMO wejście do panelu - ani jednej ze zdolności decyzji.
    await db.query(
      `INSERT INTO membership_capabilities (org_id, pilot_id, capability) VALUES ($1, 'JSE', 'panel.access')`,
      [ORG_A],
    );
    const jse = await panelCookie(app, 'JSE');
    const bezPrawa = await decideFromPanel(app, jse, id, { decision: 'approved' });
    expect(bezPrawa.statusCode, bezPrawa.body).toBe(403);

    const bezPowodu = await decideFromPanel(app, cookie, id, { decision: 'rejected' });
    expect(bezPowodu.statusCode).toBe(400);
    expect(bezPowodu.json().error).toBe('reason_required');

    const odmowa = await decideFromPanel(app, cookie, id, {
      decision: 'rejected',
      reason: 'Maszyna jedzie na przegląd.',
    });
    expect(odmowa.statusCode, odmowa.body).toBe(200);
    expect(odmowa.json().status).toBe('rejected');

    // Sprawa rozstrzygnięta znika z każdej kolejki.
    expect((await queue(app, cookie)).json().items).toEqual([]);
  });
});

/**
 * POPRAWKA TERMINU CZYŚCI ZGODY (3.1.0, epik R-I; §9.4, migracja 14). Zgoda dotyczyła
 * KONKRETNEGO terminu: po przesunięciu ścieżka rusza od nowa, także dla rezerwacji już
 * potwierdzonej, a stare decyzje zostają w rejestrze jako zastąpione. Zmiana notatki
 * zgód nie rusza.
 */
describe('poprawka terminu czyści zgody', () => {
  const move = (app: App, token: string, id: string, body: Record<string, unknown>) =>
    app.inject({ method: 'PATCH', url: `/bookings/${id}`, headers: bearer(token), payload: body });

  it('przesunięcie POTWIERDZONEJ rezerwacji cofa ją do `pending` i pyta krok pierwszy od nowa', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;
    const krz = await login(app, 'KRZ');
    expect((await decide(app, krz, id, { decision: 'approved' })).json().status).toBe('confirmed');
    expect((await inbox(app, krz)).json().items).toHaveLength(1);

    const moved = await move(app, pwi, id, { startsAt: iso(JUTRO + 12 * H), endsAt: iso(JUTRO + 14 * H) });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json().status).toBe('pending');

    // Stara zgoda NIE liczy się do rozstrzygnięcia, ale zostaje w rejestrze.
    const view = await card(app, pwi, id);
    expect(view.json().approval.outcome).toBe('pending');
    expect(view.json().approval.steps[0].decision).toBeNull();
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM booking_approvals WHERE booking_id = $1 AND superseded_at IS NOT NULL`,
      [id],
    );
    expect(Number(rows[0]!.n)).toBe(1);

    // Mechanik dostał DRUGĄ prośbę - o nowy termin - i może zdecydować pod tym samym krokiem.
    expect((await inbox(app, krz)).json().items).toHaveLength(2);
    const znowu = await decide(app, krz, id, { decision: 'approved' });
    expect(znowu.statusCode, znowu.body).toBe(200);
    expect(znowu.json().status).toBe('confirmed');
  });

  it('zmiana notatki zgód nie rusza; klub bez ścieżki poprawia termin jak w 3.0.0', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;
    const krz = await login(app, 'KRZ');
    await decide(app, krz, id, { decision: 'approved' });

    const notatka = await move(app, pwi, id, { note: 'jednak trzech tandemów' });
    expect(notatka.statusCode, notatka.body).toBe(200);
    expect(notatka.json().status).toBe('confirmed');
    expect((await card(app, pwi, id)).json().approval.steps[0].decision).not.toBeNull();

    // Klub bez ścieżki: przesunięcie zostawia `confirmed` i nikogo nie budzi.
    await setPath(app, cookie, []);
    const bezSciezki = await move(app, pwi, id, { startsAt: iso(JUTRO + 15 * H), endsAt: iso(JUTRO + 16 * H) });
    expect(bezSciezki.statusCode, bezSciezki.body).toBe(200);
    expect(bezSciezki.json().status).toBe('confirmed');
  });
});

/** TELEFON: kolejka moich spraw i doba klubu przy wiadomości (3.1.0, epik R-I). */
describe('telefon: kolejka spraw i skrzynka z dobą klubu', () => {
  it('`GET /me/approvals/queue` oddaje sprawy na MOIM kroku, a wiadomość niesie dobę terminu', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookie = await panelCookie(app, 'AKO');
    await setPath(app, cookie, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    const krz = await login(app, 'KRZ');
    const queue = await app.inject({ url: '/me/approvals/queue', headers: bearer(krz) });
    expect(queue.statusCode, queue.body).toBe(200);
    const items = queue.json().items as { booking: { id: string; note?: string; createdAt?: string }; step: { label: string } }[];
    expect(items.map((i) => i.booking.id)).toEqual([id]);
    expect(items[0]!.step.label).toBe('Mechanik');
    // Akceptujący widzi komplet, razem z chwilą złożenia („czeka od").
    expect(items[0]!.booking.note).toBe('zabieram dwóch tandemów');
    expect(items[0]!.booking.createdAt).toEqual(expect.any(String));

    // Rezerwujący nie stoi na żadnym kroku - jego kolejka jest pusta.
    expect((await app.inject({ url: '/me/approvals/queue', headers: bearer(pwi) })).json().items).toEqual([]);

    const skrzynka = await inbox(app, krz);
    const [note] = skrzynka.json().items as { kind: string; day: { date: string; startsAt: string; endsAt: string } | null }[];
    expect(skrzynka.json().timezone).toEqual(expect.any(String));
    expect(note!.kind).toBe('approval_requested');
    expect(note!.day).toEqual({ date: expect.any(String), startsAt: expect.any(String), endsAt: expect.any(String) });
    expect(Date.parse(note!.day!.startsAt)).toBeLessThanOrEqual(JUTRO + 8 * H);
    expect(Date.parse(note!.day!.endsAt)).toBeGreaterThan(JUTRO + 8 * H);
  });
});

describe('izolacja klubów', () => {
  it('ścieżka i skrzynka NIE PRZECIEKAJĄ do drugiego klubu', async () => {
    const { app, db } = await testHarness();
    await grantApprove(db, 'KRZ');
    const cookieA = await panelCookie(app, 'AKO');
    await setPath(app, cookieA, [{ label: 'Mechanik', memberIds: ['KRZ'] }]);

    // Klub B ścieżki nie ma, choć klub A właśnie ją ułożył.
    const cookieB = await panelCookie(app, 'BAD');
    const sciezkaB = await app.inject({
      method: 'GET',
      url: '/admin/api/approval-steps',
      headers: cookieB,
    });
    expect(sciezkaB.statusCode, sciezkaB.body).toBe(200);
    expect(sciezkaB.json().steps).toEqual([]);

    const pwi = await login(app, 'PWI');
    const id = (await book(app, pwi)).json().id as string;

    // Ten sam człowiek w klubie B nie widzi ani rezerwacji, ani wiadomości z klubu A.
    const bpi = await login(app, 'BPI');
    expect((await card(app, bpi, id)).statusCode).toBe(404);
    expect((await inbox(app, bpi)).json().items).toHaveLength(0);
  });
});

/** Ścieżka z karty rezerwacji - skrót używany tam, gdzie liczy się sama lista kroków. */
async function testPath(
  app: App,
  token: string,
  id: string,
): Promise<{ rows: { label: string; decision: { via: string } | null }[] }> {
  const view = await card(app, token, id);
  return { rows: view.json().approval.steps };
}
