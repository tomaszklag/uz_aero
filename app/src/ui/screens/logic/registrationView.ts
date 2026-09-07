/**
 * UZ Aero - zgłoszenie rejestracyjne → treść ekranów `00c` (czeka) i `00d` (odrzucone).
 *
 * Moduł czysty: to są decyzje o TREŚCI (co ekran mówi, kiedy pisze „dziś"), a nie
 * o układzie - więc testuje się bez urządzenia. Widok pyta wyłącznie o `rejected`
 * i wstawia napisy.
 *
 * Ten ekran ma prawo tłumaczyć (wąska kategoria z issue #72: BLOKADA Z POWODEM) -
 * pilot nie może dalej i musi wiedzieć, na co czeka i co może zrobić. Nie ma tu za to
 * słowa o tym, JAK to jest zbudowane (tabela, token, role).
 */

import { dateTimeUtcShort } from '@uzaero/format';

import type { RemoteRegistration } from '../../../application/ports';

export interface RegistrationView {
  rejected: boolean;
  /** Tytuł karty stanu - Bebas, kolor tonu. */
  title: string;
  body: string;
  /** Wiersz mono pod treścią: kiedy zgłoszono albo kiedy zapadła decyzja. */
  meta: string;
  name: string;
  email: string;
  /** Do awatara: pierwsze litery dwóch pierwszych członów imienia. */
  initials: string;
  /** Cytat administratora - wyłącznie przy odrzuceniu. */
  reason: string | null;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * „dziś 09:38 UTC" dla tej samej doby UTC, inaczej „4 WRZ 09:38 UTC". Doba UTC jak
 * wszędzie w tym systemie: „dziś" liczone lokalnie kłamałoby o północy.
 */
export function whenLabel(iso: string, nowMs: number): string {
  const at = new Date(iso);
  const now = new Date(nowMs);
  const sameDay =
    at.getUTCFullYear() === now.getUTCFullYear() &&
    at.getUTCMonth() === now.getUTCMonth() &&
    at.getUTCDate() === now.getUTCDate();
  return sameDay
    ? `dziś ${pad2(at.getUTCHours())}:${pad2(at.getUTCMinutes())} UTC`
    : `${dateTimeUtcShort(at.getTime())} UTC`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p !== '');
  const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase());
  return letters.join('') || '?';
}

export function registrationView(
  registration: RemoteRegistration,
  nowMs: number,
): RegistrationView {
  const rejected = registration.status === 'rejected';
  return {
    rejected,
    title: rejected ? 'ZGŁOSZENIE ODRZUCONE' : 'CZEKA NA ZATWIERDZENIE',
    body: rejected
      ? 'Administrator klubu nie zatwierdził tego konta.'
      : 'Administrator klubu musi potwierdzić Twoje konto i nadać Ci kod pilota. Zgłoszenie już do niego trafiło - nie trzeba wysyłać go drugi raz.',
    meta: rejected
      ? `Decyzja ${whenLabel(registration.decidedAt ?? registration.createdAt, nowMs)}`
      : `Zgłoszono ${whenLabel(registration.createdAt, nowMs)}`,
    name: registration.name,
    email: registration.email,
    initials: initialsOf(registration.name),
    reason: rejected ? registration.rejectReason : null,
  };
}
