/**
 * UZ Aero - stan osoby wobec klubów → treść ekranów `00c` (czeka), `00d` (odrzucone)
 * i `00e` (bez klubu). Wielofirmowość §7, issue #102.
 *
 * Moduł czysty: to są decyzje o TREŚCI (co ekran mówi, KTÓRY klub nazywa, kiedy pisze
 * „dziś"), a nie o układzie - więc testuje się bez urządzenia.
 *
 * Ten ekran ma prawo tłumaczyć (wąska kategoria z issue #72: BLOKADA Z POWODEM) - pilot
 * nie może dalej i musi wiedzieć, na co czeka i skąd wziąć kod klubu. Nie ma tu za to
 * słowa o tym, JAK to jest zbudowane (członkostwa, tokeny, kolejka zgłoszeń).
 *
 * ══ TRZY STANY JEDNEJ RODZINY ══
 * Zastąpiły „zgłoszenie rejestracyjne" z `docs/logowanie-google.md`: od wielofirmowości
 * czekanie i odmowa dotyczą KLUBU, nie konta Google - ta sama osoba może czekać w jednym
 * klubie i latać w drugim. Stan zbiorczy podaje serwer (pierwszeństwo: active > pending >
 * rejected > none), a tutaj wybiera się KTÓRY klub ekran nazywa.
 */

import { dateTimeUtcShort } from '@uzaero/format';

import type { ClubMembershipView, ClubsView } from '../../../application/ports';

export type ClubGateState = 'pending' | 'rejected' | 'none';

export interface ClubGateView {
  state: ClubGateState;
  /** Tytuł karty stanu - Bebas, kolor tonu. */
  title: string;
  body: string;
  /** Wiersz mono pod treścią: kiedy zgłoszono albo kiedy zapadła decyzja; `null` na 00E. */
  meta: string | null;
  /** Cytat administratora - wyłącznie przy odrzuceniu. */
  reason: string | null;
  name: string;
  email: string;
  /** Do awatara: pierwsze litery dwóch pierwszych członów imienia. */
  initials: string;
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

/**
 * Który klub NAZYWA ekran. Zgłoszeń bywa kilka (pilot wpisał kod dwóch klubów), a ekran
 * mówi o jednym - bierzemy NAJŚWIEŻSZE, bo to o nim pilot właśnie myśli: przy czekaniu
 * po chwili zgłoszenia, przy odmowie po chwili decyzji.
 */
export function clubOf(
  clubs: ClubsView,
  status: 'pending' | 'rejected',
): ClubMembershipView | null {
  const matching = clubs.memberships.filter((m) => m.status === status);
  if (matching.length === 0) return null;
  const stampOf = (m: ClubMembershipView): number =>
    new Date(status === 'rejected' ? (m.decidedAt ?? m.createdAt) : m.createdAt).getTime();
  return matching.reduce((newest, m) => (stampOf(m) > stampOf(newest) ? m : newest));
}

export function clubGateView(clubs: ClubsView, nowMs: number): ClubGateView {
  const account = {
    name: clubs.person.name,
    email: clubs.person.email ?? '',
    initials: initialsOf(clubs.person.name),
  };

  if (clubs.status === 'pending') {
    const club = clubOf(clubs, 'pending');
    return {
      ...account,
      state: 'pending',
      title: 'CZEKA NA ZATWIERDZENIE',
      // Klub NAZWANY w zdaniu, nie w osobnym wierszu - to jedna wiadomość, nie formularz.
      body: `Administrator klubu ${club?.org.name ?? '-'} musi potwierdzić Twoje członkostwo i nadać Ci kod pilota. Zgłoszenie już do niego trafiło - nie trzeba wysyłać go drugi raz.`,
      meta: club == null ? null : `Zgłoszono kodem klubu · ${whenLabel(club.createdAt, nowMs)}`,
      reason: null,
    };
  }

  if (clubs.status === 'rejected') {
    const club = clubOf(clubs, 'rejected');
    return {
      ...account,
      state: 'rejected',
      title: 'ZGŁOSZENIE ODRZUCONE',
      body: `Administrator klubu ${club?.org.name ?? '-'} nie przyjął Twojego zgłoszenia.`,
      meta:
        club == null
          ? null
          : `Decyzja z ${whenLabel(club.decidedAt ?? club.createdAt, nowMs)}`,
      // POWÓD jest w panelu WYMAGANY właśnie dlatego, że stoi tutaj: odmowa bez słowa
      // zostawia człowieka przed ekranem, na którym nie da się zrobić nic sensownego.
      reason: club?.rejectReason ?? null,
    };
  }

  return {
    ...account,
    state: 'none',
    title: 'NIE NALEŻYSZ DO ŻADNEGO KLUBU',
    body: 'Wpisz kod klubu - dostaniesz go od administratora klubu, w którym latasz. O przyjęciu zdecyduje administrator.',
    meta: null,
    reason: null,
  };
}
