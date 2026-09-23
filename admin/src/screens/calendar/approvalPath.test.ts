/**
 * Ninerdeck - panel: ścieżka akceptacji (issue #165, H2).
 *
 * Pod obserwacją: obsada kroku liczy się wobec ŻYWEGO klubu (ktoś stracił zdolność
 * → krok „częściowy"; nikt nie został → krok „bez obsady"), przestawienie kroku nie
 * gubi żadnego, a zamówienie zapisu zachowuje `id` kroków istniejących.
 */

import { describe, expect, it } from 'vitest';

import type { ApprovalStepDto, PilotListItemDto } from '../../api/dto';
import {
  approverCandidates,
  hasStepChanges,
  moveStep,
  namesSentence,
  orphanNotices,
  pathSentence,
  stepBlocker,
  stepHealth,
  stepMembers,
  toggleMember,
  withStep,
  withoutStep,
} from './approvalPath';

const pilot = (over: Partial<PilotListItemDto>): PilotListItemDto => ({
  id: 'x',
  code: 'XXX',
  name: 'Ktoś',
  email: null,
  active: true,
  capabilities: [],
  lastSeenAt: null,
  loginMethods: [],
  ...over,
});

const JBA = pilot({ id: 'jba', code: 'JBA', name: 'Jan Bąk', capabilities: ['reservations.approve'] });
const AKO = pilot({ id: 'ako', code: 'AKO', name: 'Anna Kowal', capabilities: ['reservations.approve'] });
const MSO = pilot({ id: 'mso', code: 'MSO', name: 'Marek Sowa', capabilities: ['panel.access'] });
const OFF = pilot({ id: 'off', code: 'OFF', name: 'Były Członek', active: false, capabilities: ['reservations.approve'] });

const step = (over: Partial<ApprovalStepDto>): ApprovalStepDto => ({
  id: 's1',
  position: 0,
  label: 'Mechanik',
  memberIds: ['jba'],
  ...over,
});

describe('kandydaci do kroku', () => {
  it('to WYŁĄCZNIE aktywni ze zdolnością akceptacji, po nazwisku', () => {
    expect(approverCandidates([MSO, JBA, OFF, AKO]).map((c) => c.code)).toEqual(['AKO', 'JBA']);
  });
});

describe('obsada wobec żywego klubu', () => {
  it('osoba bez zdolności, nieaktywna albo spoza listy członków nie może zatwierdzić', () => {
    const members = stepMembers(['jba', 'mso', 'off', 'ghost'], [JBA, MSO, OFF]);
    expect(members.map((m) => m.able)).toEqual([true, false, false, false]);
    // Nieznany członek: kreska, nigdy surowy identyfikator.
    expect(members[3]).toEqual({ id: 'ghost', name: '—', code: null, able: false });
  });

  it('stan kroku: ok / częściowy / bez obsady', () => {
    expect(stepHealth(stepMembers(['jba', 'ako'], [JBA, AKO]))).toBe('ok');
    expect(stepHealth(stepMembers(['jba', 'mso'], [JBA, MSO]))).toBe('partial');
    expect(stepHealth(stepMembers(['mso'], [JBA, MSO]))).toBe('none');
  });

  it('rozjazdy zbierają się per krok, z nazwiskami tych, którzy nie rozstrzygną', () => {
    const notices = orphanNotices(
      [step({ id: 's1', memberIds: ['jba', 'ako'] }), step({ id: 's2', label: 'Szef', memberIds: ['mso'] })],
      [JBA, MSO],
    );
    expect(notices).toEqual([
      { stepId: 's1', stepLabel: 'Mechanik', health: 'partial', lost: ['—'], able: 1 },
      { stepId: 's2', stepLabel: 'Szef', health: 'none', lost: ['Marek Sowa'], able: 0 },
    ]);
  });
});

describe('zdania', () => {
  it('baner wymienia kroki po nazwach, w kolejności pytania', () => {
    expect(pathSentence([])).toBe('');
    expect(pathSentence(['Mechanik'])).toBe('Rezerwację zatwierdza krok „Mechanik".');
    expect(pathSentence(['Mechanik', 'Szef wyszkolenia', 'Prezes'])).toBe(
      'Rezerwacja idzie krok po kroku: Mechanik, potem Szef wyszkolenia, potem Prezes.',
    );
  });

  it('nazwiska łączą się spójnikiem przed ostatnim', () => {
    expect(namesSentence([])).toBe('');
    expect(namesSentence(['Anna Kowal'])).toBe('Anna Kowal');
    expect(namesSentence(['Anna Kowal', 'Jan Bąk'])).toBe('Anna Kowal i Jan Bąk');
    expect(namesSentence(['Anna', 'Jan', 'Marek'])).toBe('Anna, Jan i Marek');
  });
});

describe('przestawianie', () => {
  it('przenosi krok bez gubienia żadnego; poza zakresem zostawia listę', () => {
    expect(moveStep(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveStep(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveStep(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveStep(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c']);
  });
});

describe('szuflada kroku', () => {
  it('blokada w przycisku: bez nazwy, potem bez osób', () => {
    expect(stepBlocker({ id: null, label: '  ', memberIds: ['jba'] })).toBe('wpisz nazwę kroku');
    expect(stepBlocker({ id: null, label: 'Mechanik', memberIds: [] })).toBe(
      'wskaż przynajmniej jedną osobę',
    );
    expect(stepBlocker({ id: null, label: 'Mechanik', memberIds: ['jba'] })).toBeNull();
  });

  it('przełączenie osoby dodaje albo zdejmuje', () => {
    expect(toggleMember(['jba'], 'ako')).toEqual(['jba', 'ako']);
    expect(toggleMember(['jba', 'ako'], 'jba')).toEqual(['ako']);
  });

  it('„Zapisz" bez zmian jest nieaktywny; nowy krok zawsze ma co zapisać', () => {
    const steps = [step({ memberIds: ['jba', 'ako'] })];
    expect(hasStepChanges(steps, { id: 's1', label: 'Mechanik ', memberIds: ['ako', 'jba'] })).toBe(false);
    expect(hasStepChanges(steps, { id: 's1', label: 'Mechanik', memberIds: ['jba'] })).toBe(true);
    expect(hasStepChanges(steps, { id: null, label: 'Nowy', memberIds: ['jba'] })).toBe(true);
  });

  it('zamówienie podmienia krok istniejący (zachowując id) albo dokłada nowy na końcu', () => {
    const steps = [step({ id: 's1' }), step({ id: 's2', label: 'Szef', memberIds: ['ako'] })];
    expect(withStep(steps, { id: 's1', label: ' Mechanik klubu ', memberIds: ['jba', 'ako'] })).toEqual([
      { id: 's1', label: 'Mechanik klubu', memberIds: ['jba', 'ako'] },
      { id: 's2', label: 'Szef', memberIds: ['ako'] },
    ]);
    expect(withStep(steps, { id: null, label: 'Prezes', memberIds: ['ako'] }).map((s) => s.id)).toEqual([
      's1',
      's2',
      null,
    ]);
    expect(withoutStep(steps, 's1').map((s) => s.id)).toEqual(['s2']);
  });
});
