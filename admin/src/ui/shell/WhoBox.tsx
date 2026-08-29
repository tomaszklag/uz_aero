/**
 * UZ Aero - panel: stopka sidebara z tożsamością (`.who` z `SZABLON.html`).
 *
 * Rola pod nazwiskiem nie jest ozdobą: to jedyne miejsce, w którym człowiek widzi,
 * DLACZEGO część pozycji nawigacji jest wyszarzona.
 */

import type { PanelPilotDto } from '../../api/dto';
import { Button } from '../components/Button';
import { SignOutIcon } from '../components/icons';
import { initials, roleLabel } from './whoLabels';

interface WhoBoxProps {
  pilot: PanelPilotDto;
  onLogout: () => void;
  logoutDisabled?: boolean;
}

export function WhoBox({ pilot, onLogout, logoutDisabled = false }: WhoBoxProps) {
  return (
    <>
      <div className="who">
        <span className="who-avatar">{initials(pilot.name)}</span>
        <span className="who-body">
          <span className="who-name">{pilot.name}</span>
          <span className="who-role">{roleLabel(pilot.role)}</span>
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={onLogout} disabled={logoutDisabled}>
        <SignOutIcon />
        Wyloguj
      </Button>
    </>
  );
}
