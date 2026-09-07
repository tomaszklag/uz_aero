/**
 * UZ Aero - panel 2.0: nagłówek strony (`.page-head`).
 *
 * `sub` jest OPCJONALNY i to jest zmiana wobec panelu 1.0, gdzie był wymagany
 * („ekran back-office'u, który nie tłumaczy, co pokazuje, zostawia człowieka z tabelą
 * liczb"). Przy tabeli, której pierwszą kolumną jest nazwisko, a tytułem „PILOCI",
 * zdanie wyjaśniające było opisem oczywistości - a każdy taki opis uczy pomijać
 * miejsce, w którym kiedyś stanie coś ważnego.
 */

import type { ReactNode } from 'react';

interface PageHeadProps {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}

export function PageHead({ title, sub, actions }: PageHeadProps) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub == null ? null : <p className="page-sub">{sub}</p>}
      </div>
      {actions == null ? null : <div className="page-actions">{actions}</div>}
    </div>
  );
}
