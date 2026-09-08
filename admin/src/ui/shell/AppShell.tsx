/**
 * UZ Aero - panel: rama aplikacji - pasek górny, kolumna boczna i miejsce na treść.
 *
 * Styl lekki (issue #107, 2026-09-08): układ jak w GitLabie. Pasek 48 px niesie
 * WYŁĄCZNIE markę (link na ekran startowy) i zalogowanego; nawigacja stoi w kolumnie
 * 240 px - kontekst klubu nad pozycjami modułów z `nav.ts`. Kolory bez zmian wobec
 * panelu 2.0 (`tokens.css`): lekkość wychodzi z układu i typografii, nie z palety.
 *
 * Czego tu NIE MA i dlaczego:
 *  • **zegara UTC** - w panelu nie ma ani jednej kolumny z czasem, więc zegar nie
 *    miałby czego kwalifikować. Wraca razem z modułem, w którym czas coś znaczy;
 *  • **liczników przy pozycjach** - liczba, której nie ma jak kliknąć, jest ozdobą;
 *  • **okruszków w ramie** - okruszki należą do EKRANU (`Breadcrumbs`) i stoją tylko
 *    tam, gdzie ekran leży pod innym ekranem (dziennik).
 *
 * == KONTEKST KLUBU (wielofirmowość 2.0.0) ==
 * `org` jest OPCJONALNE: sesja panelu nie zna jeszcze klubu (epiki B–F issue #97).
 * Gdy go dostanie, kafel pojawia się w kolumnie nad pozycjami - także przy jednym
 * członkostwie, bo nazwa klubu odpowiada na pytanie „czyj to dziennik" przy każdym
 * wklejonym linku. Do tego czasu kolumna zaczyna się od pozycji modułów.
 */

import { Link, NavLink } from 'react-router-dom';

import { BookIcon, BugIcon, PeopleIcon, PlaneIcon, SignOutIcon, SwitchIcon } from '../components/icons';
import { initials } from './initials';
import { HOME, NAV_ITEMS, type NavIcon } from './nav';

const ICONS: Record<NavIcon, (props: { size?: number }) => React.ReactNode> = {
  logbook: BookIcon,
  people: PeopleIcon,
  plane: PlaneIcon,
  bug: BugIcon,
};

export interface ShellOrg {
  /** Nazwa klubu, w którym pracuje ta sesja. */
  name: string;
  /** Dokąd prowadzi kafel - wybór klubu (nowa sesja bez ponownego logowania). */
  switchTo: string;
}

interface AppShellProps {
  /** Imię i nazwisko zalogowanego - jedyna rzecz, którą pasek o nim mówi. */
  who: string;
  /** Kontekst klubu w kolumnie - patrz nagłówek pliku. */
  org?: ShellOrg;
  onLogout: () => void;
  logoutPending: boolean;
  children: React.ReactNode;
}

export function AppShell({ who, org, onLogout, logoutPending, children }: AppShellProps) {
  return (
    <>
      <header className="topbar">
        <Link className="brand" to={HOME}>
          <span className="brand-mark">
            <PlaneIcon size={14} />
          </span>
          <span className="brand-name">UZ AERO</span>
        </Link>

        <div className="topbar-right">
          <span className="who">
            <span className="avatar" aria-hidden="true">
              {initials(who)}
            </span>
            <span className="who-name">{who}</span>
          </span>
          <button type="button" className="btn ghost sm" onClick={onLogout} disabled={logoutPending}>
            <SignOutIcon size={13} />
            Wyloguj
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Nawigacja panelu">
          {org == null ? null : (
            <Link className="sidebar-context" to={org.switchTo} title="Zmień klub">
              <span className="context-mark" aria-hidden="true">
                {initials(org.name)}
              </span>
              <span className="context-body">
                <span className="context-kind">Klub</span>
                <span className="context-name">{org.name}</span>
              </span>
              <SwitchIcon size={14} />
            </Link>
          )}

          <nav className="sidebar-nav" aria-label="Sekcje panelu">
            {NAV_ITEMS.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                >
                  <Icon size={16} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main className="content">
          <div className="page">{children}</div>
        </main>
      </div>
    </>
  );
}
