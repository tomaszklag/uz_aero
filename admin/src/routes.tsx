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
import { BugsScreen } from './screens/bugs/BugsScreen';
import { AircraftLogScreen } from './screens/logbook/AircraftLogScreen';
import { LogbookScreen } from './screens/logbook/LogbookScreen';
import { SessionScreen } from './screens/logbook/SessionScreen';
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

      // Dziennik ma TRZY osobne trasy, nie segment opcjonalny jak konta i flota:
      // poziom 3 nie jest warstwą nad listą, tylko dokumentem na pełnej stronie,
      // więc lista pod spodem nie ma czego trzymać.
      //
      // W adresie stoi REJESTRACJA, nie identyfikator - `#/dziennik/SP-KLM` człowiek
      // przeczyta i wpisze z pamięci, a o to w wymogu „do wklejenia" chodziło.
      { path: 'dziennik', element: <LogbookScreen /> },
      { path: 'dziennik/:reg', element: <AircraftLogScreen /> },
      { path: 'dziennik/:reg/:uuid', element: <SessionScreen /> },

      // Konta i flota: lista i karta pod JEDNĄ trasą, z segmentem opcjonalnym. Karta
      // otwiera się NAD listą, więc lista ma zostać pod spodem - osobna trasa
      // przemontowywałaby ekran przy każdym otwarciu, czyli tabela migałaby dokładnie
      // wtedy, gdy jest potrzebna jako kontekst decyzji. `nowy` w miejscu identyfikatora
      // to ten sam widok z pustym formularzem.
      { path: 'piloci/:id?', element: <AccountsScreen /> },
      { path: 'samoloty/:id?', element: <FleetScreen /> },

      // Zgłoszenia: lista i karta pod JEDNĄ trasą, jak konta i flota - karta
      // otwiera się NAD listą, więc lista ma zostać pod spodem jako kontekst.
      { path: 'zgloszenia/:uuid?', element: <BugsScreen /> },

      // Adres spoza mapy prowadzi na ekran startowy. Osobnej strony „nie znaleziono"
      // nie ma świadomie: panel ma trzy moduły, więc taka strona opisywałaby literówkę
      // w pasku przeglądarki, a nie stan systemu.
      { path: '*', element: <Navigate to={HOME} replace /> },
    ],
  },
]);
