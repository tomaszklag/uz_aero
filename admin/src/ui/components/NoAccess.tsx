/**
 * UZ Aero - panel: „twoja rola tego nie obejmuje" (`.no-access` z `SZABLON.html`).
 *
 * Osobny komponent od `EmptyState`, mimo podobnego układu - bo mówi coś innego.
 * Pusta lista znaczy „nic tu nie ma"; ten ekran znaczy „coś tu jest, ale nie dla
 * Ciebie". Jedna klasa na oba przypadki kazałaby człowiekowi zgadywać, czy patrzy
 * na awarię, na pusty system, czy na własne uprawnienia - a to trzy różne rozmowy
 * z administratorem.
 *
 * **To NIE jest zabezpieczenie.** Serwer odrzuca żądanie zdolnością (`domain/roles.ts`)
 * przy każdym wejściu; tutaj chodzi o to, żeby zamiast pustej tabeli i cichego 403
 * człowiek zobaczył zdanie o tym, kogo prosić. Ten sam powód, dla którego pozycja
 * nawigacji zostaje WIDOCZNA i wyszarzona, a nie znika.
 */

import type { ReactNode } from 'react';

interface NoAccessProps {
  icon: ReactNode;
  title: string;
  /** Kogo prosić - tekst z `auth/can.ts`, nie nazwa zdolności. */
  reason: string;
  /** Co ten ekran w ogóle pokazuje: bez tego blokada nie tłumaczy, czego dotyczy. */
  note: ReactNode;
}

export function NoAccess({ icon, title, reason, note }: NoAccessProps) {
  return (
    <div className="no-access">
      <span className="empty-icon">{icon}</span>
      <span className="empty-title">{title}</span>
      <span className="pill amber">{reason}</span>
      <span className="empty-note">{note}</span>
    </div>
  );
}
