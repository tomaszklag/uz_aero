/**
 * UZ Aero - panel 2.0: mapa tras.
 *
 * **Routing na hashu** (`#/piloci/<id>`), bo statyczny build panelu stoi za
 * `@fastify/static` i nie ma fallbacku SPA. Fallback „wszystko pod `/admin/*` →
 * index.html" musiałby uważać, żeby nie przesłonić zasobów i nie połknąć 404 z API -
 * a to realne źródło błędów, którego za jeden znak `#` w adresie nie kupujemy.
 *
 * Trasy wynikają z KANONICZNEJ nawigacji (`ui/shell/tabs.ts`), a nie z drugiej listy
 * obok niej: zakładka prowadząca w 404 jest awarią, której nikt nie zauważa.
 */

import { createHashRouter, Navigate } from 'react-router-dom';

import { ShellRoute } from './auth/ShellRoute';
import { AccountsScreen } from './screens/accounts/AccountsScreen';
import { FleetScreen } from './screens/fleet/FleetScreen';
import { LoginScreen } from './screens/login/LoginScreen';
import { HOME } from './ui/shell/tabs';

export const router = createHashRouter([
  { path: '/logowanie', element: <LoginScreen /> },
  {
    path: '/',
    element: <ShellRoute />,
    children: [
      { index: true, element: <Navigate to={HOME} replace /> },

      // Lista i karta pod JEDNĄ trasą, z segmentem opcjonalnym: karta otwiera się NAD
      // listą i lista ma zostać pod spodem. Osobna trasa przemontowywałaby ekran przy
      // każdym otwarciu karty - czyli tabela migałaby dokładnie wtedy, gdy jest
      // potrzebna jako kontekst decyzji.
      //
      // `nowy` w miejscu identyfikatora to ten sam widok z pustym formularzem; adres
      // jest deep-linkowalny, bo bywa wklejany.
      { path: 'piloci/:id?', element: <AccountsScreen /> },
      { path: 'samoloty/:id?', element: <FleetScreen /> },

      // Adres spoza mapy prowadzi na ekran startowy. Osobnej strony „nie znaleziono"
      // nie ma świadomie: panel ma dwa adresy, więc taka strona opisywałaby literówkę
      // w pasku przeglądarki, a nie stan systemu.
      { path: '*', element: <Navigate to={HOME} replace /> },
    ],
  },
]);
