/**
 * UZ Aero - panel 2.0: SŁOWNIK zgłoszeń błędów (issue #87).
 *
 * Moduł CZYSTY (bez Reacta, bez sieci), bo to jest decyzja o TREŚCI ekranu, a nie
 * o jego układzie - i dlatego ma test obok. Serwer nie zna języka interfejsu
 * (`server/src/domain/adminActions.ts`): przysyła kody, a nazwy i kolory są tutaj.
 */

import type { BugSeverityDto, BugStatusDto } from '../../api/dto';
import type { PillTone } from '../../ui/components';

/**
 * Kolejność JEST kolejnością filtrów na ekranie: od tego, co wymaga uwagi, do archiwum.
 * Lista ma pokazywać robotę, nie historię.
 */
export const BUG_STATUS_ORDER: readonly BugStatusDto[] = [
  'new',
  'in_progress',
  'resolved',
  'rejected',
];

/**
 * Widok domyślny: NOWE i W TOKU.
 *
 * Nie „wszystkie": po tygodniu testów archiwum przykryje to, co jeszcze nie zrobione,
 * a filtr, którego trzeba użyć, żeby zobaczyć robotę, jest filtrem ustawionym źle.
 */
export const BUG_WORKING_STATUSES: readonly BugStatusDto[] = ['new', 'in_progress'];

const STATUS_LABELS: Record<BugStatusDto, string> = {
  new: 'Nowe',
  in_progress: 'W toku',
  resolved: 'Rozwiązane',
  rejected: 'Odrzucone',
};

/**
 * Kolory statusu.
 *
 * Błękit dla NOWYCH, bo to informacja, a nie alarm - zgłoszenie jest normalnym
 * skutkiem testów. Bursztyn dla „w toku": stan przejściowy, ktoś przy tym siedzi.
 * Zieleń dla rozwiązanych. Odrzucone są WYGASZONE, nie czerwone: czerwień znaczy
 * w tym systemie błąd, a odrzucenie jest decyzją, nie awarią.
 */
const STATUS_TONES: Record<BugStatusDto, PillTone> = {
  new: 'blue',
  in_progress: 'amber',
  resolved: 'green',
  rejected: 'dim',
};

export const bugStatusLabel = (status: BugStatusDto): string => STATUS_LABELS[status];
export const bugStatusTone = (status: BugStatusDto): PillTone => STATUS_TONES[status];

/**
 * Opis statusu w liście wyboru - CO ZNACZY, a nie jak się nazywa (nazwa stoi obok).
 *
 * „Odrzucone" niesie przy okazji wymóg komentarza, bo to jest jedyne miejsce, w którym
 * człowiek dowie się o nim ZANIM kliknie i dostanie odmowę.
 */
const STATUS_DESCRIPTIONS: Record<BugStatusDto, string> = {
  new: 'Wraca na listę roboczą',
  in_progress: 'Ktoś się tym zajmuje',
  resolved: 'Poprawione - zejdzie z listy roboczej',
  rejected: 'To nie jest błąd albo nie teraz - wymaga komentarza',
};

export const bugStatusDescription = (status: BugStatusDto): string => STATUS_DESCRIPTIONS[status];

const SEVERITY_LABELS: Record<BugSeverityDto, string> = {
  blocking: 'Blokuje',
  annoying: 'Utrudnia',
  minor: 'Drobiazg',
};

/**
 * Ton wagi. `blocking` czerwony, bo pilot nie mógł pracować - to jedyny stopień,
 * który znaczy „aplikacja stanęła". `minor` wygaszony: nie ma po co świecić przy
 * większości wierszy (reguła SyncChipa - plakietka widoczna zawsze niczego nie mówi).
 */
const SEVERITY_TONES: Record<BugSeverityDto, PillTone> = {
  blocking: 'red',
  annoying: 'amber',
  minor: 'dim',
};

export const bugSeverityLabel = (severity: BugSeverityDto): string => SEVERITY_LABELS[severity];
export const bugSeverityTone = (severity: BugSeverityDto): PillTone => SEVERITY_TONES[severity];

/**
 * Czy zmiana statusu jest gotowa do zapisu - i dlaczego nie, jeśli nie jest.
 *
 * Reguła jest DWUCZĘŚCIOWA i obie połowy są potrzebne: zapis bez zmiany niczego nie
 * wnosi (a zostawiłby wpis w dzienniku audytu o niczym), a odrzucenie bez komentarza
 * łamie regułę redakcyjną, którą egzekwuje też serwer. Powód wraca NAPISEM, bo przycisk
 * panelu pokazuje powód blokady - ta sama zasada, co w aplikacji pilota (issue #55).
 */
export function bugStatusBlocker(
  current: BugStatusDto,
  next: BugStatusDto,
  note: string,
  currentNote: string | null,
): string | null {
  const trimmed = note.trim();
  if (next === 'rejected' && trimmed === '') return 'Odrzucenie wymaga komentarza';
  if (next === current && trimmed === (currentNote ?? '')) return 'Nic się nie zmieniło';
  return null;
}
