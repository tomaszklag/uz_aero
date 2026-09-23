/**
 * Ninerdeck - panel: historia decyzji na karcie rezerwacji (issue #165, H5).
 *
 * Pod obserwacją: pominięcie jest zapisem (a nie brakiem wiersza), krok bieżący czeka,
 * krok po odmowie ma kreskę, a nazwisko decydującego rozwiązuje się z listy członków.
 */

import { describe, expect, it } from 'vitest';

import type { ApprovalViewDto } from '../../api/dto';
import type { Person } from './bookingLabels';
import { currentStepLabel, historyRows, pathPill } from './approvalHistory';

const TZ = 'Europe/Warsaw';
const OSOBY: Record<string, Person> = { jba: { name: 'Jan Bąk', code: 'JBA' } };
const osoba = (id: string): Person | null => OSOBY[id] ?? null;

const zgoda = (by: string): ApprovalViewDto['steps'][number]['decision'] => ({
  decision: 'approved',
  via: 'person',
  reason: null,
  decidedBy: by,
  decidedAt: '2026-09-24T16:40:00Z',
});

describe('wiersze historii', () => {
  it('zgoda z osobą i godziną klubu, krok bieżący czeka, dalszy ma kreskę', () => {
    const view: ApprovalViewDto = {
      outcome: 'pending',
      steps: [
        { id: 's1', label: 'Mechanik', current: false, decision: zgoda('jba') },
        { id: 's2', label: 'Szef wyszkolenia', current: true, decision: null },
        { id: 's3', label: 'Prezes', current: false, decision: null },
      ],
    };
    const rows = historyRows(view, osoba, TZ);
    expect(rows[0]).toEqual({
      id: 's1',
      label: '1 · Mechanik',
      value: 'zgoda',
      tone: 'plain',
      who: { name: 'Jan Bąk', code: 'JBA' },
      when: '24 wrz, 18:40',
      note: null,
    });
    expect(rows[1]).toMatchObject({ label: '2 · Szef wyszkolenia', value: 'czeka na decyzję', tone: 'amber' });
    expect(rows[2]).toMatchObject({ label: '3 · Prezes', value: '—', tone: 'dim' });
    expect(pathPill(view)).toEqual({ label: 'Czeka na krok 2 z 3', tone: 'amber' });
    expect(currentStepLabel(view)).toBe('Szef wyszkolenia');
  });

  it('pominięcie jest zapisem, odmowa niesie powód, a krok po odmowie nie „czeka"', () => {
    const view: ApprovalViewDto = {
      outcome: 'rejected',
      steps: [
        { id: 's1', label: 'Mechanik', current: false, decision: { ...zgoda('pwi')!, via: 'self' } },
        {
          id: 's2',
          label: 'Szef',
          current: false,
          decision: { decision: 'rejected', via: 'person', reason: 'Po przeglądzie dopiero w poniedziałek.', decidedBy: 'ghost', decidedAt: '2026-09-24T17:02:00Z' },
        },
        { id: 's3', label: 'Prezes', current: false, decision: null },
      ],
    };
    const rows = historyRows(view, osoba, TZ);
    expect(rows[0]).toMatchObject({ value: 'przeszedł sam', note: 'rezerwujący jest na liście kroku', who: null });
    // Osoby nie ma na liście członków: kreska, nigdy surowy identyfikator.
    expect(rows[1]).toMatchObject({ value: 'odmowa', who: { name: '—', code: null }, note: 'Po przeglądzie dopiero w poniedziałek.' });
    expect(rows[2]).toMatchObject({ value: '—', tone: 'dim' });
    expect(pathPill(view)).toEqual({ label: 'Odrzucona', tone: 'dim' });
    expect(currentStepLabel(view)).toBeNull();
  });

  it('klub bez ścieżki nie ma plakietki ani karty', () => {
    expect(pathPill({ outcome: 'confirmed', steps: [] })).toBeNull();
    expect(pathPill({ outcome: 'confirmed', steps: [{ id: 's1', label: 'M', current: false, decision: zgoda('jba') }] })).toEqual({
      label: 'Potwierdzona',
      tone: 'dim',
    });
  });
});
