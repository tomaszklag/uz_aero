/**
 * Ninerdeck (serwer) - KOGO OBUDZIĆ przy zmianie zlecenia (4.0.0, issue #245;
 * `docs/zlecenia.md` §12).
 *
 * Czyste funkcje nad stanem PO zmianie: komenda liczy zmianę, a tu pada wyłącznie
 * odpowiedź „do kogo". Treść wiadomości składa `notify/orderNotices.ts`.
 *
 * ══ DWIE REGUŁY WSPÓLNE DLA WSZYSTKICH RODZAJÓW ══
 *  1. **sprawca nie budzi sam siebie** (reguła obserwowania samolotu): kto zmienił
 *     zlecenie, ten wie o tym bez wiadomości;
 *  2. **odmowa wycisza** - adresat, który w bieżącej wersji odpowiedział „NIE MOGĘ", nie
 *     dostaje zmian ani odwołania tego zlecenia (§12: „adresaci bez odmowy"). Zmiana
 *     TERMINU tej reguły nie łamie, tylko ją zeruje: podnosi wersję, więc odmowa
 *     „nie mogę w sobotę" przestaje się liczyć - i wtedy pytamy wszystkich od nowa.
 *
 * Wyniki są listami BEZ POWTÓRZEŃ w stałej kolejności (przydzieleni, adresaci, zlecający),
 * żeby test porównywał listy, a nie zbiory.
 */

import { crewComplete } from './orderSeats.ts';
import {
  soughtSeats,
  type OrderCrew,
  type OrderSeats,
  type OrderView,
  type RecipientView,
  type Seat,
} from './orders.ts';

/** Stan zlecenia, na którym liczy się odbiorców - PO zmianie. */
export interface AudienceState {
  authorId: string;
  view: OrderView;
  recipients: readonly RecipientView[];
}

/** Osoby w SZUKANYCH fotelach - przydzieleni (fotel „ja" to zlecający, nie przydział). */
export function assignedPilots(seats: OrderSeats, crew: OrderCrew): string[] {
  return soughtSeats(seats)
    .map((seat) => crew[seat])
    .filter((pilotId): pilotId is string => pilotId != null);
}

/** Adresaci niewykreśleni, bez odmowy w bieżącej wersji (i bez przydzielonych). */
export function openRecipients(state: AudienceState): string[] {
  const seated = new Set(assignedPilots(state.view.seats, state.view.crew));
  return state.recipients
    .filter((r) => !r.removed && r.answer !== 'no' && !seated.has(r.pilotId))
    .map((r) => r.pilotId);
}

/**
 * `order_changed` - zmiana terminu (prośba o ponowną odpowiedź) albo edycja „edytowane".
 * Przy zmianie terminu odpowiedzi poprzedniej wersji się nie liczą, więc pytani są
 * WSZYSCY niewykreśleni (komenda podaje stan już po podniesieniu wersji - bez odpowiedzi).
 */
export function changeAudience(state: AudienceState, actorId: string): string[] {
  return distinct(
    [...assignedPilots(state.view.seats, state.view.crew), ...openRecipients(state), state.authorId],
    actorId,
  );
}

/** `order_cancelled` - ci sami, co przy zmianie: przydzieleni, adresaci bez odmowy, zlecający. */
export function cancelAudience(state: AudienceState, actorId: string): string[] {
  return changeAudience(state, actorId);
}

/**
 * `order_expired` - zegar zamyka zlecenie, więc sprawcy nie ma i zlecający też dostaje
 * wiadomość (§5.5).
 */
export function expireAudience(state: AudienceState): string[] {
  return distinct(
    [...assignedPilots(state.view.seats, state.view.crew), ...openRecipients(state), state.authorId],
    null,
  );
}

/**
 * `order_filled` („Zlecenie nieaktualne") po obsadzeniu fotela `justFilled`:
 *  - adresaci TEGO fotela bez odmowy - ich fotel zajęty;
 *  - osoby z terminem do potwierdzenia i adresaci wspólnej listy - dopiero przy KOMPLECIE,
 *    bo do tego czasu mogą jeszcze trafić na drugi fotel (§4.3).
 * Przydzielony wiadomości „nieaktualne" nie dostaje nigdy - lot jest jego.
 */
export function filledAudience(state: AudienceState, justFilled: Seat): string[] {
  const complete = crewComplete(state.view.seats, state.view.crew);
  const seated = new Set(assignedPilots(state.view.seats, state.view.crew));
  return state.recipients
    .filter((r) => !r.removed && r.answer !== 'no' && !seated.has(r.pilotId))
    .filter((r) => (r.seat == null ? complete : r.seat === justFilled))
    .map((r) => r.pilotId);
}

/** Lista bez powtórzeń i bez sprawcy, w kolejności pierwszego wystąpienia. */
function distinct(pilotIds: readonly string[], actorId: string | null): string[] {
  return [...new Set(pilotIds)].filter((pilotId) => pilotId !== actorId);
}
