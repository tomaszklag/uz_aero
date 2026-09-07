/**
 * UZ Aero - panel 2.0: odmowa serwera na koncie -> zdanie po polsku.
 *
 * `Record<PilotRefusalDto, …>` jest tu KLUCZOWY: powód odmowy dopisany na serwerze
 * (`server/src/domain/accountGuards.ts`) wywala kompilację panelu, zamiast pokazać
 * klientowi klubu surowe `last_admin`. Rozjazdu samej unii pilnuje `test/mirrors.test.ts`
 * - te dwa mechanizmy razem znaczą, że nowa reguła MUSI dostać polskie zdanie, zanim
 * panel się w ogóle zbuduje.
 *
 * == KAZDE ZDANIE MOWI, CO ZROBIC ==
 * Odmowa jest zasadą, nie awarią - więc obok „dlaczego nie" stoi „jak inaczej".
 * Bez tego administrator patrzy na przycisk, który nic nie robi, i sięga po psql.
 */

import type { FleetRefusalDto, PilotRefusalDto } from '../../api/dto';

const REFUSALS: Record<PilotRefusalDto, string> = {
  self_deactivate: 'To Twoje konto - nie możesz wyłączyć sobie dostępu.',
  self_demote: 'To Twoje konto - nie możesz odebrać sobie roli administratora.',
  last_admin: 'To jedyny administrator w klubie. Nadaj tę rolę komuś jeszcze.',
  inactive_account: 'Konto jest wyłączone - najpierw je włącz.',
  self_delete: 'To Twoje konto - nie możesz go usunąć.',
  account_active: 'Najpierw wyłącz konto.',
  has_history: 'To konto ma zapisane loty - możesz je tylko wyłączyć.',
};

/**
 * Powody blokujące USUNIĘCIE, które ekran zna sam - bez pytania serwera.
 *
 * `account_active` widać z listy (konto ma plakietkę „Aktywny"), więc stoi w przycisku
 * jako powód, zanim ktokolwiek go naciśnie. `has_history` jest faktem o bazie i wraca
 * dopiero odmową - panel nie ma jak go przewidzieć, a lista nie niesie liczby lotów.
 */
export const ACCOUNT_ACTIVE = REFUSALS.account_active;

/** Własne konto - ten sam powód, co odmowa `self_delete`, tylko krótszy w przycisku. */
export const SELF_ACCOUNT = 'To Twoje konto.';

/**
 * `null` dla powodów, które na tym ekranie nie mają prawa się pojawić (odmowy floty).
 *
 * Unia odmów jest wspólna dla całego panelu, bo niesie ją jedno pole odpowiedzi - więc
 * zamiast rzutowania typu, które kłamie kompilatorowi, ekran dostaje uczciwe „nie znam
 * tego powodu" i pokazuje zdanie ogólne.
 */
export function accountRefusalMessage(reason: PilotRefusalDto | FleetRefusalDto): string | null {
  return reason in REFUSALS ? REFUSALS[reason as PilotRefusalDto] : null;
}

/** Zajęte pole (`409 conflict`) -> zdanie przy TYM polu, nie baner nad formularzem. */
const CONFLICTS: Record<'code' | 'email', string> = {
  code: 'Ten kod ma już inny pilot.',
  email: 'Ten e-mail należy do innego konta.',
};

export function accountConflictMessage(field: 'code' | 'email' | 'reg' | null): string | null {
  // `reg` przychodzi z floty i na tym ekranie nie ma prawa się pojawić - ale unia
  // odmowy jest wspólna dla całego panelu, więc obsługujemy to milczeniem zamiast
  // rzucania wyjątku w formularzu, który klient właśnie wypełnia.
  if (field == null || field === 'reg') return null;
  return CONFLICTS[field];
}
