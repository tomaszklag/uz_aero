/**
 * UZ Aero — panel: czy zalogowany ma daną zdolność, a jeśli nie — POWÓD do pokazania.
 *
 * Moduł CZYSTY (bez Reacta, bez sieci), bo to jest decyzja o treści ekranu, a nie
 * o jego układzie — i dlatego ma test obok.
 *
 * **To nie jest zabezpieczenie.** Egzekwuje serwer, przy każdym żądaniu, mapą
 * `server/src/domain/roles.ts`. Tutaj rozstrzygamy wyłącznie, czy pozycja nawigacji
 * jest klikalna i co napisać obok kłódki. Ukrycie przycisku nigdy nie było ochroną
 * i tym się nie staje.
 *
 * Reguła z mockupu jest twarda: pozycja niedostępna dla roli zostaje **WIDOCZNA
 * i wyszarzona** (`.nav-item.locked`), nigdy ukryta. Ukrywanie zmusza człowieka do
 * zgadywania, czy funkcji nie ma, czy nie ma jej ON — a to dwie różne rozmowy
 * z administratorem.
 */

import type { Capability } from '../api/dto';

export function can(
  capabilities: readonly Capability[] | undefined,
  required: Capability,
): boolean {
  return capabilities?.includes(required) ?? false;
}

/**
 * Kogo prosić o daną zdolność — TEKST DLA CZŁOWIEKA, nie mapa uprawnień.
 *
 * Odpowiada na pytanie, które zadaje sobie ktoś patrzący na wyszarzoną pozycję:
 * „to awaria czy tak ma być, i co mam z tym zrobić". Bez tej odpowiedzi kłódka
 * jest tylko informacją, że coś nie działa.
 *
 * Lustro mapy z serwera — świadome i opisane w `api/dto.ts` przy typie `Capability`.
 * Rozjazd nie może niczego otworzyć ani zamknąć: najgorszy możliwy skutek to zdanie
 * wskazujące złą rolę, i taką cenę płacimy do czasu decyzji z §11 pkt 6 o przeniesieniu
 * `roles.ts` do `@uzaero/domain`.
 */
const GRANTED_BY: Record<Capability, string> = {
  'panel.access': 'administrator lub szef wyszkolenia',
  'flags.resolve': 'administrator lub szef wyszkolenia',
  'events.correct': 'administrator',
  'accounts.manage': 'administrator',
  'fleet.manage': 'administrator',
  'thresholds.manage': 'administrator',
  'audit.read': 'administrator',
  'maintenance.run': 'administrator',
};

/** „Wymaga roli: administrator" — dokładnie ten napis nosi `title` w `SZABLON.html`. */
export function denialReason(required: Capability): string {
  return `Wymaga roli: ${GRANTED_BY[required]}`;
}
