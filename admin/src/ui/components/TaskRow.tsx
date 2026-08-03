/**
 * UZ Aero — panel: WIERSZ KOLEJKI „WYMAGA UWAGI" (`.todo-row` z `SZABLON.html`).
 *
 * Jedyny wzorzec w panelu, który STAWIA ZADANIE, a nie opisuje stan — stąd wiersz jest
 * linkiem w głąb, a wiek sprawy ma własną kolumnę: flaga leżąca trzeci dzień to inny
 * problem niż ta sprzed godziny.
 *
 * Komponent nie decyduje ani o tonie znacznika, ani o tym, czy wiek jest „stary":
 * jedno i drugie przychodzi z `screens/dashboard/dashboardTodo.ts` z testem w Node.
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export type TaskTone = 'amber' | 'red' | 'blue';

interface TaskRowProps {
  to: string;
  tone: TaskTone;
  icon: ReactNode;
  name: string;
  /** Zawsze TEKST, nigdy HTML — opis niesie treść payloadów z telefonów. */
  meta: string;
  age: string;
  /** `true` = sprawa czeka dłużej niż dobę; wiek dostaje bursztyn. */
  old?: boolean;
}

export function TaskRow({ to, tone, icon, name, meta, age, old = false }: TaskRowProps) {
  return (
    <Link className="todo-row" to={to}>
      <span className={`todo-mark ${tone}`}>{icon}</span>
      <span className="todo-body">
        <span className="todo-name">{name}</span>
        <span className="todo-meta">{meta}</span>
      </span>
      <span className={old ? 'todo-age old' : 'todo-age'}>{age}</span>
    </Link>
  );
}
