/**
 * UZ Aero — przebieg analityki zużycia po REALNEJ historii (kalibracja progów).
 *
 *   DATABASE_URL=... npx tsx scripts/consumptionReplay.ts [REJESTRACJA]
 *
 * ══ PO CO ══
 * Progi w `packages/domain/src/consumption/policy.ts` pochodzą z rozumowania
 * o dokładności paliwomierza, nie z lotów. Testy jednostkowe dowodzą, że matematyka
 * odzyskuje stawki, które w nią włożono — i nic poza tym. Odpowiedź na pytanie „czy te
 * progi pasują do tego, jak ten klub NAPRAWDĘ lata" mogą dać wyłącznie prawdziwe dni.
 *
 * Ten skrypt jest do analityki tym, czym `replay.ts` do detekcji: puszcza dane przez
 * DOKŁADNIE TEN SAM kod, który wykonuje serwer, i wypisuje nie tylko wynik, ale też
 * materiał do oceny progów — rozkład długości interwałów, powody odrzuceń, względną
 * szerokość przedziałów. Kalibracja = zmiana progu i ponowny bieg, nigdy dyskusja.
 *
 * Czyta bazę WYŁĄCZNIE do odczytu; niczego nie zapisuje.
 */

import { Pool } from 'pg';

import {
  MIN_INTERVAL_ENGINE_MS,
  MIN_PUBLISH_ENGINE_MS,
  MIN_PUBLISH_INTERVALS,
  MAX_RELATIVE_CI,
  buildFuelIntervals,
  consumptionSummary,
  fitConsumptionModel,
  fitMhModel,
  type FuelInterval,
  type MhEquation,
} from '@uzaero/domain';

import { PgEventsStore } from '../src/infrastructure/pg/common/eventsStore.ts';
import { PgAdminConsumptionRepo } from '../src/infrastructure/pg/admin/consumptionRepo.ts';
import { FsPhaseTimeline } from '../src/infrastructure/traces/fsPhaseTimeline.ts';
import { FsTraceSource } from '../src/infrastructure/traces/fsTraceSource.ts';

const HOUR_MS = 3_600_000;
const YEAR_MS = 365 * 86_400_000;

const only = process.argv[2]?.toUpperCase() ?? null;

const connectionString = process.env.DATABASE_URL;
if (connectionString == null) {
  console.error('Brak DATABASE_URL — skrypt czyta bazę, którą wskażesz w środowisku.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const events = new PgEventsStore();
const consumption = new PgAdminConsumptionRepo();

// Osie faz pionowych ze śladów — bez nich model stoi na dwóch fazach. Katalog jak
// w produkcji; pliki poboczne powstaną przy pierwszym biegu i przyspieszą następne.
const tracesDir = process.env.TRACES_DIR ?? './traces';
const phases = new FsPhaseTimeline(tracesDir, new FsTraceSource(tracesDir));

/** Okno: rok wstecz — kalibracja ma widzieć wszystko, co jest, a nie domyślne 90 dni. */
const now = Date.now();
const range = { fromMs: now - YEAR_MS, toMs: now };

const fleet = await pool.query<{ id: string; reg: string; type: string }>(
  'SELECT id, reg, type FROM aircraft ORDER BY reg',
);

console.log('═'.repeat(78));
console.log('PRZEBIEG ANALITYKI ZUŻYCIA — okno 365 dni wstecz');
console.log(`progi: publikacja ≥ ${MIN_PUBLISH_INTERVALS} interwałów i ≥ ${MIN_PUBLISH_ENGINE_MS / HOUR_MS} h silnika`);
console.log(`       interwał ≥ ${MIN_INTERVAL_ENGINE_MS / 60_000} min · rozdzielność faz ≤ ±${MAX_RELATIVE_CI * 100}%`);
console.log('═'.repeat(78));

let anyPublished = false;

for (const aircraft of fleet.rows) {
  if (only != null && aircraft.reg.toUpperCase() !== only) continue;

  const page = await consumption.closedSessions(pool, aircraft.id, range, 1000);
  const streams = await events.sessionStreams(
    pool,
    page.sessions.map((s) => s.sessionUuid),
  );

  const intervals: FuelInterval[] = [];
  const equations: MhEquation[] = [];
  for (const session of page.sessions) {
    const stream = streams.get(session.sessionUuid) ?? [];
    if (stream.length === 0) continue;
    const extracted = buildFuelIntervals(stream, {
      phaseTimeline: await phases.read(session.sessionUuid),
    });
    intervals.push(...extracted.intervals);
    if (extracted.mh != null) equations.push(extracted.mh);
  }

  console.log(`\n${'─'.repeat(78)}`);
  console.log(`${aircraft.reg} · ${aircraft.type}`);
  console.log(`${'─'.repeat(78)}`);
  console.log(`  dni zamkniętych:      ${page.sessions.length}`);
  console.log(`  interwałów surowych:  ${intervals.length}`);

  if (intervals.length === 0) {
    console.log('  (żadnego interwału — brak par odczytów paliwomierza)');
    continue;
  }

  // ── co odpadło i dlaczego ────────────────────────────────────────────────
  const byReason = new Map<string, number>();
  for (const interval of intervals) {
    if (interval.rejected == null) continue;
    byReason.set(interval.rejected, (byReason.get(interval.rejected) ?? 0) + 1);
  }
  const accepted = intervals.filter((i) => i.rejected == null);
  console.log(`  przyjętych:           ${accepted.length}`);
  for (const [reason, count] of byReason) {
    console.log(`    odrzucone (${reason}): ${count}`);
  }

  // ── rozkład długości: czy próg 30 min jest w dobrym miejscu ──────────────
  const lengths = intervals.map((i) => i.engineMs / HOUR_MS).sort((a, b) => a - b);
  const q = (p: number) => lengths[Math.min(lengths.length - 1, Math.floor(p * lengths.length))] ?? 0;
  console.log(
    `  długość interwału [h]: min ${lengths[0]?.toFixed(2)} · med ${q(0.5).toFixed(2)} · max ${lengths[lengths.length - 1]?.toFixed(2)}`,
  );

  const traced = intervals.filter((i) => i.climbMs != null).length;
  console.log(`  ze śladem GPS:        ${traced} / ${intervals.length}`);

  const summary = consumptionSummary(intervals);
  console.log(
    `  Σ paliwa: ${summary.litersTotal.toFixed(0)} L · Σ silnika: ${(summary.engineMs / HOUR_MS).toFixed(1)} h · Σ lotu: ${(summary.flightMs / HOUR_MS).toFixed(1)} h`,
  );
  console.log(
    `  L/h bloku: ${fmt(summary.litersPerBlockHour)} · L/h lotu: ${fmt(summary.litersPerFlightHour)} · L/lot: ${fmt(summary.litersPerFlight)}`,
  );
  console.log(
    `  pasmo (norma dla apki): ${fmt(summary.blockLPerHP10)} – ${fmt(summary.blockLPerHP90)} L/h`,
  );

  // ── model paliwa ─────────────────────────────────────────────────────────
  const model = fitConsumptionModel(intervals);
  console.log(`\n  MODEL PALIWA: ${model.published ? 'OPUBLIKOWANY' : 'poniżej progu'}`);
  if (!model.published) {
    console.log(
      `    brakuje: ${model.gate.missingIntervals} interwałów, ${(model.gate.missingEngineMs / HOUR_MS).toFixed(1)} h silnika`,
    );
  } else {
    anyPublished = true;
    console.log(`    zestaw faz: ${model.phaseSet} (zejście: ${model.degradedBecause})`);
    for (const rate of model.rates) {
      const rel =
        rate.ciHalfWidth != null && rate.lPerH > 0
          ? ` (±${((rate.ciHalfWidth / rate.lPerH) * 100).toFixed(0)}%)`
          : '';
      const ci = rate.pinned
        ? `przypięta do 0${rate.ciHalfWidth == null ? '' : `, ≤ ${rate.ciHalfWidth.toFixed(1)}`}`
        : rate.ciHalfWidth == null
          ? 'bez przedziału'
          : `±${rate.ciHalfWidth.toFixed(1)}${rel}`;
      console.log(
        `      ${rate.phase.padEnd(8)} ${rate.lPerH.toFixed(1).padStart(6)} L/h   ${ci}   [VIF ${fmtVif(rate.varianceInflation)}, ${(rate.hoursInWindowMs / HOUR_MS).toFixed(1)} h]`,
      );
    }
    console.log(
      `    równań: ${model.equations} · df: ${model.degreesOfFreedom} · σ: ${fmt(model.residualSigmaL)} L · R²: ${fmt(model.rSquaredUncentered)}`,
    );
    if (model.outliers.length > 0) {
      console.log(`    odstających: ${model.outliers.length}`);
      for (const outlier of model.outliers.slice(0, 5)) {
        console.log(
          `      ${new Date(outlier.startAt).toISOString().slice(0, 16)}  ${outlier.consumedL.toFixed(0)} L / ${(outlier.engineMs / HOUR_MS).toFixed(2)} h = ${(outlier.consumedL / (outlier.engineMs / HOUR_MS)).toFixed(1)} L/h`,
        );
      }
    }
  }

  // ── model motogodzin ─────────────────────────────────────────────────────
  const mh = fitMhModel(equations);
  console.log(`\n  MOTOGODZINY: ${mh.published ? `licznik ${mh.kind}` : 'poniżej progu'}`);
  console.log(`    równań: ${mh.equations} (odrzuconych: ${mh.rejected})`);
  if (mh.published) {
    console.log(
      `    w locie: ${fmt(mh.perFlightHour)} ±${fmt(mh.perFlightCi)} · na ziemi: ${fmt(mh.perGroundHour)} ±${fmt(mh.perGroundCi)} · σ ${fmt(mh.residualSigmaH)} h`,
    );
  }
}

console.log(`\n${'═'.repeat(78)}`);
if (!anyPublished) {
  console.log('⚠ ŻADEN samolot nie przeszedł bramki publikacji — sprawdź, czy to brak');
  console.log('  danych, czy progi ustawione za wysoko względem realnego tempa lotów.');
}
console.log('Kalibracja: zmień próg w packages/domain/src/consumption/policy.ts i powtórz bieg.');

await pool.end();

function fmt(value: number | null): string {
  return value == null ? '—' : value.toFixed(2);
}

/** VIF bywa `NaN` dla stawki przypiętej — wtedy nie ma czego pokazać. */
function fmtVif(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '—';
}
