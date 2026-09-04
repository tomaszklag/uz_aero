/**
 * UZ Aero - SZLAK TEJ OPERACJI w arkuszach wpisu ręcznego (uwaga z urządzenia,
 * 2026-09-04).
 *
 * Zgłoszenie: „w manualnym locie z paliwem zastanym czemu nie dasz też info, ile
 * użytkownik przejął, ile dolał, ile latał i ile wpisał, że zostało. To samo motogodziny
 * i olej".
 *
 * ══ CZEGO BRAKOWAŁO ══
 * Arkusze wpisu miały już szlak, ale opowiadał WYŁĄCZNIE o sąsiedzie z łańcucha
 * („Poprzedni lot · zdał maszynę z 112 L"). O operacji, którą pilot właśnie wpisuje,
 * nie mówił nic - a to ona jest treścią formularza. Rachunek istniał (werdykt normy
 * i arkusz szczegółów pod plakietką), ale w chwili wpisywania liczby końcowej pilot
 * miał przed sobą pole i nic poza nim: żeby zobaczyć, ile POWINNO zostać, musiał
 * zamknąć arkusz, tapnąć plakietkę i wrócić.
 *
 * ══ TA SAMA FORMA, CO NA 06, 09B I 02A ══
 * Ogniwa: stan zastany → dolewka → ile latano i ile z tego wychodzi z normy → ZIELONE
 * oczekiwanie. Zielone ogniwo paliwa składa `fuelExpectationRow`, czyli dokładnie ta
 * sama funkcja, która pisze je przy tankowaniu, przy zdaniu i przy przejęciu - jedna
 * liczba nie ma prawa nazywać się czterema zdaniami.
 *
 * ══ ANI JEDNEGO NOWEGO RACHUNKU ══
 * Oczekiwanie liczy DOMENA (`expectedFuelL`, `expectedMhH`) - te same wywołania, z których
 * powstaje werdykt na karcie (`manualFlightBalance.ts`). Gdyby szlak liczył po swojemu,
 * pilot dostałby dwie odpowiedzi na jedno pytanie i rozjechałyby się przy pierwszej
 * poprawce jednej z nich (issue #38 usuwało dokładnie taką parę z ekranu 10).
 *
 * ══ CZEGO TU NIE MA ══
 * Szlaku pod polem DOLEWKI: rejestr nie wie, ile pilot zatankował, a ze szkicu wyszłyby
 * dwie liczby stojące w polach obok. Szlaku pod polami POCZĄTKOWYMI też nie - tam pyta
 * się o stan zastany, a odpowiada na to sąsiad z łańcucha (`readingsTrail.ts`).
 *
 * Czysty TypeScript: bez Reacta, bez zegara, bez I/O.
 */

import { expectedFuelL, expectedMhH, type ConsumptionNorm, type MhFormat } from '../../../domain';
import { litres, motoHours } from '../../format';
import type { ManualFlightDraft } from './manualFlight';
import { manualPhaseTimes } from './manualFlightBalance';
import { fuelExpectationRow, hoursMinutes, type FuelTrailRow } from './refuelMath';

/** Ogniwo szlaku - strukturalnie zgodne z `TrailRow` (logika nie importuje z UI). */
export type ManualTrailRow = FuelTrailRow;

/**
 * Szlak pod polem „Paliwo po locie": co pilot zastał, ile dolał, ile latał i ile z tego
 * powinno zostać.
 *
 * @param foundSource podpis pochodzenia stanu zastanego (`prefillSource`) - `null`, gdy
 *   liczba jest wpisem pilota, a nie podpowiedzią z łańcucha.
 * @returns pusta tablica, gdy nie ma o czym opowiadać (brak stanu zastanego): sam czas
 *   biegu bez liczby, od której się odejmuje, nie jest jeszcze historią.
 */
export function manualFuelTrail(
  draft: ManualFlightDraft,
  norm: ConsumptionNorm | null,
  nominalLPerH: number | null,
  foundSource: string | null,
): ManualTrailRow[] {
  const found = draft.fuel.foundL;
  if (found == null) return [];

  const added = draft.fuel.addedL > 0 ? draft.fuel.addedL : 0;
  const times = manualPhaseTimes(draft);
  const expectation = times != null ? expectedFuelL(norm, times, nominalLPerH) : null;

  const rows: ManualTrailRow[] = [
    {
      id: 'found',
      title: `Zastane · ${litres(found)}`,
      meta: foundSource ?? 'Twój odczyt z paliwomierza',
    },
  ];

  if (added > 0) {
    rows.push({
      id: 'added',
      title: `Dolane · +${litres(added)}`,
      meta: `przed lotem w zbiorniku ${litres(found + added)}`,
    });
  }

  if (times != null) {
    rows.push({
      id: 'flown',
      title: `Latano · ${hoursMinutes(times.blockMs)}`,
      meta: [
        `w powietrzu ${hoursMinutes(times.flightMs)}`,
        expectation != null ? `zużycie z normy ~${Math.round(expectation.value)} L` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  if (expectation != null) {
    /* Bez normy modelu (`basis: 'nominal'`, issue #66) okna centyli nie ma i nie wolno
       go udawać - ogniwo powie wtedy „z dokumentacji jednostki". */
    rows.push(
      fuelExpectationRow(
        Math.max(0, Math.round(found + added - expectation.value)),
        expectation.basis === 'nominal' ? null : (norm?.windowDays ?? null),
      ),
    );
  }

  return rows;
}

/**
 * Szlak pod polem „Motogodziny po locie" - ta sama chronologia, co przy paliwie.
 *
 * Zielone ogniwo mówi o STANIE LICZNIKA, nie o samym przyroście: pilot przepisuje z tarczy
 * wskazanie, więc porównuje z liczbą tego samego rodzaju. Przyrost schodzi do linii
 * szczegółów, bo to on jest treścią normy.
 */
export function manualMhTrail(
  draft: ManualFlightDraft,
  norm: ConsumptionNorm | null,
  format: MhFormat,
  beforeSource: string | null,
): ManualTrailRow[] {
  const before = draft.mhBefore;
  if (before == null) return [];

  const times = manualPhaseTimes(draft);
  const expectation = times != null ? expectedMhH(norm, times) : null;

  const rows: ManualTrailRow[] = [
    {
      id: 'before',
      title: `Przed uruchomieniem · ${motoHours(before, format)} MH`,
      meta: beforeSource ?? 'Twój odczyt z licznika',
    },
  ];

  if (times != null) {
    rows.push({
      id: 'flown',
      title: `Latano · ${hoursMinutes(times.blockMs)}`,
      meta: `w powietrzu ${hoursMinutes(times.flightMs)}`,
    });
  }

  if (expectation != null) {
    rows.push({
      id: 'expect',
      tone: 'green',
      title: `Szacunkowo licznik ~${motoHours(before + expectation.value, format)} MH`,
      meta: `przyrost z normy ~${motoHours(expectation.value, format)} - zweryfikuj z licznika`,
    });
  }

  return rows;
}
