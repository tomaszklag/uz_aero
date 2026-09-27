/**
 * Ninerdeck - panel: rama aplikacji - pasek górny, kolumna boczna i miejsce na treść.
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
 * == KONTEKST SESJI (wielofirmowość 2.0.0, issue #101 E2) ==
 * Kafel nad pozycjami modułów mówi, W CZYM pracuje ta sesja: w klubie („Klub · Aeroklub
 * Zielonogórski") albo na platformie („Superadministrator · Wszystkie kluby"). Stoi
 * TAKŻE przy jednym zakresie, bo odpowiada na pytanie „czyj to dziennik" przy każdym
 * wklejonym linku; linkiem staje się dopiero wtedy, gdy jest dokąd przełączyć.
 * Co z tego wynika, rozstrzyga `shellScope` - tutaj zostaje samo rysowanie.
 */

import { Link, NavLink } from 'react-router-dom';

import type { Capability } from '../../api/dto';
import {
  CalendarIcon,
  BookIcon,
  BugIcon,
  BuildingIcon,
  ChartIcon,
  InboxIcon,
  PeopleIcon,
  PlaneIcon,
  SignOutIcon,
  SwitchIcon,
} from '../components/icons';
import { initials } from './initials';
import { ACCOUNT, COUNTED, homeFor, navItemsFor, type NavIcon } from './nav';
import type { ShellScope } from './scope';

const ICONS: Record<NavIcon, (props: { size?: number }) => React.ReactNode> = {
  logbook: BookIcon,
  inbox: InboxIcon,
  calendar: CalendarIcon,
  chart: ChartIcon,
  people: PeopleIcon,
  plane: PlaneIcon,
  bug: BugIcon,
  building: BuildingIcon,
};

interface AppShellProps {
  /** Imię i nazwisko zalogowanego - jedyna rzecz, którą pasek o nim mówi. */
  who: string;
  /** Kontekst sesji w kolumnie - patrz nagłówek pliku. */
  scope?: ShellScope | null;
  /**
   * Zdolności sesji - decydują, KTÓRE pozycje ma kolumna (`navItemsFor`) i gdzie
   * prowadzi marka. Sesja platformowa nie ma modułów klubu, więc jej kolumna jest
   * inna, a nie ta sama z kłódkami (issue #99 C6).
   */
  capabilities: readonly Capability[];
  /**
   * Liczba spraw „Do sprawdzenia" (3.2.0, P-D) - plakietka przy JEDNEJ pozycji
   * (`COUNTED`) i wyłącznie przy liczbie dodatniej: zero i „nie wiem" (`null`, brak
   * odpowiedzi albo sesja bez tego modułu) wyglądają tak samo, bo stan „nic nie czeka"
   * nie dostaje ozdoby (reguła SyncChipa, issue #12). Liczbę liczy serwer.
   */
  attentionCount?: number | null;
  onLogout: () => void;
  logoutPending: boolean;
  children: React.ReactNode;
}

export function AppShell({
  who,
  scope,
  capabilities,
  attentionCount = null,
  onLogout,
  logoutPending,
  children,
}: AppShellProps) {
  // Rodzaj sesji rozstrzyga Kalendarz (issue #216): każda sesja KLUBU go ma - także
  // z pustym zakresem - a platforma nie ma go wcale. Bez kafla zakresu (rama w testach)
  // rysujemy ramę klubu, bo platforma ZAWSZE ma kafel.
  const kind = scope?.kind ?? 'org';
  const items = navItemsFor(capabilities, kind);
  return (
    <>
      <header className="topbar">
        <Link className="brand" to={homeFor(capabilities, kind)}>
          <span className="brand-mark">
            <PlaneIcon size={14} />
          </span>
          <span className="brand-name">NINERDECK</span>
        </Link>

        <div className="topbar-right">
          {/* NAZWISKO JEST WEJŚCIEM NA `#/konto` (2.1.0, issue #134 D6). Konto nie jest
              modułem klubu, więc nie ma pozycji w kolumnie - a wejście z nazwiska w pasku
              jest tym miejscem, w którym każdy szuka go z innych aplikacji web. */}
          <Link className="who" to={ACCOUNT} title="Moje konto">
            <span className="avatar" aria-hidden="true">
              {initials(who)}
            </span>
            <span className="who-name">{who}</span>
          </Link>
          <button type="button" className="btn ghost sm" onClick={onLogout} disabled={logoutPending}>
            <SignOutIcon size={13} />
            Wyloguj
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Nawigacja panelu">
          {scope == null ? null : <ScopeTile scope={scope} />}

          <nav className="sidebar-nav" aria-label="Sekcje panelu">
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                >
                  <Icon size={16} />
                  {item.label}
                  {item.to === COUNTED && attentionCount != null && attentionCount > 0 ? (
                    <span className="nav-count" aria-label={`${attentionCount} do sprawdzenia`}>
                      {attentionCount}
                    </span>
                  ) : null}
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

/**
 * Kafel zakresu. Bez przełącznika NIE jest linkiem - `<a>` prowadzące na ekran wyboru
 * z jedną kartą wygląda jak akcja i nią nie jest, a przy okazji łapie kliknięcie, które
 * miało trafić w nazwę klubu.
 *
 * Znak: inicjały klubu (jak awatar zalogowanego) albo ikona budynku dla platformy -
 * „WK" od „Wszystkie kluby" byłoby skrótem od zdania, a nie od nazwy.
 */
function ScopeTile({ scope }: { scope: ShellScope }) {
  const className = scope.kind === 'platform' ? 'sidebar-context scope' : 'sidebar-context';
  const body = (
    <>
      <span className="context-mark" aria-hidden="true">
        {scope.kind === 'platform' ? <BuildingIcon size={14} /> : initials(scope.name)}
      </span>
      <span className="context-body">
        <span className="context-kind">{scope.label}</span>
        <span className="context-name">{scope.name}</span>
      </span>
      {scope.switchTo == null ? null : <SwitchIcon size={14} />}
    </>
  );

  if (scope.switchTo == null) return <div className={className}>{body}</div>;

  return (
    <Link className={className} to={scope.switchTo} title="Zmień zakres">
      {body}
    </Link>
  );
}
