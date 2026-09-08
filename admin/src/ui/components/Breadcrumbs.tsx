/**
 * UZ Aero - panel: OKRUSZKI (`.crumbs`) - ścieżka nad nagłówkiem strony.
 *
 * Styl lekki (issue #107). WYŁĄCZNIE tam, gdzie ekran leży POD innym ekranem - dziś
 * tylko w dzienniku (flota → maszyna → operacja), gdzie zastąpiły przyciski „← Dziennik"
 * z nagłówka: droga powrotu jest ścieżką, nie akcją. Na liście modułu okruszek
 * opisywałby jedno kliknięcie w kolumnie obok - dokładnie to, za co panel 2.0 wyrzucił
 * okruszki z paska.
 *
 * Ostatni człon jest bieżącą stroną: nie jest linkiem i czyta się mocniej. Człony
 * z `to` są prawdziwymi linkami (`<Link>`), więc „kopiuj adres" i otwarcie w nowej
 * karcie działają - link „Dziennik" niesie zakres dat, z którego się przyszło.
 */

import { Fragment } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  /** Brak `to` = bieżąca strona. Zwykle tylko ostatni człon. */
  to?: string;
}

interface BreadcrumbsProps {
  items: readonly Crumb[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="crumbs" aria-label="Ścieżka">
      {items.map((item, index) => (
        <Fragment key={`${index}:${item.label}`}>
          {index === 0 ? null : (
            <span className="sep" aria-hidden="true">
              /
            </span>
          )}
          {item.to == null ? (
            <span className="current" aria-current="page">
              {item.label}
            </span>
          ) : (
            <Link to={item.to}>{item.label}</Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
