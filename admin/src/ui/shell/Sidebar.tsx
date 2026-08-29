/**
 * UZ Aero - panel: sidebar (`.sidebar` z `SZABLON.html`).
 *
 * Znak marki, cztery grupy nawigacji, stopka z tożsamością. Komponent NIE ZNA
 * `queries/` ani `api/` - zdolności i pilota dostaje propsami, tak jak każdy inny
 * element `ui/` (`docs/architektura-panelu-frontend.md` §2.1, pilnuje test architektury).
 */

import { Fragment } from 'react';

import type { Capability, PanelPilotDto } from '../../api/dto';
import { can, denialReason } from '../../auth/can';
import { PlaneIcon } from '../components/icons';
import { NavItem } from './NavItem';
import type { NavCount } from './navCounts';
import { NAV_GROUPS } from './navItems';
import { WhoBox } from './WhoBox';

interface SidebarProps {
  pilot: PanelPilotDto;
  capabilities: Capability[];
  navCounts?: Partial<Record<string, NavCount>>;
  onLogout: () => void;
  logoutDisabled?: boolean;
}

export function Sidebar({ pilot, capabilities, navCounts, onLogout, logoutDisabled }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Nawigacja panelu">
      <div className="brand">
        <span className="brand-mark">
          <PlaneIcon />
        </span>
        <span>
          <div className="brand-name">UZ AERO</div>
          <div className="brand-role">Panel administracyjny</div>
        </span>
      </div>

      <div className="side-nav">
        {/* Fragment, nie `<div>`: `.side-nav` jest kolumną flex, a opakowanie grupy
            w element złamałoby odstępy z mockupu (`gap:2px` na POZYCJACH). */}
        {NAV_GROUPS.map((group) => (
          <Fragment key={group.title}>
            <div className="nav-group">{group.title}</div>
            {group.items.map((item) => {
              const allowed = can(capabilities, item.capability);
              return (
                <NavItem
                  key={item.to}
                  {...item}
                  locked={!allowed}
                  lockReason={allowed ? undefined : denialReason(item.capability)}
                  count={navCounts?.[item.to]}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="side-foot">
        <WhoBox pilot={pilot} onLogout={onLogout} logoutDisabled={logoutDisabled} />
      </div>
    </nav>
  );
}
