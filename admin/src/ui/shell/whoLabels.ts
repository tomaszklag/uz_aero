/**
 * UZ Aero — panel: napisy stopki sidebara (moduł CZYSTY, testowany bez DOM-u).
 *
 * Wyniesione z komponentu, bo to są DECYZJE o treści — jak nazywamy rolę po polsku
 * i co pokazujemy w awatarze — a nie układ. Ta sama reguła, którą `app/` realizuje
 * przez `screens/*.ts` obok ekranu.
 */

import type { PilotRole } from '../../api/dto';

/**
 * Nazwy ról po polsku, dokładnie jak w mockupie (`.who-role`: „Administrator").
 *
 * Rola `pilot` jest tu mimo że konto pilota nie dostaje sesji panelu: gdyby kiedykolwiek
 * trafiła na ekran (błąd serwera, zmiana mapy uprawnień), napis „Pilot" jest lepszy
 * od surowego identyfikatora, a `Record` bez tej pozycji nie skompilowałby się wcale.
 */
const ROLE_LABELS: Record<PilotRole, string> = {
  pilot: 'Pilot',
  training_lead: 'Szef wyszkolenia',
  admin: 'Administrator',
};

export function roleLabel(role: PilotRole): string {
  return ROLE_LABELS[role];
}

/**
 * Inicjały do awatara (`.who-avatar`: „TM" dla „Tomasz Małkiewicz").
 *
 * Dwa pierwsze człony, wielkimi literami. Jednoczłonowa nazwa daje jedną literę,
 * a nie dwie pierwsze z imienia: „TO" dla „Tomasz" wyglądałoby jak nazwisko,
 * którego nie ma. Pusta nazwa daje pusty awatar zamiast wywalonej strony.
 */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
