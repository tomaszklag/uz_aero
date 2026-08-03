/**
 * UZ Aero — panel: NAGŁÓWEK I CHIP ZAKRESU statystyk (moduł CZYSTY).
 *
 * Podtytuł ekranu jest konstytucją `A10` przepisaną z mockupu — z tym, że liczba dni
 * otwartych przychodzi z serwera, a nie z przykładu. Zdanie stoi w module czystym,
 * bo odmiana i warianty („zakres domyślny", „bez dni otwartych") są decyzją o treści.
 */

import { plural } from '@uzaero/format';

import type { StatsRangeDto, StatsTotalsDto } from '../../api/dto';
import { dayShort, dayShortYear } from './statsFormat';

const CONSTITUTION =
  'Suma dni zamkniętych w zakresie. Każda liczba to złożenie projekcji `projectSession` z pojedynczych sesji — panel sumuje gotowe wyniki, nie liczy własnych metryk.';

/**
 * Oś zakresu jest INNA niż na liście dni: A02 stawia dzień pod duty startem, A10 sumuje
 * po dniu zamknięcia. Obie osie są udokumentowane i celowe — zdanie stoi w podtytule,
 * żeby ta sama para dat dająca inny zbiór dni nie wyglądała na błąd którejś z list.
 */
const CLOSE_AXIS =
  'Sumy liczą się po dniu zamknięcia sesji, więc zbiór dni może różnić się od listy dni z tym samym zakresem — tam dzień stoi pod duty startem.';

/** Podtytuł strony: konstytucja ekranu, oś zakresu i zdania o dniach otwartych. */
export function statsPageSub(totals: StatsTotalsDto | null): string {
  const head = `${CONSTITUTION} ${CLOSE_AXIS}`;
  if (totals == null) return head;

  const open = totals.openSessionsInRange;
  const undated = totals.openSessionsUndated;
  const parts = [head];

  if (open === 0 && undated === 0) {
    parts.push('W zakresie nie ma dni jeszcze otwartych.');
  }
  if (open > 0) {
    parts.push(
      `${open} ${plural(open, 'dzień jeszcze otwarty jest', 'dni jeszcze otwarte są', 'dni jeszcze otwartych jest')} celowo poza zakresem, bo ich sumy zmieniłyby się po zamknięciu.`,
    );
  }
  // Sesja z samym claimem nie ma duty startu, więc nie należy do ŻADNEGO zakresu —
  // zdanie odróżnia ją od dni otwartych w zakresie, zamiast sklejać w jedną liczbę.
  if (undated > 0) {
    parts.push(
      `${undated} ${plural(undated, 'dzień jeszcze otwarty nie ma', 'dni jeszcze otwarte nie mają', 'dni jeszcze otwartych nie ma')} duty startu (sam claim, telefon padł przed preflightem) — bez daty ${plural(undated, 'liczy się', 'liczą się', 'liczy się')} przy każdym zakresie.`,
    );
  }
  return parts.join(' ');
}

/** Chip zakresu: „01 JUL → 30 JUL 2026"; przy różnych latach oba jawnie. */
export function rangeChipLabel(range: StatsRangeDto | null): string {
  if (range == null) return 'zakres — pobieranie';
  const sameYear = range.fromDay.slice(0, 4) === range.toDay.slice(0, 4);
  return sameYear
    ? `${dayShort(range.fromDay)} → ${dayShortYear(range.toDay)}`
    : `${dayShortYear(range.fromDay)} → ${dayShortYear(range.toDay)}`;
}

/** Podpis chipa zakresu — mówi, że kliknięcie wraca do zakresu DOMYŚLNEGO serwera. */
export function rangeChipTitle(range: StatsRangeDto | null): string {
  if (range?.defaulted === true) {
    return 'Zakres domyślny: ostatnie 30 dni kalendarzowych od dziś (zegar serwera).';
  }
  return 'Kliknięcie wraca do zakresu domyślnego (ostatnie 30 dni).';
}
