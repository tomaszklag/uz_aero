/**
 * UZ Aero — panel: wiersz dziennika audytu.
 *
 * Testujemy głównie BRAKI, bo to one są tu treścią: konto skasowane, akcja spoza
 * katalogu, wpis bez adresu IP i akcja bez pojedynczego obiektu. Każdy z tych
 * przypadków ma zostać na liście widoczny i opisany — dziennik nadzoru, który je
 * ukrywa albo zamienia na milczącą kreskę, przestaje odpowiadać na pytanie
 * „kto to ruszał".
 */

import { describe, expect, it } from 'vitest';

import type { AuditEntryDto } from '../../api/dto';
import { auditRows, shortTarget } from './audytRows';

const base: AuditEntryDto = {
  id: 8814,
  createdAt: '2026-07-31T14:19:02.000Z',
  actorPilotId: 'TMK',
  actorCode: 'TMK',
  actorName: 'Tomasz Małkiewicz',
  actorRole: 'admin',
  action: 'export.retry',
  targetType: 'sheet',
  targetId: '2026-07-29_SP-KLM',
  details: { revision: 3 },
  ip: '10.20.4.11',
};

const row = (patch: Partial<AuditEntryDto> = {}) => auditRows([{ ...base, ...patch }])[0]!;

describe('wiersz dziennika audytu', () => {
  it('czas ma SEKUNDY i numer wpisu — w rejestrze sekundy rozstrzygają kolejność', () => {
    const view = row();
    expect(view.when.text).toBe('31 JUL 2026 14:19:02');
    // Numer wpisu składamy z `base.id`, a nie z literału `#8814`: skaner architektury
    // szuka w kodzie hexów kolorów, a `#8814` jest dla niego nieodróżnialny od `#88AA44`.
    expect(view.when.sub).toBe(`#${base.id}`);
  });

  it('nie przesortowuje listy — porządek zostaje serwera', () => {
    const rows = auditRows([
      { ...base, id: 3, createdAt: '2026-07-31T10:00:00.000Z' },
      { ...base, id: 9, createdAt: '2026-07-31T18:00:00.000Z' },
      { ...base, id: 5, createdAt: '2026-07-31T12:00:00.000Z' },
    ]);
    expect(rows.map((r) => r.id)).toEqual([3, 9, 5]);
  });

  it('KONTO, KTÓREGO JUŻ NIE MA: wiersz zostaje, z identyfikatorem i wyjaśnieniem', () => {
    const view = row({ actorPilotId: 'ZZZ', actorCode: null, actorName: null, actorRole: 'admin' });

    expect(view.actor.name).toBe('ZZZ');
    expect(view.actor.missing).toBe(true);
    expect(view.actor.sub).toContain('konta nie ma');
    // Identyfikator do zawężenia zostaje sprawny — po człowieku, którego konto
    // skasowano, tym bardziej chce się zobaczyć wszystkie ślady.
    expect(view.actor.pilotId).toBe('ZZZ');
  });

  it('rola jest przepisana Z WPISU, także gdy nie ma jej w dzisiejszym katalogu', () => {
    // `actor_role` opisuje stan świata z chwili akcji i nie jest złączeniem z `pilots`.
    expect(row({ actorRole: 'superadmin' }).actor.sub).toContain('superadmin');
  });

  it('KOD AKCJI SPOZA KATALOGU trafia do wiersza dosłownie', () => {
    const view = row({ action: 'pilot.merge' });

    expect(view.action.code).toBe('pilot.merge');
    expect(view.action.known).toBe(false);
    expect(view.action.tone).toBe('dim');
  });

  it('akcja BEZ obiektu nie udaje braku danych', () => {
    // Konserwacja działa na całym systemie. „Nieznany obiekt" byłby tu kłamstwem
    // o innym charakterze niż „nie dotyczy pojedynczego bytu".
    const view = row({ action: 'maintenance.prune_tokens', targetType: null, targetId: null });

    expect(view.target.text).toBe('—');
    expect(view.target.sub).toContain('bez pojedynczego obiektu');
    // Bez pary (typ, id) nie ma czego zawęzić — link nie powstaje, zamiast prowadzić
    // do pustej listy.
    expect(view.target.link).toBeNull();
  });

  it('obiekt z parą (typ, id) daje wejście z kontekstem', () => {
    const view = row({
      targetType: 'event',
      targetId: '4c88aa10-0000-4000-8000-000000009a01',
    });
    expect(view.target.text).toBe('4c88…9a01');
    expect(view.target.link).toEqual({
      targetType: 'event',
      targetId: '4c88aa10-0000-4000-8000-000000009a01',
    });
  });

  it('brak adresu IP znaczy „akcja spoza żądania HTTP", nie „nie wiadomo"', () => {
    const view = row({ ip: null });
    expect(view.ip).toEqual({ text: '—', offline: true });
    expect(row().ip).toEqual({ text: '10.20.4.11', offline: false });
  });

  it('szczegóły przechodzą przez słownik i zachowują pola nieznane', () => {
    const view = row({ details: { revision: 3, attempt: 6 } });

    expect(view.details.map((d) => d.key)).toEqual(['revision', 'attempt']);
    expect(view.details[0]!.known).toBe(true);
    expect(view.details[1]!.known).toBe(false);
  });

  it('UUID skracamy do rozpoznania, krótkie identyfikatory zostają w całości', () => {
    expect(shortTarget('4c88aa10-0000-4000-8000-000000009a01')).toBe('4c88…9a01');
    expect(shortTarget('1044')).toBe('1044');
    expect(shortTarget('SP-KLM')).toBe('SP-KLM');
  });

  it('nieczytelny stempel czasu daje kreskę, a nie „Invalid Date"', () => {
    expect(row({ createdAt: 'to nie jest data' }).when.text).toBe('—');
  });
});
