/**
 * Dokąd wraca pilot po restarcie - i kiedy kokpit ma puścić (`holdsAircraft`).
 */

import { emptySessionState, type SessionState } from '../domain';
import { holdsAircraft, resumeTarget } from '../ui/navigation/resumeTarget';

const held = (): SessionState => ({
  ...emptySessionState(),
  sessionUuid: 's-1',
  aircraftId: 'ac-1',
});

describe('holdsAircraft / resumeTarget', () => {
  it('maszyna trzymana → kokpit; bez operacji → Mój dzień', () => {
    expect(holdsAircraft(held())).toBe(true);
    expect(resumeTarget(held())).toBe('Cockpit');
    expect(resumeTarget(null)).toBe('MyDay');
    expect(resumeTarget(emptySessionState())).toBe('MyDay');
  });

  it('ZDANY samolot wraca do «Mój dzień» - także zakończony przez administratora', () => {
    expect(holdsAircraft({ ...held(), closed: true })).toBe(false);
    expect(holdsAircraft({ ...held(), closed: true, closedByAdmin: true })).toBe(false);
  });

  it('operacja UNIEWAŻNIONA w toku też puszcza kokpit (issue #81)', () => {
    // Administrator potrafi wycofać operację bez zamykania; wycofanego wpisu nie da
    // się prowadzić dalej, więc kokpit nad nim pokazywałby maszynę, której rejestr
    // pilotowi już nie przypisuje.
    expect(holdsAircraft({ ...held(), voided: true, voidedByAdmin: true })).toBe(false);
    expect(resumeTarget({ ...held(), voided: true })).toBe('MyDay');
  });
});
