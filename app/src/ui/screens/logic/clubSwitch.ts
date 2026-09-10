/**
 * UZ Aero - SEKCJA „KLUB" w ustawieniach (mockup `13a`, wielofirmowość §7.3, issue #102).
 *
 * Moduł czysty: decyduje, jakie karty stoją na liście, co mówi ich podpis i CZY wolno
 * teraz przełączyć klub - a nie jak to wygląda.
 *
 * ══ SEKCJA ISTNIEJE WYŁĄCZNIE PRZY WIĘCEJ NIŻ JEDNYM CZŁONKOSTWIE ══
 * Przełącznik o jednej pozycji niczego by nie przełączał (ta sama reguła, co przy
 * plakietce klubu na kafelku). Zgłoszenie `pending` LICZY SIĘ do tej dwójki: pilot,
 * który właśnie wpisał kod drugiego klubu, ma prawo zobaczyć, że zgłoszenie czeka -
 * nawet zanim ktokolwiek je zatwierdzi.
 *
 * ══ PRZEŁĄCZENIE WYMAGA SIECI I PUSTEJ KOLEJKI KLUBU BIEŻĄCEGO (§6) ══
 * Offline-first dotyczy PRACY w klubie, nie zmiany klubu: bez zasięgu pilot pracuje
 * dalej tam, gdzie jest. Kolejka blokuje TYLKO zapisami klubu, z którego wychodzimy -
 * to one zostałyby bez drogi wyjścia (wysłać je można wyłącznie jego tokenem). Zapisy
 * innych klubów nie blokują niczego: przełączenie jest właśnie drogą do ich wysłania.
 */

import type { ClubMembership, ClubMembershipView } from '../../../application/ports';
import { plural } from '../../format';

export interface ClubCardVm {
  orgId: string;
  name: string;
  /** Druga linia karty: „Twój kod: TMK · 4 samoloty". */
  sub: string;
  /** Klub aktywny - zielona ramka i ptaszek; tapnięcie w niego nic nie robi. */
  selected: boolean;
  /** Zgłoszenie czeka na decyzję - wiersz przygaszony i NIEKLIKALNY (członkostwa nie ma). */
  pending: boolean;
}

/**
 * Karty klubów: najpierw członkostwa (klub aktywny na czele), potem zgłoszenia.
 *
 * `counts` to liczba maszyn, które cache zna w danym klubie - fragment podpisu istnieje
 * WYŁĄCZNIE, gdy telefon tę flotę widział. „0 samolotów" przy klubie, w którym pilot
 * jeszcze nie był, byłoby zdaniem o flocie, a jest zdaniem o pustym cache'u.
 */
export function clubCards(
  memberships: readonly ClubMembership[],
  pendingMemberships: readonly ClubMembershipView[],
  activeOrgId: string | null,
  counts: Record<string, number>,
): ClubCardVm[] {
  const cards: ClubCardVm[] = memberships.map((m) => ({
    orgId: m.org.id,
    name: m.org.name,
    sub: [`Twój kod: ${m.code}`, fleetNote(counts[m.org.id])].filter((p) => p != null).join(' · '),
    selected: m.org.id === activeOrgId,
    pending: false,
  }));

  const waiting = pendingMemberships
    .filter((m) => m.status === 'pending' && !cards.some((c) => c.orgId === m.org.id))
    .map((m) => ({
      orgId: m.org.id,
      name: m.org.name,
      sub: 'Czeka na zatwierdzenie',
      selected: false,
      pending: true,
    }));

  // Aktywny na czele - to on opisuje, co pokazuje reszta aplikacji.
  cards.sort((a, b) => Number(b.selected) - Number(a.selected));
  return [...cards, ...waiting];
}

/** Czy sekcja „Klub" w ogóle istnieje - patrz docblock modułu. */
export const showsClubSection = (
  memberships: readonly ClubMembership[],
  pendingMemberships: readonly ClubMembershipView[],
): boolean => memberships.length + pendingMemberships.filter((m) => m.status === 'pending').length > 1;

/**
 * Powód, dla którego przełączenie jest teraz zablokowane - albo `null`.
 *
 * Kolejność jest kolejnością POWAGI: maszyna w ręce jest stanem, który trzeba domknąć
 * czynnością; zaległe zapisy - faktem, który pilot musi wysłać; brak sieci przejdzie sam.
 *
 * ══ TRZYMANA MASZYNA: PAS BEZPIECZEŃSTWA, NIE GŁÓWNA OCHRONA ══
 * Z kokpitu do ustawień NIE MA wejścia (kokpit jest modalny), więc pilot z maszyną
 * w ręce nie powinien tu w ogóle stanąć. Warunek stoi mimo to, bo operacja należy do
 * klubu, w którym ją zaczęto: gdyby kiedyś powstała druga droga do ustawień,
 * przełączenie w połowie operacji zostawiłoby jej zapisy bez tokenu, którym mogą wyjść.
 */
export function clubSwitchBlock(
  pendingInActiveOrg: number,
  offline: boolean,
  holdsAircraft = false,
): string | null {
  if (holdsAircraft) return 'Najpierw zdaj samolot - operacja należy do klubu, w którym ją zaczęto';
  if (pendingInActiveOrg > 0) {
    return `Najpierw wyślij ${pendingInActiveOrg} ${plural(pendingInActiveOrg, 'zapis', 'zapisy', 'zapisów')} - należą do klubu, w którym powstały`;
  }
  if (offline) return 'Zmiana klubu wymaga internetu';
  return null;
}

const fleetNote = (count: number | undefined): string | null =>
  count == null || count === 0
    ? null
    : `${count} ${plural(count, 'samolot', 'samoloty', 'samolotów')}`;
