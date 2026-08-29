/**
 * UZ Aero - panel: link w TREŚCI komórki tabeli (`.cell-link` z `SZABLON.html`).
 *
 * Osobny komponent od `LinkButton`, bo pełni inną rolę w wierszu. `LinkButton` jest
 * AKCJĄ („Szczegóły", „Koryguj") i stoi w kolumnie akcji. Tu klikalna jest sama TREŚĆ
 * komórki - nazwisko w kolumnie „Kto", identyfikator w kolumnie „Obiekt" - i kliknięcie
 * zawęża listę do tej wartości. Gdyby to były przyciski, tabela o sześciu kolumnach
 * zamieniłaby się w farmę guzików, a mockup `A09` rysuje tam zwykły tekst.
 *
 * To nadal jest `<a href>`, nie `onClick` na komórce: filtr ma dać się otworzyć
 * w nowej karcie i skopiować jako adres - czyli dokładnie ten scenariusz, dla którego
 * filtry panelu mieszkają w URL-u.
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface CellLinkProps {
  to: string;
  /** Widoczny opis celu - komórka niesie samą wartość, więc kontekst dodajemy tutaj. */
  title: string;
  children: ReactNode;
}

export function CellLink({ to, title, children }: CellLinkProps) {
  return (
    <Link className="cell-link" to={to} title={title}>
      {children}
    </Link>
  );
}
