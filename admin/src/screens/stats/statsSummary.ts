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
  'Suma sesji zdanych w zakresie. Każda liczba to złożenie projekcji `projectSession` z pojedynczych sesji — panel sumuje gotowe wyniki, nie liczy własnych metryk.';

/**
 * Oś zakresu jest INNA niż na liście dni: A02 stawia sesję pod chwilą PRZEJĘCIA, A10
 * sumuje po dniu ZDANIA maszyny. Obie osie są udokumentowane i celowe — zdanie stoi
 * w podtytule, żeby ta sama para dat dająca inny zbiór sesji nie wyglądała na błąd
 * którejś z list. Po §3.6a rozjazd bywa realny: zmiana wieczorna przejęta 30 JUL bywa
 * zdana 31 JUL nad ranem.
 */
const CLOSE_AXIS =
  'Sumy liczą się po dniu zdania samolotu, więc zbiór sesji może różnić się od listy dni z tym samym zakresem — tam sesja stoi pod chwilą przejęcia.';

/** Podtytuł strony: konstytucja ekranu, oś zakresu i zdania o dniach otwartych. */
export function statsPageSub(totals: StatsTotalsDto | null): string {
  const head = `${CONSTITUTION} ${CLOSE_AXIS}`;
  if (totals == null) return head;

  const open = totals.openSessionsInRange;
  const undated = totals.openSessionsUndated;
  const parts = [head];

  if (open === 0 && undated === 0) {
    parts.push('W zakresie nie ma sesji jeszcze otwartych.');
  }
  if (open > 0) {
    parts.push(
      `${open} ${plural(open, 'sesja jest', 'sesje są', 'sesji jest')} celowo poza zakresem, bo maszyny jeszcze nie zdano i sumy zmieniłyby się po zdaniu.`,
    );
  }
  // Sesja BEZ `session_claim` nie ma daty, więc nie należy do ŻADNEGO zakresu. Po
  // migracji 21 to już nie „telefon padł przed preflightem" (taka sesja ma dziś datę
  // z claimu i jest zwykłą sesją w toku), tylko POŁAMANY STRUMIEŃ — §4.4 mówi, że
  // każda sesja zaczyna się claimem. W zdrowym klubie ta liczba stoi na zerze.
  if (undated > 0) {
    parts.push(
      `${undated} ${plural(undated, 'otwarta sesja nie ma', 'otwarte sesje nie mają', 'otwartych sesji nie ma')} zdarzenia \`session_claim\` — rejestr niekompletny, więc bez daty ${plural(undated, 'liczy się', 'liczą się', 'liczy się')} przy każdym zakresie.`,
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
