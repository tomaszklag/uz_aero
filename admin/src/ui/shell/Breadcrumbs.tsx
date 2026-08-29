/**
 * UZ Aero - panel: okruszki w topbarze (`.crumbs` z `SZABLON.html`).
 *
 * Ostatni człon jest bieżącą stroną i to on jest wyróżniony (`<b>`), jak w mockupie.
 * Okruszki NIE SĄ linkami w v1: mają dwa poziomy („Panel / Dni lotne"), a link
 * na pierwszym poziomie prowadziłby donikąd - „Panel" nie jest ekranem.
 */

import { Fragment } from 'react';

interface BreadcrumbsProps {
  /** Od korzenia do bieżącej strony, np. `['Panel', 'Dni lotne']`. */
  trail: string[];
}

export function Breadcrumbs({ trail }: BreadcrumbsProps) {
  return (
    <div className="crumbs" aria-label="Ścieżka">
      {/* Fragment, a nie `<span>` opakowujące parę: szablon stylizuje KAŻDY `span`
          wewnątrz `.crumbs` na kolor separatora, więc opakowanie przemalowałoby
          okruszki na kolor kresek. */}
      {trail.map((crumb, index) => {
        const last = index === trail.length - 1;
        return (
          <Fragment key={crumb}>
            {index > 0 ? <span>/</span> : null}
            {last ? <b>{crumb}</b> : crumb}
          </Fragment>
        );
      })}
    </div>
  );
}
