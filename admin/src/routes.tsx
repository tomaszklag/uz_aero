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
import { DniScreen } from './screens/dni/DniScreen';
import { DzienScreen } from './screens/dzien/DzienScreen';
import { FlagiScreen } from './screens/flagi/FlagiScreen';
import { WBudowieScreen } from './screens/wBudowie/WBudowieScreen';
import { NAV_GROUPS } from './ui/shell/navItems';

/** Pozycje nawigacji, dla których ekran już istnieje — nie dostają „w budowie". */
const IMPLEMENTED = new Set(['/dni', '/flagi']);

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items).filter(
  (item) => !IMPLEMENTED.has(item.to),
);

export const router = createHashRouter([
  { path: '/logowanie', element: <LoginRoute /> },
  {
    path: '/',
    element: <ShellRoute />,
    children: [
      // Wejście na goły adres panelu ląduje na pulpicie — pierwszej pozycji
      // nawigacji, zgodnie z mockupem `A01`.
      { index: true, element: <Navigate to="/pulpit" replace /> },

      // Skrzynka flag i jej szuflada pod JEDNYM ekranem: `A03a` otwiera się NAD listą,
      // więc `/flagi/1046` to ten sam widok z dodatkowym parametrem, a nie druga trasa.
      // Segment opcjonalny (`:id?`) trzyma to w jednym wpisie i nie przemontowuje ekranu
      // przy otwieraniu szuflady — inaczej lista pod spodem migałaby przy każdym wejściu
      // w sprawę, czyli traciłaby dokładnie ten kontekst, dla którego szuflada istnieje.
      { path: 'flagi/:id?', element: <FlagiScreen /> },

      // Lista dni i karta dnia to DWA ekrany, nie jeden z parametrem — inaczej niż
      // przy flagach. Powód jest w mockupach: `A03a` to szuflada NAD listą (kontekst
      // skrzynki zostaje pod spodem), a `A02a` to pełna strona, która listę zastępuje.
      // Karta dnia ma własne kafle, oś zdarzeń i tabelę lotów; trzymanie jej w tej samej
      // trasie kazałoby ekranowi listy pobierać dane, których nigdy nie pokaże.
      { path: 'dni', element: <DniScreen /> },
      { path: 'dni/:sessionUuid', element: <DzienScreen /> },

      ...NAV_ITEMS.map((item) => ({
        // `path` bez wiodącego ukośnika: trasy potomne są względne wobec `/`.
        path: item.to.slice(1),
        element: <WBudowieScreen title={item.label} mockup={item.mockup} />,
      })),

      // Korekta zdarzenia (`A02b`) — ekran jeszcze nie istnieje, ale link do niego
      // TAK: szuflada flagi kieruje tu administratora, gdy błędna jest sama liczba.
      // Bez tego wpisu przycisk lądowałby na „nie znaleziono", czyli byłby martwym
      // linkiem — a tych w panelu nie zostawiamy.
      {
        path: 'dni/:sessionUuid/korekta',
        element: <WBudowieScreen title="Korekta zdarzenia" mockup="A02b-korekta.html" />,
      },

      {
        path: '*',
        element: <WBudowieScreen title="Nie znaleziono" mockup={null} />,
      },
    ],
  },
]);
