/**
 * UZ Aero - panel: co stoi na ekranie wyboru zakresu (mockup `00a-wybor-klubu`;
 * issue #101, E2).
 *
 * Moduł CZYSTY (bez Reacta), bo to jest decyzja o TREŚCI ekranu - które karty, w jakiej
 * kolejności i o co pyta nagłówek - a nie o jego układzie. Dlatego ma test obok.
 */

import type { PanelScopesDto, PilotRole } from '../../api/dto';

export interface ScopeOption {
  /** Cel przełączenia: identyfikator klubu albo `null` = platforma. */
  orgId: string | null;
  name: string;
  /** Druga linia karty - mówi, CO ten wybór otwiera. */
  desc: string;
}

const roleWord = (role: PilotRole): string => (role === 'admin' ? 'administrator' : 'pilot');

/**
 * Karty wyboru. PLATFORMA STOI PIERWSZA, gdy jest: to nie jest klub, więc jej druga
 * linia mówi o ZAKRESIE, a nie o kodzie pilota - i to ona jest miejscem, do którego
 * superadministrator wraca (mockup 00A′).
 *
 * Kolejność klubów zostaje TAKA, JAKĄ PODAŁ SERWER (nazwa klubu rosnąco): drugie
 * sortowanie w panelu rozjechałoby się z listą, którą ta sama osoba widzi w telefonie.
 */
export function scopeOptions(scopes: PanelScopesDto): ScopeOption[] {
  const platform: ScopeOption[] = scopes.platform
    ? [
        {
          orgId: null,
          name: 'Organizacje',
          desc: 'superadministrator · wszystkie kluby na serwerze',
        },
      ]
    : [];

  return [
    ...platform,
    ...scopes.clubs.map((club) => ({
      orgId: club.org.id,
      name: club.org.name,
      desc: `${roleWord(club.role)} · Twój kod ${club.code}`,
    })),
  ];
}

/**
 * Pytanie w nagłówku. Dwa brzmienia, bo to dwa różne pytania: przy samych klubach
 * wybiera się MIEJSCE PRACY, a z platformą na liście - ZAKRES, w którym część opcji
 * klubem nie jest. Jedno zdanie na oba („Wybierz") nie mówiłoby ani jednego z nich.
 */
export function scopeQuestion(scopes: PanelScopesDto): string {
  return scopes.platform ? 'Gdzie wchodzisz?' : 'W którym klubie pracujesz?';
}
