/**
 * Ninerdeck - panel: GRUPY KLUBU - wiersze listy i podpisy (makieta `piloci-grupy`, P5;
 * 4.0.0, epik Z-D #248; `docs/zlecenia.md` §6.1).
 *
 * Grupa to lista ludzi i tylko to ma do powiedzenia: nazwa, liczba członków i skład
 * jednym zdaniem. Kolumny „gdzie użyta" NIE MA - adresaci zlecenia są zapisywani imiennie
 * w chwili wysłania (§6.2), więc grupa nie jest z niczym związana po wysłaniu.
 *
 * ══ CZŁONKOSTWO WYŁĄCZONE LICZY SIĘ DO SKŁADU ══
 * Konfiguracji klubu nie czyścimy po cichu (ta sama reguła, co obsada kroku ścieżki), więc
 * osoba z wyłączonym członkostwem zostaje w grupie i w liczbie - a mówi o sobie podpisem
 * pod liczbą i miejscem na końcu składu. Zleceń nie dostaje (rozwija je serwer, §6.2).
 *
 * Nazwiska i stan członkostwa bierze ze słownika klubu - serwer oddaje w grupie same
 * identyfikatory. Moduł czysty - test obok.
 */

import { plural } from '@ninerdeck/format';

import type { DirectoryDto, GroupDto } from '../../api/dto';
import { NONE } from '../common/values';

export interface GroupMember {
  id: string;
  name: string;
  /** Kod W TYM klubie; `null` = osoby nie ma w słowniku klubu. */
  code: string | null;
  active: boolean;
}

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, 'pl');

/**
 * Członkowie grupy ze słownika klubu: najpierw aktywni, potem wyłączeni - obie części
 * alfabetycznie. Osoba spoza słownika (dziś nie powinna się zdarzyć) zostaje kreską,
 * nigdy surowym identyfikatorem.
 */
export function groupMembers(memberIds: readonly string[], directory: DirectoryDto | undefined): GroupMember[] {
  const byId = new Map((directory?.members ?? []).map((m) => [m.id, m]));
  const members = memberIds.map((id): GroupMember => {
    const m = byId.get(id);
    return m == null ? { id, name: NONE, code: null, active: false } : { id, name: m.name, code: m.code, active: m.active };
  });
  return [...members.filter((m) => m.active).sort(byName), ...members.filter((m) => !m.active).sort(byName)];
}

/** „1 członkostwo wyłączone" / „2 członkostwa wyłączone" / „5 członkostw wyłączonych". */
export function disabledLabel(n: number): string {
  return `${n} ${plural(n, 'członkostwo wyłączone', 'członkostwa wyłączone', 'członkostw wyłączonych')}`;
}

/** „1 członek" / „4 członków". */
export function membersLabel(n: number): string {
  return `${n} ${plural(n, 'członek', 'członków', 'członków')}`;
}

/** Podtytuł szuflady: „4 członków · 1 członkostwo wyłączone". */
export function groupSub(members: readonly GroupMember[]): string {
  const disabled = members.filter((m) => !m.active).length;
  return disabled === 0 ? membersLabel(members.length) : `${membersLabel(members.length)} · ${disabledLabel(disabled)}`;
}

export interface GroupRowVm {
  id: string;
  name: string;
  count: number;
  /** Podpis pod liczbą - tylko przy członkostwach wyłączonych. */
  countSub: string | null;
  /** Skład jednym zdaniem - imiona i nazwiska po przecinku. */
  composition: string;
}

/** Wiersze tabeli grup - alfabetycznie po nazwie. */
export function groupRows(groups: readonly GroupDto[], directory: DirectoryDto | undefined): GroupRowVm[] {
  return [...groups].sort(byName).map((group) => {
    const members = groupMembers(group.memberIds, directory);
    const disabled = members.filter((m) => !m.active).length;
    return {
      id: group.id,
      name: group.name,
      count: members.length,
      countSub: disabled === 0 ? null : disabledLabel(disabled),
      composition: members.length === 0 ? NONE : members.map((m) => m.name).join(', '),
    };
  });
}
