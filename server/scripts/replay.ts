/**
 * UZ Aero — replay śladu kalibracyjnego przez detektor (faza 5).
 *
 *   npx tsx scripts/replay.ts traces/sess-1.ndjson [ELEWACJA_FT]
 *
 * Czyta NDJSON z `POST /traces`, puszcza surowe fixy przez TEN SAM `runDetector`,
 * który działa w telefonie, i zestawia wynik z markerami z lotu (detekcja pokazana /
 * COFNIJ pilota). Kalibracja progów = edycja `overrides` niżej i ponowny bieg —
 * na prawdziwych nagraniach, nie na dyskusji.
 *
 * Elewacja pola: druga kolumna wywołania albo mediana wysokości z pierwszych fixów
 * na postoju (GS < próg kołowania) — tak samo „z ziemi", jak robi to ENGINE START.
 */

import { readFileSync } from 'node:fs';

import {
  GPS_THRESHOLDS,
  TAXI_SPEED_KT,
  createDetectorState,
  runDetector,
  type GpsFix,
} from '@uzaero/domain';

// ── progi do eksperymentów: nadpisz wybrane i porównaj wynik ─────────────────
const overrides: Partial<typeof GPS_THRESHOLDS> = {
  // TAKEOFF_SPEED_KT: 45,
};

interface TraceLine {
  kind: string;
  time: number;
  gs?: number | null;
  alt?: number | null;
  trackDeg?: number | null;
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  detail?: string | null;
  // Kanały czujników pokładowych (kind: 'sensor'). Detektor ich NIE czyta — replay
  // tylko podsumowuje, co się nagrało, żeby było widać, czy materiał do strojenia
  // barometru i inercji w ogóle jest.
  pressureHpa?: number | null;
  accelMean?: number | null;
  accelMax?: number | null;
  vibrationRms?: number | null;
  gyroMean?: number | null;
  gyroMax?: number | null;
  imuSamples?: number | null;
}

const [, , file, elevArg] = process.argv;
if (!file) {
  console.error('użycie: npx tsx scripts/replay.ts <plik.ndjson> [elewacja_ft]');
  process.exit(1);
}

const lines: TraceLine[] = readFileSync(file, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as TraceLine);

const fixes: GpsFix[] = lines
  .filter((l) => l.kind === 'fix')
  .map((l) => ({
    time: l.time,
    // `?? null`, NIE `?? 0`: brak prędkości w nagraniu znaczy „odbiornik nie podał",
    // a nie „samolot stał". Zerowanie tutaj kłamałoby detektorowi dokładnie tym samym
    // kłamstwem, które w adapterze telefonu psuło wykrywanie kołowania.
    groundSpeedKt: l.gs ?? null,
    altitudeFt: l.alt ?? null,
    trackDeg: l.trackDeg ?? null,
    lat: l.lat ?? null,
    lon: l.lon ?? null,
    accuracyM: l.accuracyM ?? null,
  }))
  .sort((a, b) => a.time - b.time);

const markers = lines.filter((l) => l.kind === 'detection' || l.kind === 'undo');
const sensors = lines.filter((l) => l.kind === 'sensor');

// Elewacja: argument albo mediana wysokości fixów na postoju.
const stationaryAlts = fixes
  .filter((f) => (f.groundSpeedKt ?? 0) < TAXI_SPEED_KT && f.altitudeFt != null)
  .map((f) => f.altitudeFt as number)
  .sort((a, b) => a - b);
const elevation =
  elevArg != null
    ? Number(elevArg)
    : stationaryAlts.length > 0
      ? stationaryAlts[Math.floor(stationaryAlts.length / 2)]!
      : null;

const thresholds = { ...GPS_THRESHOLDS, ...overrides };
const { detections } = runDetector(createDetectorState(elevation), fixes, thresholds);

const hhmmss = (t: number) => new Date(t).toISOString().slice(11, 19);

console.log(`plik: ${file}`);
console.log(`fixy: ${fixes.length} · markery z lotu: ${markers.length} · elewacja: ${elevation ?? 'brak'} ft`);
console.log(`progi nadpisane: ${Object.keys(overrides).length > 0 ? JSON.stringify(overrides) : 'brak (produkcyjne)'}`);
console.log('\n— detekcje replayu —');
// `at` = kiedy się WYDARZYŁO (retro-datowane), `confirmedAt` = kiedy algorytm się
// dowiedział. Różnica to opóźnienie detekcji i przy kalibracji jest osobno interesująca:
// to ona pokazuje, ile okna potwierdzenia da się jeszcze wydłużyć bez kosztu.
for (const d of detections) {
  const lagSec = ((d.confirmedAt - d.at) / 1000).toFixed(0);
  console.log(`  ${hhmmss(d.at)}  ${d.detection.padEnd(8)} (potwierdzone +${lagSec}s)`);
}
if (detections.length === 0) console.log('  (żadnych)');

console.log('\n— markery z lotu (toast / COFNIJ pilota) —');
for (const m of markers) console.log(`  ${hhmmss(m.time)}  ${m.kind}  ${m.detail ?? ''}`);
if (markers.length === 0) console.log('  (żadnych)');

// ── czujniki pokładowe ───────────────────────────────────────────────────────
// Nie wchodzą do detekcji (decyzja: progi po fazie 5, z nagrań). Podsumowanie ma
// odpowiedzieć na jedno pytanie: czy materiał do strojenia w tym locie w ogóle jest.
if (sensors.length > 0) {
  const span = (key: keyof TraceLine) => {
    const values = sensors
      .map((s) => s[key])
      .filter((v): v is number => typeof v === 'number');
    if (values.length === 0) return 'brak';
    return `${Math.min(...values).toFixed(2)} … ${Math.max(...values).toFixed(2)} (n=${values.length})`;
  };

  console.log('\n— czujniki pokładowe (materiał na fazę 5, poza detekcją) —');
  console.log(`  okien:            ${sensors.length}`);
  console.log(`  ciśnienie [hPa]:  ${span('pressureHpa')}`);
  console.log(`  |a_lin| śr [m/s²]: ${span('accelMean')}`);
  console.log(`  wibracje [m/s²]:  ${span('vibrationRms')}`);
  console.log(`  |ω| śr [°/s]:     ${span('gyroMean')}`);
}

// Zderzenie: detekcja replayu bez pary w markerach = zmiana zachowania progów.
//
// Porównujemy WYŁĄCZNIE start i lądowanie: markery powstają przy pokazaniu toastu, a
// kołowanie toastu nie ma (zapisuje się od razu, bo nie wyznacza żadnego czasu w
// dokumentach). Zestawianie kołowania z markerami dawało więc ostrzeżenie przy każdym
// poprawnym nagraniu — czyli szum tam, gdzie narzędzie ma sygnalizować regresję.
const near = (a: number, b: number) => Math.abs(a - b) <= 15_000;
const unmatched = detections.filter(
  (d) =>
    d.detection !== 'taxi' &&
    !markers.some((m) => m.detail === d.detection && near(m.time, d.at)),
);
if (unmatched.length > 0) {
  console.log('\n⚠ detekcje bez odpowiednika w markerach lotu (±15 s):');
  for (const d of unmatched) console.log(`  ${hhmmss(d.at)}  ${d.detection}`);
}
