/**
 * UZ Aero — panel: siatka dwukolumnowa treści (`.cols` z `SZABLON.html`).
 *
 * Domyślnie `1fr 380px`: po lewej rzecz główna (oś zdarzeń dnia), po prawej przypisy
 * do niej (kafle sesji, paliwa, motogodzin). `even` daje `1fr 1fr` tam, gdzie obie
 * kolumny są równorzędne.
 *
 * Wariantu `wide` (`1fr 400px`) tu nie ma, bo nie ma jeszcze ekranu, który go używa
 * (pulpit, progi) — biblioteka rośnie paczkami pod konkretne ekrany, nie „na zapas".
 */

import type { ReactNode } from 'react';

interface ColumnsProps {
  /** `even` = `1fr 1fr`; bez tego prawa kolumna ma stałe 380 px. */
  even?: boolean;
  children: ReactNode;
}

export function Columns({ even = false, children }: ColumnsProps) {
  return <div className={even ? 'cols even' : 'cols'}>{children}</div>;
}
