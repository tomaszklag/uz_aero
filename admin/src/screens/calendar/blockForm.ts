/**
 * Ninerdeck - panel: formularz WYŁĄCZENIA MASZYNY Z UŻYTKU i rezerwacji za pilota
 * (issue #160, D4 i D5).
 *
 * Jeden moduł na dwa formularze, bo różnią się dokładnie dwoma polami: wyłączenie ma
 * powód z katalogu, rezerwacja - pilota i zadanie. Reszta (maszyna, zakres, komentarz)
 * jest wspólna, a dwie kopie tej samej walidacji rozjechałyby się przy pierwszej
 * poprawce jednej z nich.
 *
 * ══ BLOKADA MÓWI POWÓD, ALE TYLKO TEN, KTÓREGO NIE WIDAĆ ══
 * Puste pole wymagane NIE dostaje zdania - widać je z kontrolki nad przyciskiem (reguła
 * z issue #55, ta sama w aplikacji pilota). Zdanie zostaje tam, gdzie blokady z ekranu
 * nie widać: koniec przed początkiem albo termin, który już minął.
 */

import type { BlockReasonDto } from '../../api/dto';

export interface BlockReasonOption {
  value: BlockReasonDto;
  name: string;
  desc: string;
}

export const BLOCK_REASONS: readonly BlockReasonOption[] = [
  { value: 'maintenance', name: 'Przegląd', desc: 'Obsługa okresowa, przegląd 100 h, remont' },
  { value: 'defect', name: 'Usterka', desc: 'Maszyna niezdatna do lotu' },
  { value: 'other', name: 'Inne', desc: 'Wypożyczenie, pokaz, zawody' },
];

export interface BlockDraft {
  aircraftId: string;
  /** `datetime-local`, czyli czas LOKALNY przeglądarki - patrz `toInstant`. */
  from: string;
  to: string;
  reason: BlockReasonDto;
  note: string;
}

export const emptyBlockDraft = (): BlockDraft => ({
  aircraftId: '',
  from: '',
  to: '',
  reason: 'maintenance',
  note: '',
});

export interface BookingDraft {
  aircraftId: string;
  pilotId: string;
  from: string;
  to: string;
  operation: string;
  note: string;
}

export const emptyBookingDraft = (): BookingDraft => ({
  aircraftId: '',
  pilotId: '',
  from: '',
  to: '',
  operation: '',
  note: '',
});

/**
 * Powód blokady zapisu albo `null`.
 *
 * `undefined` znaczy „przycisk nieaktywny, ale bez zdania" - brakujące pole widać
 * z formularza. Napis pada wyłącznie przy stanie, którego z kontrolki nie widać.
 */
export type Blocker = { reason: string } | 'incomplete' | null;

interface Window {
  from: string;
  to: string;
  aircraftId: string;
}

function windowBlocker(draft: Window, now: number): Blocker {
  if (draft.aircraftId === '' || draft.from === '' || draft.to === '') return 'incomplete';

  const from = toInstant(draft.from);
  const to = toInstant(draft.to);
  if (from == null || to == null) return 'incomplete';

  if (to <= from) return { reason: 'Koniec musi być po początku.' };
  // Reguła stoi na KOŃCU terminu, nie na początku - ta sama, co w domenie: wpis
  // zaczynający się kwadrans temu jest normalny, dopiero termin CAŁY miniony nie ma
  // czego opisywać. Serwer odmówiłby `booking_in_past`, więc mówimy to od razu.
  if (to <= now) return { reason: 'Ten termin już minął.' };
  return null;
}

export function blockBlocker(draft: BlockDraft, now: number): Blocker {
  return windowBlocker(draft, now);
}

export function bookingBlocker(draft: BookingDraft, now: number): Blocker {
  if (draft.pilotId === '' || draft.operation === '') return 'incomplete';
  return windowBlocker(draft, now);
}

/**
 * `datetime-local` → chwila bezwzględna.
 *
 * Pole `datetime-local` nie niesie strefy, więc przeglądarka rozumie je jako czas
 * LOKALNY administratora - i to jest właściwe zachowanie: kto wpisuje „16:00", myśli
 * o szesnastej u siebie. Gdy siedzi w innej strefie niż klub, kalendarz pokaże ten wpis
 * w czasie klubu i różnicę widać od razu; udawanie, że pole niesie czas klubu, byłoby
 * cichym przesunięciem wpisu o kilka godzin.
 */
export function toInstant(local: string): number | null {
  if (local === '') return null;
  const parsed = Date.parse(local);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Chwila → wartość `datetime-local` w strefie przeglądarki (bez sekund). */
export function toLocalInput(instant: number): string {
  const d = new Date(instant - new Date(instant).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}
