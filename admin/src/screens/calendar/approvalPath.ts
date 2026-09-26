/**
 * Ninerdeck - panel: ŚCIEŻKA AKCEPTACJI - decyzje o treści ekranu i szuflady kroku
 * (`#/kalendarz/sciezka`, makiety `kalendarz-sciezka` K4/K4a/K4b/K4c; issue #165, H2).
 *
 * Moduł CZYSTY (bez Reacta), bo to są decyzje o treści, nie o układzie - i dlatego ma
 * test obok.
 *
 * ══ NA LIŚCIE KROKU STOJĄ WYŁĄCZNIE OSOBY ZE ZDOLNOŚCIĄ AKCEPTACJI ══
 * To nie jest filtr wygody, tylko drugi bok modelu (`docs/uprawnienia.md`): ZDOLNOŚĆ
 * mówi „ta osoba w ogóle akceptuje i widzi terminy klubu", KROK - „za to odpowiada".
 * Bez tego rozdziału dopisanie kogoś do kroku po cichu otwierałoby mu wszystkie plany
 * klubu, a katalog uprawnień nie wiedziałby o tym nic.
 *
 * ══ LISTY KROKU NIE CZYŚCIMY PO CICHU ══
 * Dwa zapisy (lista kroku i zdolność) mogą się rozjechać: ktoś zostaje na liście po
 * tym, jak stracił zdolność albo członkostwo. Odebranie uprawnienia nie może przestawiać
 * konfiguracji kalendarza za plecami administratora - ekran OZNACZA rozjazd (`stepHealth`)
 * i podaje drogę naprawy; decyzję zostawia człowiekowi (K4c).
 */

import { plural } from '@ninerdeck/format';

import type { ApprovalStepDto, ApprovalStepInputDto, PilotListItemDto } from '../../api/dto';
import { NONE } from '../common/values';

/** Krok w szufladzie. `id: null` = nowy - identyfikator nadaje serwer. */
export interface StepDraft {
  id: string | null;
  label: string;
  memberIds: string[];
}

export const EMPTY_STEP: StepDraft = { id: null, label: '', memberIds: [] };

/** Sufit nazwy kroku - ten sam, co w schemacie trasy (`LABEL_MAX`). */
export const STEP_LABEL_MAX = 60;

/** Osoba, którą wolno wpisać do kroku. */
export interface Approver {
  id: string;
  name: string;
  code: string;
}

const canApprove = (pilot: PilotListItemDto): boolean =>
  pilot.active && pilot.capabilities.includes('reservations.approve');

/** Aktywni członkowie ze zdolnością akceptacji - lista wyboru w szufladzie, po nazwisku. */
export function approverCandidates(pilots: readonly PilotListItemDto[]): Approver[] {
  return pilots
    .filter(canApprove)
    .map((p) => ({ id: p.id, name: p.name, code: p.code }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

/** Obsada kroku wobec ŻYWEGO klubu. `able = false` = stracił zdolność albo członkostwo. */
export interface StepMember {
  id: string;
  name: string;
  code: string | null;
  able: boolean;
}

export function stepMembers(
  memberIds: readonly string[],
  pilots: readonly PilotListItemDto[],
): StepMember[] {
  const byId = new Map(pilots.map((p) => [p.id, p]));
  return memberIds.map((id) => {
    const pilot = byId.get(id);
    // Nie ma go na liście członków (odszedł z klubu): kreska, nigdy surowy identyfikator.
    if (pilot == null) return { id, name: NONE, code: null, able: false };
    return { id, name: pilot.name, code: pilot.code, able: canApprove(pilot) };
  });
}

/**
 * Stan obsady: `ok` - każdy z listy może zatwierdzić; `partial` - ktoś stracił prawo,
 * ale krok ma jeszcze kogo pytać (nic nie krzyczy, nazwisko przygasa); `none` - nikt
 * nie zatwierdzi i nowe rezerwacje STANĄ na tym kroku (baner `warn` + plakietka).
 */
export type StepHealth = 'ok' | 'partial' | 'none';

export function stepHealth(members: readonly StepMember[]): StepHealth {
  const able = members.filter((m) => m.able).length;
  if (able === 0) return 'none';
  return able === members.length ? 'ok' : 'partial';
}

/**
 * Zdanie banera nad tabelą (K4) - reguła wymieniona po NAZWACH kroków, żeby czytała
 * się razem z tabelą pod spodem. Pusta ścieżka zdania nie ma: mówi o niej stan pusty.
 */
export function pathSentence(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return `Rezerwację zatwierdza krok „${labels[0]}".`;
  const [first, ...rest] = labels;
  return `Rezerwacja idzie krok po kroku: ${first}, potem ${rest.join(', potem ')}.`;
}

/** Rozjazd obsady jednego kroku (K4c) - materiał na zdanie pod tabelą albo baner. */
export interface OrphanNotice {
  stepId: string;
  stepLabel: string;
  health: 'partial' | 'none';
  /** Nazwiska osób, które nie rozstrzygną tego kroku. */
  lost: string[];
  /** Ile osób z listy nadal może zatwierdzić. */
  able: number;
}

export function orphanNotices(
  steps: readonly ApprovalStepDto[],
  pilots: readonly PilotListItemDto[],
): OrphanNotice[] {
  return steps.flatMap((step) => {
    const members = stepMembers(step.memberIds, pilots);
    const health = stepHealth(members);
    if (health === 'ok') return [];
    return [
      {
        stepId: step.id,
        stepLabel: step.label,
        health,
        lost: members.filter((m) => !m.able).map((m) => m.name),
        able: members.filter((m) => m.able).length,
      },
    ];
  });
}

/** Nazwiska w jednym zdaniu: „Anna Kowal", „Anna Kowal i Jan Bąk", „Anna, Jan i Marek". */
export function namesSentence(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} i ${names[names.length - 1]}`;
}

/**
 * Przestawienie kroku - kolejność jest TREŚCIĄ ścieżki (krok 2 pyta dopiero po zgodzie
 * kroku 1), więc przesunięcie wiersza to zmiana reguły, nie widoku. Poza zakresem
 * wraca kopia bez zmian, żeby strzałka na skraju listy nie wywracała stanu.
 */
export function moveStep<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * Powód, dla którego kroku nie da się zapisać - do PRZYCISKU (issue #55). Brak nazwy
 * widać z pola nad przyciskiem, ale pusta lista osób nie jest stanem widocznym z jednej
 * kontrolki (lista ma kilkanaście pozycji i wszystkie wyglądają tak samo, gdy żadna
 * nie jest zaznaczona) - stąd zdanie, dokładnie jak w makiecie K4a.
 */
export function stepBlocker(draft: StepDraft): string | null {
  if (draft.label.trim() === '') return 'wpisz nazwę kroku';
  if (draft.memberIds.length === 0) return 'wskaż przynajmniej jedną osobę';
  return null;
}

export function toggleMember(memberIds: readonly string[], id: string): string[] {
  return memberIds.includes(id) ? memberIds.filter((m) => m !== id) : [...memberIds, id];
}

export const draftOf = (step: ApprovalStepDto): StepDraft => ({
  id: step.id,
  label: step.label,
  memberIds: [...step.memberIds],
});

/** Czy szuflada ma co zapisać - „Zapisz" bez zmian jest po prostu nieaktywny. */
export function hasStepChanges(steps: readonly ApprovalStepDto[], draft: StepDraft): boolean {
  const current = steps.find((s) => s.id === draft.id);
  if (current == null) return true;
  const same = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
  return current.label !== draft.label.trim() || !same(current.memberIds, draft.memberIds);
}

/** Ścieżka jako ZAMÓWIENIE zapisu - kolejność tablicy jest kolejnością pytania. */
export function asInput(steps: readonly ApprovalStepDto[]): ApprovalStepInputDto[] {
  return steps.map((s) => ({ id: s.id, label: s.label, memberIds: [...s.memberIds] }));
}

/** Zamówienie z jednym krokiem PODMIENIONYM (istniejący) albo DOŁOŻONYM na końcu (nowy). */
export function withStep(steps: readonly ApprovalStepDto[], draft: StepDraft): ApprovalStepInputDto[] {
  const input: ApprovalStepInputDto = {
    id: draft.id,
    label: draft.label.trim(),
    memberIds: [...draft.memberIds],
  };
  const list = asInput(steps);
  const at = draft.id == null ? -1 : list.findIndex((s) => s.id === draft.id);
  if (at < 0) return [...list, input];
  list[at] = input;
  return list;
}

/** Zamówienie BEZ kroku - krok zdjęty ze ścieżki przestaje być pytany (§11.2). */
export function withoutStep(steps: readonly ApprovalStepDto[], id: string): ApprovalStepInputDto[] {
  return asInput(steps.filter((s) => s.id !== id));
}

/**
 * Zdanie po zapisie ścieżki o SPRAWACH W TOKU (issue #207): ile czekających rezerwacji
 * dostało komplet zgód, a ile czeka teraz na inny krok. `null`, gdy zapis niczego
 * w sprawach nie zmienił - baner o zerze uczyłby pomijać banery (reguła SyncChipa).
 */
export function pathSavedNotice(effect: { confirmed: number; moved: number } | undefined): string | null {
  if (effect == null) return null;
  const parts: string[] = [];
  if (effect.confirmed > 0) {
    parts.push(
      `${effect.confirmed} ${plural(effect.confirmed, 'rezerwacja z kompletem zgód została potwierdzona', 'rezerwacje z kompletem zgód zostały potwierdzone', 'rezerwacji z kompletem zgód zostało potwierdzonych')}`,
    );
  }
  if (effect.moved > 0) {
    parts.push(
      `${effect.moved} ${plural(effect.moved, 'rezerwacja czeka teraz na inny krok - jego osoby dostały prośbę', 'rezerwacje czekają teraz na inny krok - jego osoby dostały prośbę', 'rezerwacji czeka teraz na inny krok - jego osoby dostały prośbę')}`,
    );
  }
  return parts.length === 0 ? null : `${parts.join('. ')}.`;
}
