/**
 * UZ Aero — panel: pozycja nawigacji (`.nav-item` z `SZABLON.html`).
 *
 * Pozycja niedostępna dla roli jest **WIDOCZNA, wyszarzona i NIEKLIKALNA, z podanym
 * powodem** — nie ukryta. Ukrywanie zmusza człowieka do zgadywania, czy funkcji nie
 * ma w produkcie, czy nie ma jej ON.
 *
 * Zablokowana pozycja przestaje być linkiem (`<span>`, nie `<a>`), a nie „linkiem
 * z `onClick: preventDefault`": link, który wygląda na link i nie działa, jest
 * osiągalny tabem i myli klawiaturę. `aria-disabled` mówi to samo czytnikowi ekranu.
 */

import { NavLink } from 'react-router-dom';

import type { NavItemSpec } from './navItems';

interface NavItemProps extends NavItemSpec {
  locked: boolean;
  /** Powód blokady — widoczny jako `title`, wymagany, gdy `locked`. */
  lockReason?: string;
  /** Licznik po prawej (`.nav-count`); dochodzi z pulpitem i skrzynką flag. */
  count?: { value: number; tone?: 'amber' | 'red' };
}

export function NavItem({ to, label, icon, locked, lockReason, count }: NavItemProps) {
  const badge =
    count == null ? null : (
      <span className={count.tone == null ? 'nav-count' : `nav-count ${count.tone}`}>
        {count.value}
      </span>
    );

  if (locked) {
    return (
      <span className="nav-item locked" title={lockReason} aria-disabled="true">
        {icon}
        {label}
        {badge}
      </span>
    );
  }

  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
      {icon}
      {label}
      {badge}
    </NavLink>
  );
}
