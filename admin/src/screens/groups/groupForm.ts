/**
 * Ninerdeck - panel: SZKIC GRUPY w szufladzie (makieta `piloci-grupy`, P5 i P5a; 4.0.0,
 * epik Z-D #248).
 *
 * ══ OBSADA TO LISTA KART WIELOKROTNEGO WYBORU ══
 * Ten sam komponent, co obsada kroku ścieżki (K4a): wybór jest wielokrotny, więc
 * `<select>` odpada, a lista rośnie z klubem, więc ma wyszukiwarkę. Kandydaci to AKTYWNI
 * członkowie klubu - serwer odbija dopisanie kogoś spoza nich (`member_not_in_org`) -
 * plus każdy, kto już w grupie jest: członek wyłączony zostaje zaznaczony i przygaszony,
 * inaczej nie dałoby się go z grupy zdjąć.
 *
 * ══ OBECNI CZŁONKOWIE NA GÓRZE - I TAM ZOSTAJĄ ══
 * Szuflada odpowiada najpierw na „kto jest w tej grupie", a dopiero potem na „kogo mogę
 * dopisać". Kolejność liczy się ze składu z chwili OTWARCIA szuflady, nie z bieżącego
 * szkicu: karta skacząca na górę listy pod kursorem po kliknięciu gubiłaby wzrok.
 *
 * Moduł czysty - test obok.
 */

import type { DirectoryDto, GroupDto } from '../../api/dto';
import type { GroupPatch, NewGroup } from '../../api/groups';

/** Granica nazwy - ta sama, co w schemacie serwera (`groupWire.ts`). */
export const GROUP_NAME_MAX = 60;

export interface GroupDraft {
  name: string;
  memberIds: string[];
}

export const EMPTY_GROUP: GroupDraft = { name: '', memberIds: [] };

export const draftOf = (group: GroupDto): GroupDraft => ({ name: group.name, memberIds: [...group.memberIds] });

export function toggleMember(memberIds: readonly string[], id: string): string[] {
  return memberIds.includes(id) ? memberIds.filter((m) => m !== id) : [...memberIds, id];
}

const sameMembers = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

/** Zmiana względem grupy - tylko pola, które się zmieniły; `null` = nic się nie zmieniło. */
export function groupPatch(group: GroupDto, draft: GroupDraft): GroupPatch | null {
  const patch: GroupPatch = {};
  if (draft.name.trim() !== group.name) patch.name = draft.name.trim();
  if (!sameMembers(draft.memberIds, group.memberIds)) patch.memberIds = [...draft.memberIds];
  return Object.keys(patch).length === 0 ? null : patch;
}

/** Zamówienie nowej grupy - identyfikator nadaje panel (idempotencja zapisu). */
export const newGroup = (id: string, draft: GroupDraft): NewGroup => ({
  id,
  name: draft.name.trim(),
  memberIds: [...draft.memberIds],
});

/**
 * Czy zapis jest zablokowany. Bez zdania (issue #55): pusta nazwa i brak zmian widać
 * z formularza tuż nad przyciskiem. Grupa bez członków jest dozwolona - klub zakłada
 * czasem listę na zapas.
 */
export function groupBlocked(group: GroupDto | null, draft: GroupDraft): boolean {
  if (draft.name.trim() === '') return true;
  return group != null && groupPatch(group, draft) == null;
}

export interface MemberOption {
  id: string;
  name: string;
  desc: string;
  selected: boolean;
  /** Członkostwo wyłączone - nazwa o stopień słabsza. */
  dim: boolean;
}

/** Czy osoba pasuje do wyszukiwania: fragment nazwiska albo kodu, bez względu na wielkość liter. */
function matches(person: { name: string; code: string }, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('pl');
  if (q === '') return true;
  return person.name.toLocaleLowerCase('pl').includes(q) || person.code.toLocaleLowerCase('pl').includes(q);
}

/**
 * Karty obsady: obecni członkowie (ze składu z chwili otwarcia, `pinned`) na górze -
 * aktywni, potem wyłączeni - a pod nimi reszta aktywnych członków klubu alfabetycznie.
 */
export function memberOptions(
  directory: DirectoryDto | undefined,
  draft: GroupDraft,
  pinned: readonly string[],
  query: string,
): MemberOption[] {
  const members = directory?.members ?? [];
  const candidates = members.filter((m) => m.active || pinned.includes(m.id) || draft.memberIds.includes(m.id));
  const option = (m: (typeof members)[number]): MemberOption => ({
    id: m.id,
    name: m.name,
    desc: m.active ? m.code : `${m.code} · członkostwo wyłączone - nie dostaje zleceń`,
    selected: draft.memberIds.includes(m.id),
    dim: !m.active,
  });
  const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, 'pl');
  const top = candidates.filter((m) => pinned.includes(m.id));
  const rest = candidates.filter((m) => !pinned.includes(m.id));
  return [
    ...top.filter((m) => m.active).sort(byName),
    ...top.filter((m) => !m.active).sort(byName),
    ...rest.sort(byName),
  ]
    .filter((m) => matches(m, query))
    .map(option);
}
