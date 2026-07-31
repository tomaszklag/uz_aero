/**
 * UZ Aero — panel: stan pusty (`.empty` z `SZABLON.html`).
 *
 * `note` jest OBOWIĄZKOWE, bo pusty ekran bez wyjaśnienia to najgorsza możliwa
 * odpowiedź narzędzia diagnostycznego: nie odróżnia „nic się nie zdarzyło" od
 * „nic nie dotarło".
 */

import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  note: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, note, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <span className="empty-title">{title}</span>
      <span className="empty-note">{note}</span>
      {action}
    </div>
  );
}
