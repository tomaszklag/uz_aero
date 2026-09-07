/**
 * UZ Aero - panel 2.0: rama aplikacji - pasek górny i miejsce na treść.
 *
 * Cała nawigacja panelu mieści się w jednym pasku 56 px: znak po lewej, zakładki
 * pośrodku, zalogowany po prawej. Czego tu NIE MA i dlaczego:
 *  • **okruszków** - „Panel / Konfiguracja / Piloci" opisywało jedno kliknięcie;
 *  • **zegara UTC** - w panelu 2.0 nie ma ani jednej kolumny z czasem, więc zegar
 *    nie miałby czego kwalifikować. Wraca razem z modułem, w którym czas coś znaczy;
 *  • **licznika spraw przy zakładkach** - liczba, której nie ma jak kliknąć, jest
 *    ozdobą; wraca razem ze skrzynką flag.
 */

import { NavLink } from 'react-router-dom';

import { PlaneIcon, SignOutIcon } from '../components/icons';
import { TABS } from './tabs';

interface AppShellProps {
  /** Imię i nazwisko zalogowanego - jedyna rzecz, którą pasek o nim mówi. */
  who: string;
  onLogout: () => void;
  logoutPending: boolean;
  children: React.ReactNode;
}

export function AppShell({ who, onLogout, logoutPending, children }: AppShellProps) {
  return (
    <>
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">
            <PlaneIcon size={13} />
          </span>
          <span className="brand-name">UZ AERO</span>
        </span>

        <nav className="tabs" aria-label="Sekcje panelu">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-right">
          <span className="who-name">{who}</span>
          <button type="button" className="btn ghost sm" onClick={onLogout} disabled={logoutPending}>
            <SignOutIcon size={13} />
            Wyloguj
          </button>
        </div>
      </header>

      <main className="content">{children}</main>
    </>
  );
}
