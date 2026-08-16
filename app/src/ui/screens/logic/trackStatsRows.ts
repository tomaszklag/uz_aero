/**
 * UZ Aero — STATYSTYKI ŚLADU DO POKAZANIA (issue #47 pkt 3, mockup `14-slad.html`).
 *
 * Domena liczy (`@uzaero/domain` → `track/stats.ts`), ten plik decyduje, co z tego
 * WCHODZI NA EKRAN i w jakiej postaci. Rozdział jest ten sam, co przy rachunku normy
 * (`sessionBalance.ts`): warunek „blok milczy" to decyzja o ekranie, nie o liczbie,
 * a warunek w JSX byłby nie do przetestowania — dokładnie tak przeżyła dziurę reguła
 * „DODAJ LOT RĘCZNIE" przy pustym dniu (issue #42).
 */

import { duration } from '../../format';
import type { TrackStats } from '../../../domain';

export interface StatCell {
  label: string;
  value: string;
  unit?: string;
  tone?: 'green' | 'blue' | 'amber';
}

/** Odcinek paska faz — proporcja i podpis w legendzie. */
export interface PhaseBarSegment {
  key: 'climb' | 'cruise' | 'descent' | 'taxi' | 'standing';
  label: string;
  ms: number;
  /** Kolor z palety motywu, dobierany przez ekran (paleta nie jest tu widoczna). */
  tone: 'green' | 'blue' | 'greenDim' | 'ground' | 'groundDim';
}

export interface TrackStatsView {
  speed: StatCell[] | null;
  phases: { segments: PhaseBarSegment[]; totalMs: number } | null;
  level: { cells: StatCell[]; levelMs: number } | null;
}

/**
 * `null` w każdym bloku znaczy „nie ma czego pokazać" i ekran wtedy MILCZY — nie rysuje
 * karty z kreskami. Brak prędkości nie unieważnia czasów faz i odwrotnie: to trzy różne
 * pytania do tego samego nagrania (reguła z issue #38).
 */
export function trackStatsView(stats: TrackStats): TrackStatsView {
  return {
    speed: speedCells(stats),
    phases: phaseBar(stats),
    level: levelCells(stats),
  };
}

function speedCells(stats: TrackStats): StatCell[] | null {
  const speed = stats.speed;
  if (speed == null) return null;

  return [
    { label: 'Max GS', value: Math.round(speed.maxGroundSpeedKt).toString(), unit: 'kt' },
    {
      label: 'Śr. w locie',
      value: speed.averageInFlightKt == null ? '— —' : Math.round(speed.averageInFlightKt).toString(),
      unit: 'kt',
    },
    {
      label: 'Max wzn.',
      value: fpm(speed.maxClimbFtPerMin),
      unit: 'ft/min',
      tone: 'green',
    },
    { label: 'Max opad.', value: fpm(speed.maxDescentFtPerMin), unit: 'ft/min' },
  ];
}

function phaseBar(stats: TrackStats): { segments: PhaseBarSegment[]; totalMs: number } | null {
  const phases = stats.phases;
  if (phases == null) return null;

  const segments: PhaseBarSegment[] = [
    { key: 'climb', label: 'Wznoszenie', ms: phases.climbMs, tone: 'green' },
    { key: 'cruise', label: 'Przelot', ms: phases.cruiseMs, tone: 'blue' },
    { key: 'descent', label: 'Zniżanie', ms: phases.descentMs, tone: 'greenDim' },
    { key: 'taxi', label: 'Kołowanie', ms: phases.taxiMs, tone: 'ground' },
    { key: 'standing', label: 'Postój', ms: phases.standingMs, tone: 'groundDim' },
  ];

  const totalMs = segments.reduce((sum, segment) => sum + segment.ms, 0);
  if (totalMs <= 0) return null;

  // Faza zerowa wypada Z LEGENDY, ale pasek i tak jej nie narysuje — wiersz „Przelot
  // 0 min" przy dniu skokowym byłby informacją o niczym.
  return { segments: segments.filter((segment) => segment.ms > 0), totalMs };
}

function levelCells(stats: TrackStats): { cells: StatCell[]; levelMs: number } | null {
  const level = stats.level;
  if (level == null) return null;

  return {
    levelMs: level.levelMs,
    cells: [
      { label: 'Pasmo wahań', value: `± ${Math.round(level.bandFt)}`, unit: 'ft' },
      {
        label: 'W ± 100 ft',
        value: Math.round(level.withinToleranceRatio * 100).toString(),
        unit: '%',
        // Zielony DOPIERO powyżej progu: kolor ma znaczyć „dobrze", a nie ozdabiać
        // każdą liczbę (reguła SyncChipa z issue #12).
        tone: level.withinToleranceRatio >= 0.8 ? 'green' : undefined,
      },
      { label: 'Najdł. równy', value: duration(level.longestSteadyMs), unit: 'min' },
    ],
  };
}

/** Prędkość pionowa ze znakiem — „+1 240" czyta się inaczej niż „1 240". */
function fpm(value: number | null): string {
  if (value == null) return '— —';
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded.toLocaleString('pl-PL')}` : rounded.toLocaleString('pl-PL');
}
