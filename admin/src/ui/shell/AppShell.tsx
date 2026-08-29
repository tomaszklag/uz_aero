/**
 * UZ Aero - panel: RAMA aplikacji (`.shell` z `SZABLON.html`).
 *
 * Sidebar + (topbar + treść). Rama jest komponentem, a nie ekranem: nie wie, co
 * renderuje, i nie sięga po dane. Treść wstawia router (`<Outlet/>`), okruszki
 * i tożsamość przychodzą propsami.
 */

import type { ReactNode } from 'react';

import type { Capability, PanelPilotDto } from '../../api/dto';
import type { NavCount } from './navCounts';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface AppShellProps {
  pilot: PanelPilotDto;
  capabilities: Capability[];
  trail: string[];
  /** Plakietki liczbowe przy pozycjach nawigacji, kluczowane adresem pozycji. */
  navCounts?: Partial<Record<string, NavCount>>;
  onLogout: () => void;
  logoutDisabled?: boolean;
  children: ReactNode;
}

export function AppShell({
  pilot,
  capabilities,
  trail,
  navCounts,
  onLogout,
  logoutDisabled,
  children,
}: AppShellProps) {
  return (
    <div className="shell">
      <Sidebar
        pilot={pilot}
        capabilities={capabilities}
        navCounts={navCounts}
        onLogout={onLogout}
        logoutDisabled={logoutDisabled}
      />
      <div className="main">
        <Topbar trail={trail} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
