/**
 * UZ Aero — panel: dostępność akcji na koncie i komunikaty odmowy.
 *
 * Dwie własności, których złamanie jest usterką PRODUKTOWĄ, a nie kosmetyczną:
 *  1. przycisk zablokowany ZAWSZE niesie powód (nigdy sama kłódka);
 *  2. odmowa serwera tłumaczy ZASADĘ, a nie kod — bo to jest ta chwila, w której
 *     człowiek sięga po `UPDATE` w psql.
 */

import { describe, expect, it } from 'vitest';

import type { Capability, PilotListItemDto } from '../../api/dto';
import {
  accountFailure,
  activeAction,
  activeChangeCopy,
  canManage,
  editAction,
  refusalText,
  resetAction,
  secretCopy,
} from './kontoActions';

const ADMIN: Capability[] = [
  'panel.access',
  'flags.resolve',
  'events.correct',
  'accounts.manage',
  'fleet.manage',
  'thresholds.manage',
  'audit.read',
];
const LEAD: Capability[] = ['panel.access', 'flags.resolve'];

const pilot = (over: Partial<PilotListItemDto> = {}): PilotListItemDto => ({
  id: 'id-1',
  code: 'KZA',
  name: 'Katarzyna Zawadzka',
  email: 'k.zawadzka@uzaero.pl',
  active: true,
  role: 'pilot',
  updatedAt: '2026-07-31T06:41:00.000Z',
  flyingDays: 6,
  ...over,
});

describe('zdolność', () => {
  it('kontami zarządza administrator, nie szef wyszkolenia', () => {
    expect(canManage(ADMIN)).toBe(true);
    expect(canManage(LEAD)).toBe(false);
    expect(canManage(undefined)).toBe(false);
  });
});

describe('akcje w wierszu', () => {
  it('szef wyszkolenia widzi WSZYSTKIE przyciski zablokowane — z powodem', () => {
    for (const action of [
      resetAction(pilot(), LEAD),
      activeAction(pilot(), LEAD, 'inny'),
      editAction(LEAD),
    ]) {
      expect(action.enabled).toBe(false);
      expect(action.reason).toContain('administrator');
    }
  });

  it('reset hasła konta NIEAKTYWNEGO jest zablokowany z konkretnym powodem', () => {
    const action = resetAction(pilot({ active: false }), ADMIN);
    expect(action.enabled).toBe(false);
    expect(action.reason).toContain('najpierw aktywuj');
  });

  it('administrator nie deaktywuje WŁASNEGO konta — blokada widoczna od razu', () => {
    const action = activeAction(pilot({ id: 'ja' }), ADMIN, 'ja');
    expect(action.enabled).toBe(false);
    expect(action.reason).toContain('Twoje konto');
  });

  it('AKTYWACJA własnego konta nie jest blokowana — tu nic się nie odcina', () => {
    // Konto nieaktywne, którym patrzysz na panel, nie istnieje (brama odcina je
    // natychmiast), ale reguła ma być o tym, co odbiera dostęp, a nie o właścicielu.
    expect(activeAction(pilot({ id: 'ja', active: false }), ADMIN, 'ja').enabled).toBe(true);
  });

  it('cudze konto administrator deaktywuje bez przeszkód po stronie panelu', () => {
    expect(activeAction(pilot(), ADMIN, 'ktos-inny')).toEqual({ enabled: true, reason: null });
  });
});

describe('odmowa serwera', () => {
  it('409 `refused` tłumaczy ZASADĘ, nie kod', () => {
    const failure = accountFailure(409, { error: 'refused', reason: 'last_admin' });
    expect(failure.final).toBe(true);
    expect(failure.detail).toBe(refusalText('last_admin'));
    expect(failure.detail).toContain('ostatnie aktywne konto');
    expect(failure.detail).not.toContain('last_admin');
  });

  it('409 `conflict` mówi, KTÓRE pole jest zajęte', () => {
    expect(accountFailure(409, { error: 'conflict', field: 'code' }).title).toContain(
      'kod pilota',
    );
    expect(accountFailure(409, { error: 'conflict', field: 'email' }).title).toContain('e-mail');
  });

  it('400 `no_changes` nie straszy — to nie jest awaria', () => {
    const failure = accountFailure(400, { error: 'no_changes' });
    expect(failure.tone).toBe('warn');
    expect(failure.final).toBe(false);
  });

  it('403 podaje, czyja to rola; 401 mówi o natychmiastowym odcięciu', () => {
    expect(accountFailure(403, { error: 'forbidden' }).detail).toContain('administrator');
    expect(accountFailure(401, { error: 'unauthorized' }).detail).toContain('KAŻDYM żądaniu');
  });

  it('brak sieci (`status: null`) nie udaje odmowy serwera', () => {
    const failure = accountFailure(null, null);
    expect(failure.title).toContain('połączenia');
    expect(failure.final).toBe(false);
  });

  it('nieznany status nie gubi kodu — administrator ma czego szukać', () => {
    expect(accountFailure(503, { error: 'boom' }).detail).toContain('503');
  });

  it('każdy powód odmowy ma polskie zdanie, nie surowy kod', () => {
    for (const reason of ['self_deactivate', 'self_demote', 'last_admin', 'inactive_account'] as const) {
      expect(refusalText(reason).length).toBeGreaterThan(40);
      expect(refusalText(reason)).not.toContain('_');
    }
  });
});

describe('napis nad hasłem pokazanym raz', () => {
  it('po założeniu konta mówi o przekazaniu i o PIN-ie', () => {
    expect(secretCopy('create', 0).note).toContain('PIN');
  });

  it('po resecie podaje LICZBĘ zerwanych sesji i odmienia rzeczownik', () => {
    expect(secretCopy('reset', 1).note).toContain('1 sesję');
    expect(secretCopy('reset', 2).note).toContain('2 sesje');
    expect(secretCopy('reset', 5).note).toContain('5 sesji');
    expect(secretCopy('reset', 12).note).toContain('12 sesji');
    expect(secretCopy('reset', 22).note).toContain('22 sesje');
  });

  it('zero sesji to osobne zdanie, nie „0 sesji"', () => {
    expect(secretCopy('reset', 0).note).toContain('nie miał żywych sesji telefonu');
  });

  it('mówi o OBU rodzajach sesji — także wtedy, gdy liczba wynosi zero', () => {
    // `revokedSessions` liczy wyłącznie refresh tokeny telefonu; sesji panelu nie ma
    // w bazie i nikt jej nie zliczał. Zdanie „ten pilot nie miał aktywnych sesji"
    // byłoby przy zerze fałszywe o panelu, który właśnie stracił dostęp.
    for (const n of [0, 1, 7]) {
      expect(secretCopy('reset', n).note).toContain('Sesja panelu');
      expect(secretCopy('reset', n).note).toContain('telefonu');
    }
  });
});

describe('baner po zmianie dostępu do konta', () => {
  it('deaktywacja ODMIENIA liczebnik — „1 sesję", nie „1 sesji"', () => {
    // To jest wada, dla której ta funkcja powstała: szuflada składała napis w JSX-ie
    // i wychodziło z tego „Unieważniono 1 sesji", mimo że `sessionWord` stał obok.
    expect(activeChangeCopy(false, 1).note).toContain('Unieważniono 1 sesję telefonu');
    expect(activeChangeCopy(false, 3).note).toContain('Unieważniono 3 sesje telefonu');
    expect(activeChangeCopy(false, 5).note).toContain('Unieważniono 5 sesji telefonu');
    expect(activeChangeCopy(false, 22).note).toContain('Unieważniono 22 sesje telefonu');
  });

  it('zero sesji telefonu to osobne zdanie, a panel odcina się mimo to', () => {
    const copy = activeChangeCopy(false, 0);
    expect(copy.note).not.toContain('0 sesji');
    expect(copy.note).toContain('nie miał żywych sesji telefonu');
    expect(copy.note).toContain('Sesja panelu');
  });

  it('aktywacja mówi o powrocie i o tym, że stare sesje NIE wracają', () => {
    const copy = activeChangeCopy(true, 0);
    expect(copy.title).toContain('aktywowane');
    expect(copy.note).toContain('martwe');
    // Aktywacja nie zrywa niczego, więc liczba sesji nie ma tu czego opisywać.
    expect(copy.note).not.toContain('Unieważniono');
  });
});
