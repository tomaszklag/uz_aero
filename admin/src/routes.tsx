/**
 * UZ Aero — panel: mapa tras.
 *
 * **Routing na hashu** (`#/dni/<uuid>`), bo statyczny build panelu stoi za
 * `@fastify/static` i nie ma fallbacku SPA (`docs/architektura-panelu-frontend.md` §7, §9).
 * Fallback „wszystko pod `/admin/*` → index.html" musiałby uważać, żeby nie przesłonić
 * zasobów i nie połknąć 404 z API — a to realne źródło błędów, którego za jeden znak
 * `#` w adresie po prostu nie kupujemy.
 *
 * Trasy wynikają z KANONICZNEJ nawigacji (`ui/shell/navItems.tsx`), a nie z drugiej
 * listy obok niej: pozycja sidebara prowadząca w 404 jest awarią, której nikt nie
 * zauważa, bo klika się ją rzadko.
 */

import { createHashRouter, Navigate } from 'react-router-dom';

import { LoginRoute } from './auth/LoginRoute';
import { ShellRoute } from './auth/ShellRoute';
import { WBudowieScreen } from './screens/wBudowie/WBudowieScreen';
import { NAV_GROUPS } from './ui/shell/navItems';

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export const router = createHashRouter([
  { path: '/logowanie', element: <LoginRoute /> },
  {
    path: '/',
    element: <ShellRoute />,
    children: [
      // Wejście na goły adres panelu ląduje na pulpicie — pierwszej pozycji
      // nawigacji, zgodnie z mockupem `A01`.
      { index: true, element: <Navigate to="/pulpit" replace /> },
      ...NAV_ITEMS.map((item) => ({
        // `path` bez wiodącego ukośnika: trasy potomne są względne wobec `/`.
        path: item.to.slice(1),
        element: <WBudowieScreen title={item.label} mockup={item.mockup} />,
      })),
      {
        path: '*',
        element: <WBudowieScreen title="Nie znaleziono" mockup={null} />,
      },
    ],
  },
]);
