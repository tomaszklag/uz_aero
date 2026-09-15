/**
 * Ninerdeck - panel: czy zalogowany ma daną zdolność, a jeśli nie - POWÓD do pokazania.
 *
 * Moduł CZYSTY (bez Reacta, bez sieci), bo to jest decyzja o treści ekranu, a nie
 * o jego układzie - i dlatego ma test obok.
 *
 * **To nie jest zabezpieczenie.** Egzekwuje serwer, przy każdym żądaniu, mapą
 * `server/src/domain/roles.ts`. Tutaj rozstrzygamy wyłącznie, czy pozycja nawigacji
 * jest klikalna i co napisać obok kłódki. Ukrycie przycisku nigdy nie było ochroną
 * i tym się nie staje.
 *
 * ══ POZYCJA BEZ UPRAWNIENIA JEST UKRYTA, NIE WYSZARZONA (od 2.0.0) ══
 * Panel 1.0 zostawiał ją widoczną z kłódką, żeby człowiek nie zgadywał, czy funkcji
 * nie ma, czy nie ma jej ON. Panel 2.0 odwrócił tę regułę (`docs/panel-2.0.md` §3.3:
 * brak uprawnień = brak przycisku), a wielofirmowość dała jej trzeci powód: modułu
 * Zgłoszenia w klubie NIE MA WCALE - to kolejka PLATFORMY (issue #99 C6). Kłódka
 * mówiłaby administratorowi klubu, że istnieje ekran, na który mógłby dostać prawo,
 * a takiego prawa nie ma w modelu ról. Pozycje wybiera `navItemsFor` w `ui/shell/nav.ts`.
 */

import type { Capability } from '../api/dto';

export function can(
  capabilities: readonly Capability[] | undefined,
  required: Capability,
): boolean {
  return capabilities?.includes(required) ?? false;
}

/**
 * Kogo prosić o daną zdolność - TEKST DLA CZŁOWIEKA, nie mapa uprawnień.
 *
 * Odpowiada na pytanie, które zadaje sobie ktoś patrzący na wyszarzoną pozycję:
 * „to awaria czy tak ma być, i co mam z tym zrobić". Bez tej odpowiedzi kłódka
 * jest tylko informacją, że coś nie działa.
 *
 * Lustro mapy z serwera - świadome i opisane w `api/dto.ts` przy typie `Capability`.
 * Rozjazd nie może niczego otworzyć ani zamknąć: najgorszy możliwy skutek to zdanie
 * wskazujące złą rolę, i taką cenę płacimy do czasu decyzji z §11 pkt 6 o przeniesieniu
 * `roles.ts` do `@ninerdeck/domain`.
 */
const GRANTED_BY: Record<Capability, string> = {
  'panel.access': 'administrator',
  'flags.resolve': 'administrator',
  'events.correct': 'administrator',
  'accounts.manage': 'administrator',
  'fleet.manage': 'administrator',
  'thresholds.manage': 'administrator',
  'audit.read': 'administrator',
  'maintenance.run': 'administrator',
  // Triaż zgłoszeń przeszedł do PLATFORMY przy issue #99 (C6): opis błędu niesie
  // kontekst okna razem z danymi operacji, a poprawia go jedna osoba dla całego
  // serwera - więc decyzja o cudzym zgłoszeniu nie należy do klubu.
  'bugs.triage': 'superadministrator',
  'platform.manage': 'superadministrator',
};

/** „Wymaga roli: administrator" - dokładnie ten napis nosi `title` w `SZABLON.html`. */
export function denialReason(required: Capability): string {
  return `Wymaga roli: ${GRANTED_BY[required]}`;
}
