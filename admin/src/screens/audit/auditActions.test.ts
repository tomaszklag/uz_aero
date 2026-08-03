/**
 * UZ Aero — panel: katalog akcji dziennika (`A09`).
 *
 * Najważniejszy przypadek w tym pliku to NIEZNANY KOD. Kolumna `admin_audit.action`
 * celowo nie ma `CHECK`-a (migracja 9), więc dziennik może nieść akcję wycofaną
 * z katalogu — a ekran nadzoru, który wywraca się na własnej historii albo ją ukrywa,
 * przestaje być narzędziem nadzoru.
 */

import { describe, expect, it } from 'vitest';

import {
  actionsOfGroup,
  actionView,
  AUDIT_ACTION_META,
  AUDIT_ACTIONS,
  AUDIT_GROUPS,
  isAuditAction,
  isAuditGroup,
} from './auditActions';

describe('katalog akcji audytu', () => {
  it('każda akcja ma ton, grupę, nazwę po polsku i zdanie „co zapisujemy"', () => {
    // `Record<AdminAction, …>` wymusza komplet kluczy kompilatorem; tu sprawdzamy,
    // że żaden wpis nie jest pusty — bo pusty napis kompilator przepuści.
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(10);

    for (const code of AUDIT_ACTIONS) {
      const meta = AUDIT_ACTION_META[code];
      expect(meta.label.length).toBeGreaterThan(3);
      expect(meta.records.length).toBeGreaterThan(20);
      expect(['green', 'amber', 'red', 'blue', 'dim']).toContain(meta.tone);
    }
  });

  it('grupy pokrywają KOMPLET katalogu i nie dublują akcji', () => {
    // Chip, który nie prowadzi do żadnej akcji, i akcja bez chipa to ta sama wada:
    // pasek filtrów przestaje być pełnym opisem tego, co panel potrafi zmienić.
    const grouped = AUDIT_GROUPS.flatMap((group) => group.actions);

    expect([...grouped].sort()).toEqual([...AUDIT_ACTIONS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('konta i flota mają po kilka kodów — chip grupy to nie alias jednej akcji', () => {
    expect(actionsOfGroup('konta')).toEqual([
      'pilot.create',
      'pilot.update',
      'pilot.deactivate',
      'pilot.password_reset',
    ]);
    expect(actionsOfGroup('flota')).toEqual([
      'aircraft.create',
      'aircraft.update',
      'aircraft.disable',
    ]);
    expect(actionsOfGroup('konserwacja')).toHaveLength(3);
  });

  it('KOD SPOZA KATALOGU wraca DOSŁOWNIE, wygaszony i opisany', () => {
    const view = actionView('pilot.merge');

    expect(view.code).toBe('pilot.merge');
    expect(view.known).toBe(false);
    expect(view.tone).toBe('dim');
    // Podpis tłumaczy, skąd taki wpis się bierze — „—" kazałoby zgadywać,
    // czy to awaria panelu, czy uszkodzony wiersz.
    expect(view.label).toContain('katalogu');
  });

  it('kod znany dostaje ton i nazwę z katalogu, ale kod zostaje surowy', () => {
    const view = actionView('event.correct');

    expect(view).toMatchObject({ code: 'event.correct', known: true, tone: 'amber' });
    expect(view.label).toBe('korekta po oknie 24 h');
  });

  it('pusty napis i śmieci też nie wywracają widoku', () => {
    // Wartość z bazy przechodzi tu bez walidacji — bo walidacja przy odczycie
    // znaczyłaby, że dziennik nie otwiera się przez własną zawartość.
    expect(actionView('').known).toBe(false);
    expect(actionView('   ').code).toBe('   ');
    expect(actionView('constructor').known).toBe(false);
    // `hasOwnProperty` zamiast `in`: bez tego `toString` czy `constructor`
    // odziedziczone z prototypu uchodziłyby za znane akcje.
    expect(isAuditAction('toString')).toBe(false);
  });

  it('strażniki wejścia z URL-a odróżniają grupę od kodu i odrzucają resztę', () => {
    expect(isAuditGroup('konta')).toBe(true);
    expect(isAuditGroup('flag.resolve')).toBe(false);
    expect(isAuditAction('flag.resolve')).toBe(true);
    expect(isAuditAction('konta')).toBe(false);
    expect(isAuditAction(null)).toBe(false);
    expect(isAuditGroup(null)).toBe(false);
  });
});
