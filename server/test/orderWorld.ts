/**
 * Ninerdeck (serwer) - świat testowy ZLECEŃ na prawdziwym Postgresie (PGlite): komendy,
 * zapytania i adaptery w składzie z produkcji (4.0.0, issue #245).
 *
 * Atrapami są WYŁĄCZNIE cudze usługi: budzik (`FakePush`) i kanał klubu
 * (`FakeLiveSignals` - rozsyłanie przychodzi z Z-E). Skrzynka, historia zmian, blokady
 * wierszy i wykluczenie nakładania terminów są prawdziwe - testy pytają właśnie o nie.
 *
 * Klub A dostaje trzech dodatkowych pilotów (ANN, EWA, TOM), bo zlecenie do grupy
 * potrzebuje więcej chętnych niż świat bazowy ma zwykłych pilotów. JSE dostaje
 * „Zlecanie lotów" - to instruktor, który prowadzi WŁASNE zlecenia, bez władzy nad
 * cudzymi; BNO i AKO mają komplet (także `reservations.manage`).
 */

import { randomUUID } from 'node:crypto';

import { AuditedWrite } from '../src/application/admin/auditedWrite.ts';
import type { Actor } from '../src/application/admin/ports.ts';
import { MemberGroupCommands } from '../src/application/admin/commands/memberGroups.ts';
import { BookingClockJob } from '../src/application/common/commands/bookingClock.ts';
import { OrderClock } from '../src/application/common/commands/orderClock.ts';
import { OrderAssignmentCommands } from '../src/application/common/commands/orderAssignments.ts';
import { OrderEditCommands } from '../src/application/common/commands/orderEdit.ts';
import { OrderCommands, type OrderDraft } from '../src/application/common/commands/orders.ts';
import { OrderResponseCommands } from '../src/application/common/commands/orderResponses.ts';
import { ThreadCommands } from '../src/application/common/commands/threads.ts';
import { AircraftWatching } from '../src/application/common/notify/aircraftWatching.ts';
import { Notifier } from '../src/application/common/notify/notifier.ts';
import { OrderSignals } from '../src/application/common/notify/orderSignals.ts';
import type { OrderActor } from '../src/application/common/orderAccess.ts';
import { OrderRecords } from '../src/application/common/orderRecords.ts';
import { OrderSeating } from '../src/application/common/orderSeating.ts';
import type { Database, Queryable } from '../src/application/common/ports.ts';
import { MemberGroupQueries } from '../src/application/common/queries/memberGroups.ts';
import { OrderQueries } from '../src/application/common/queries/orders.ts';
import { ThreadQueries } from '../src/application/common/queries/threads.ts';
import { PgAdminAuditRepo } from '../src/infrastructure/pg/admin/auditRepo.ts';
import { PgAircraftConfigRepo } from '../src/infrastructure/pg/common/aircraftConfigRepo.ts';
import { PgAircraftWatchesRepo } from '../src/infrastructure/pg/common/aircraftWatchesRepo.ts';
import { PgBookingsRepo } from '../src/infrastructure/pg/common/bookingsRepo.ts';
import { PgClubMembersRepo } from '../src/infrastructure/pg/common/clubMembersRepo.ts';
import { PgClubSettingsRepo } from '../src/infrastructure/pg/common/clubSettingsRepo.ts';
import { PgFlightOrdersRepo } from '../src/infrastructure/pg/common/flightOrdersRepo.ts';
import { PgMemberGroupsRepo } from '../src/infrastructure/pg/common/memberGroupsRepo.ts';
import { PgNotificationsRepo } from '../src/infrastructure/pg/common/notificationsRepo.ts';
import { PgOrderChangesRepo } from '../src/infrastructure/pg/common/orderChangesRepo.ts';
import { PgOrderRecipientsRepo } from '../src/infrastructure/pg/common/orderRecipientsRepo.ts';
import { PgPushTokensRepo } from '../src/infrastructure/pg/common/pushTokensRepo.ts';
import { PgSessionsProjection } from '../src/infrastructure/pg/common/sessionsProjection.ts';
import { PgThreadMessagesRepo } from '../src/infrastructure/pg/common/threadMessagesRepo.ts';
import { PgThreadsRepo } from '../src/infrastructure/pg/common/threadsRepo.ts';
import { migrate } from '../src/infrastructure/pg/migrate.ts';
import { FakeLiveSignals } from './fakeLiveSignals.ts';
import { FakePush } from './fakePush.ts';
import { TestClock } from './helpers.ts';
import { newPglite } from './pglite.ts';
import { ORG_A, seedTestWorld } from './testWorld.ts';

/** Zegar świata testowego: poniedziałek 22 czerwca 2026, 08:00 UTC. */
export const NOW = Date.UTC(2026, 5, 22, 8, 0, 0);
export const H = 3_600_000;
/** Termin zleceń w testach: środa 24 czerwca, 10:00-12:00 UTC. */
export const STARTS = Date.UTC(2026, 5, 24, 10, 0, 0);
export const ENDS = STARTS + 2 * H;

export const author: OrderActor = { pilotId: 'JSE', creates: true, manages: false };
export const coordinator: OrderActor = { pilotId: 'BNO', creates: true, manages: true };
export const pilot = (pilotId: string): OrderActor => ({ pilotId, creates: false, manages: false });

export const adminActor: Actor = {
  pilotId: 'AKO',
  orgId: ORG_A,
  capabilities: ['accounts.manage', 'panel.access'],
  ip: null,
  sessionId: null,
};

export interface OrderWorld {
  db: Database;
  clock: TestClock;
  push: FakePush;
  live: FakeLiveSignals;
  orders: OrderCommands;
  edits: OrderEditCommands;
  responses: OrderResponseCommands;
  assignments: OrderAssignmentCommands;
  threads: ThreadCommands;
  queries: OrderQueries;
  threadQueries: ThreadQueries;
  groups: MemberGroupCommands;
  groupQueries: MemberGroupQueries;
  /** Zadanie okresowe kalendarza z czwartym pytaniem - zegarem zleceń. */
  clockJob: BookingClockJob;
}

export async function orderWorld(): Promise<OrderWorld> {
  const pglite = newPglite();
  const db = {
    query: (text: string, params?: unknown[]) => pglite.query(text, params as never) as never,
    transaction: (fn: (tx: Queryable) => Promise<unknown>) =>
      pglite.transaction((tx) => fn(tx as unknown as Queryable)) as never,
    exec: (sql: string) => pglite.exec(sql),
  } as unknown as Database;
  await migrate(db);
  await seedTestWorld(db);
  for (const [id, name] of [
    ['ANN', 'Anna Nowak'],
    ['EWA', 'Ewa Sowa'],
    ['TOM', 'Tomasz Mazur'],
  ] as const) {
    await db.query(`INSERT INTO pilots (id, name, active) VALUES ($1, $2, TRUE)`, [id, name]);
    await db.query(
      `INSERT INTO memberships (org_id, pilot_id, code, status, joined_via) VALUES ($1, $2, $2, 'active', 'code')`,
      [ORG_A, id],
    );
  }
  await grant(db, 'JSE', 'orders.create');

  const clock = new TestClock(NOW);
  const push = new FakePush();
  const live = new FakeLiveSignals();

  const ordersRepo = new PgFlightOrdersRepo();
  const bookings = new PgBookingsRepo();
  const recipients = new PgOrderRecipientsRepo();
  const changes = new PgOrderChangesRepo();
  const groupsRepo = new PgMemberGroupsRepo();
  const members = new PgClubMembersRepo();
  const aircraft = new PgAircraftConfigRepo();
  const threadsRepo = new PgThreadsRepo();
  const messages = new PgThreadMessagesRepo();
  const notifier = new Notifier(db, new PgNotificationsRepo(), new PgPushTokensRepo(clock), push, randomUUID);
  const watching = new AircraftWatching(new PgAircraftWatchesRepo(), aircraft, notifier);
  const records = new OrderRecords(ordersRepo, bookings, recipients);
  const seating = new OrderSeating(ordersRepo, bookings);
  const signals = new OrderSignals(live);
  const clubs = new PgClubSettingsRepo();
  const orderClock = new OrderClock(db, records, ordersRepo, bookings, changes, clubs, notifier, signals, randomUUID, clock, watching);

  return {
    db,
    clock,
    push,
    live,
    orders: new OrderCommands(
      db, records, ordersRepo, bookings, recipients, changes, groupsRepo, members, aircraft, notifier, signals, clock, randomUUID, watching,
    ),
    edits: new OrderEditCommands(
      db, records, ordersRepo, bookings, recipients, changes, groupsRepo, members, aircraft, notifier, signals, clock, randomUUID, watching,
    ),
    responses: new OrderResponseCommands(db, records, seating, recipients, changes, notifier, signals, clock, randomUUID),
    assignments: new OrderAssignmentCommands(db, records, seating, changes, members, notifier, signals, clock, randomUUID),
    threads: new ThreadCommands(db, records, recipients, threadsRepo, messages, notifier, signals, clock, randomUUID),
    queries: new OrderQueries(db, records, ordersRepo, bookings, recipients, changes, messages, clubs, clock),
    threadQueries: new ThreadQueries(db, records, threadsRepo, messages),
    groups: new MemberGroupCommands(new AuditedWrite(db, new PgAdminAuditRepo(), clock), groupsRepo, members, clock),
    groupQueries: new MemberGroupQueries(db, groupsRepo),
    clockJob: new BookingClockJob(db, bookings, new PgSessionsProjection(), clock, notifier, watching, orderClock),
  };
}

export async function grant(db: Queryable, pilotId: string, capability: string, orgId = ORG_A): Promise<void> {
  await db.query(
    `INSERT INTO membership_capabilities (org_id, pilot_id, capability) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [orgId, pilotId, capability],
  );
}

/** Grupa klubu wprost w bazie - testy zleceń pytają o rozwinięcie, nie o komendę grup. */
export async function group(db: Queryable, id: string, name: string, memberIds: readonly string[]): Promise<void> {
  await db.query(`INSERT INTO member_groups (id, org_id, name, created_by) VALUES ($1, $2, $3, 'AKO')`, [id, ORG_A, name]);
  for (const pilotId of memberIds) {
    await db.query(`INSERT INTO member_group_members (org_id, group_id, pilot_id) VALUES ($1, $2, $3)`, [ORG_A, id, pilotId]);
  }
}

/** Zamówienie zlecenia z wartościami domyślnymi: SP-AXA, 24 czerwca 10-12, szukany dowódca. */
export function draft(patch: Partial<OrderDraft> = {}): OrderDraft {
  return {
    id: 'o-1',
    aircraftId: 'SP-AXA',
    startsAt: STARTS,
    endsAt: ENDS,
    operation: 'przelot',
    fromIcao: 'EPKK',
    toIcao: 'EPRJ',
    plannedAirMin: 90,
    plannedFuelL: null,
    note: null,
    seats: { pic: 'sought', dual: 'none' },
    audience: { kind: 'per_seat', pic: { pilotIds: ['PWI'], groupIds: [] }, dual: null },
    ...patch,
  };
}

/** Skrzynka osoby: rodzaje i treść, najstarsze pierwsze. */
export async function inbox(db: Queryable, pilotId: string): Promise<Array<{ kind: string; payload: Record<string, unknown> }>> {
  const { rows } = await db.query<{ kind: string; payload: Record<string, unknown> | string }>(
    `SELECT kind, payload FROM notifications WHERE org_id = $1 AND pilot_id = $2 ORDER BY created_at, kind`,
    [ORG_A, pilotId],
  );
  return rows.map((r) => ({ kind: r.kind, payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload }));
}

/** Same rodzaje wiadomości osoby. */
export async function kinds(db: Queryable, pilotId: string): Promise<string[]> {
  return (await inbox(db, pilotId)).map((n) => n.kind);
}

/** Historia zmian zlecenia - same rodzaje, najstarsze pierwsze. */
export async function historyKinds(db: Queryable, orderId: string): Promise<string[]> {
  const { rows } = await db.query<{ kind: string }>(
    `SELECT kind FROM order_changes WHERE org_id = $1 AND order_id = $2 ORDER BY created_at, kind`,
    [ORG_A, orderId],
  );
  return rows.map((r) => r.kind);
}
