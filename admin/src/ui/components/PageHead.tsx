/**
 * UZ Aero — panel: nagłówek strony (`.page-head` z `SZABLON.html`).
 *
 * Tytuł display, akapit wyjaśniający i akcje po prawej. `sub` nie jest opcjonalny
 * z tego samego powodu, dla którego `note` jest wymagane w stanie pustym: ekran
 * back-office'u, który nie tłumaczy, co pokazuje, zostawia człowieka z tabelą liczb
 * i domysłem.
 */

import type { ReactNode } from 'react';

interface PageHeadProps {
  title: string;
  sub: ReactNode;
  actions?: ReactNode;
}

export function PageHead({ title, sub, actions }: PageHeadProps) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{sub}</p>
      </div>
      {actions == null ? null : <div className="page-actions">{actions}</div>}
    </div>
  );
}
