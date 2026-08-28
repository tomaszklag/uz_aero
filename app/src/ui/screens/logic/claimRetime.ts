/**
 * UZ Aero — PRZESUNIĘCIE GODZINY PRZEJĘCIA (issue #43, uwaga z urządzenia).
 *
 * ══ PROBLEM ══
 * Godzina przejęcia jest zwykłym faktem („wziąłem samolot o 9:00, nie o 8:04") i pilot
 * musi umieć ją sprostować. Ale przejęcie nie jest zdarzeniem samotnym: OTWIERA sesję,
 * więc nie może wypaść PO uruchomieniu silnika — maszyna nie mogła ruszyć, zanim ktoś
 * ją wziął.
 *
 * ══ ROZSTRZYGNIĘCIE ══
 * Poprawka w tył (wcześniej) jest zawsze bezpieczna — przejęcie po prostu odsuwa się od
 * biegu. Poprawka w przód, ZA uruchomienie silnika, pociąga za sobą CAŁY BIEG: wszystkie
 * zdarzenia przesuwają się o tyle, żeby uruchomienie wypadło dokładnie w nowej godzinie
 * przejęcia. To jest decyzja użytkownika, nie domysł — i dlatego ekran mówi o niej wprost,
 * ZANIM pilot zapisze („wszystkie zdarzenia zostaną przesunięte, a nowa godzina
 * uruchomienia będzie właśnie tą godziną").
 *
 * ══ CZEGO KASKADA NIE RUSZA ══
 * `day_close`. Od niego liczy się 24-godzinne okno korekty, więc przesuwanie go własną
 * poprawką pozwalałoby pilotowi przedłużyć sobie termin — regułę, która ma go ograniczać.
 * Gdyby przesunięty bieg miał wyjść POZA zdanie samolotu, kaskady nie ma w ogóle:
 * odmawiamy z powodem, zamiast produkować sesję, w której silnik pracuje po oddaniu
 * maszyny.
 *
 * Moduł jest CZYSTY: liczy plan, a zapisem (N korekt `retime`) zajmuje się `useSessionEdit`.
 */

import { applyCorrections } from '../../../domain';
import type { Event, SessionState } from '../../../domain';
import { timeUtc } from '../../format';

/** Jedno przestawienie: zdarzenie i jego nowy czas. */
export interface RetimeStep {
  uuid: string;
  newTime: number;
}

export type ClaimRetimePlan =
  /** Nic do zrobienia — pilot nie ruszył godziny. */
  | { kind: 'unchanged' }
  /** Sama godzina przejęcia; reszta sesji zostaje na miejscu. */
  | { kind: 'simple'; steps: RetimeStep[] }
  /** Przejęcie POCIĄGA bieg: wszystkie zdarzenia przesuwają się o `deltaMs`. */
  | { kind: 'cascade'; steps: RetimeStep[]; deltaMs: number; note: string }
  /** Godziny nie da się zapisać — z podanym powodem. */
  | { kind: 'refused'; note: string };

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1). */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

/** Zdarzenia BIEGU — te, które kaskada przesuwa. `day_close` świadomie poza listą. */
const CASCADED: readonly Event['type'][] = [
  'preflight_confirm',
  'engine_start',
  'taxi',
  'takeoff',
  'landing',
  'drop',
  'boarding',
  'refuel',
  'oil_add',
  'crew_change',
  'manual_log_entry',
  'engine_stop',
];

/**
 * Plan korekty godziny przejęcia.
 *
 * @param state      projekcja sesji (klamra biegu, zdanie samolotu),
 * @param events     surowy strumień — korekty nakładamy tutaj,
 * @param claimUuid  uuid `session_claim` (adres korekty),
 * @param newTime    godzina wybrana przez pilota.
 */
export function claimRetimePlan(
  state: SessionState,
  events: readonly Event[],
  claimUuid: string,
  newTime: number,
): ClaimRetimePlan {
  const effective = applyCorrections(events);
  const claim = effective.find((e) => e.uuid === claimUuid);
  if (claim == null) return { kind: 'refused', note: 'Nie znaleziono zdarzenia przejęcia.' };
  if (at(claim) === newTime) return { kind: 'unchanged' };

  const engineStartAt = state.legs[0]?.startedAt ?? null;

  // Sesja bez pracy silnika (09C) nie ma czego ciągnąć — sama godzina i tyle.
  if (engineStartAt == null || newTime <= engineStartAt) {
    return { kind: 'simple', steps: [{ uuid: claimUuid, newTime }] };
  }

  const deltaMs = newTime - engineStartAt;

  // Zdanie samolotu zostaje na miejscu, więc bieg musi się w nim zmieścić.
  if (state.closedAt != null) {
    const lastRunAt = Math.max(
      ...effective.filter((e) => CASCADED.includes(e.type)).map((e) => at(e)),
      engineStartAt,
    );
    if (lastRunAt + deltaMs > state.closedAt) {
      return {
        kind: 'refused',
        note:
          `Przy tej godzinie bieg silnika kończyłby się po zdaniu samolotu ` +
          `(${timeUtc(state.closedAt)}). Cofnij przejęcie albo popraw najpierw czas ` +
          `wyłączenia silnika.`,
      };
    }
  }

  const steps: RetimeStep[] = [{ uuid: claimUuid, newTime }];
  for (const event of effective) {
    if (!CASCADED.includes(event.type)) continue;
    steps.push({ uuid: event.uuid, newTime: at(event) + deltaMs });
  }

  return {
    kind: 'cascade',
    steps,
    deltaMs,
    note:
      `Przejęcie wypada po uruchomieniu silnika, więc przesuniemy CAŁY bieg o ` +
      `${Math.round(deltaMs / 60_000)} min: uruchomienie stanie się ${timeUtc(newTime)}, ` +
      `a starty, lądowania i zrzuty pojadą za nim. Zdanie samolotu zostaje bez zmian.`,
  };
}
