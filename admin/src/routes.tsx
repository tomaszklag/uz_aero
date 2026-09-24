/**
 * Ninerdeck - panel 2.0: mapa tras.
 *
 * **Routing na hashu** (`#/piloci/<id>`), bo statyczny build panelu stoi za
 * `@fastify/static` i nie ma fallbacku SPA. Fallback „wszystko pod `/admin/*` →
 * index.html" musiałby uważać, żeby nie przesłonić zasobów i nie połknąć 404 z API -
 * a to realne źródło błędów, którego za jeden znak `#` w adresie nie kupujemy.
 *
 * Trasy wynikają z KANONICZNEJ nawigacji (`ui/shell/nav.ts`), a nie z drugiej listy
 * obok niej: pozycja prowadząca w 404 jest awarią, której nikt nie zauważa. Trasa modułu
 * platformy pyta dodatkowo o zdolność (`RequireCapability`) - patrz issue #99 C6.
 */

import { createHashRouter } from 'react-router-dom';

import { HomeRedirect } from './auth/HomeRedirect';
import { RequireCapability } from './auth/RequireCapability';
import { ShellRoute } from './auth/ShellRoute';
import { AccountsScreen } from './screens/accounts/AccountsScreen';
import { BugsScreen } from './screens/bugs/BugsScreen';
import { ScopePickScreen } from './screens/clubs/ScopePickScreen';
import { AircraftLogScreen } from './screens/logbook/AircraftLogScreen';
import { LogbookScreen } from './screens/logbook/LogbookScreen';
import { SessionScreen } from './screens/logbook/SessionScreen';
import { ApprovalPathScreen } from './screens/calendar/ApprovalPathScreen';
import { CalendarScreen } from './screens/calendar/CalendarScreen';
import { DecisionQueueScreen } from './screens/calendar/DecisionQueueScreen';
import { FleetScreen } from './screens/fleet/FleetScreen';
import { AccountScreen } from './screens/me/AccountScreen';
import { ForgotPasswordScreen } from './screens/login/ForgotPasswordScreen';
import { LoginScreen } from './screens/login/LoginScreen';
import { SignUpScreen } from './screens/login/SignUpScreen';
import { ACCOUNT, FORGOT_PASSWORD, SIGN_UP } from './ui/shell/nav';
import { OrganizationsScreen } from './screens/organizations/OrganizationsScreen';

export const router = createHashRouter([
  { path: '/logowanie', element: <LoginScreen /> },
  // „Nie pamiętam hasła" (2.1.0) stoi POZA ramą z tego samego powodu, co logowanie:
  // sesji jeszcze nie ma. Pod `/logowanie/`, bo to jest krok logowania - nie moduł
  // i nie ustawienie konta (tamto jest na `#/konto`, już w ramie).
  { path: FORGOT_PASSWORD, element: <ForgotPasswordScreen /> },
  // „Załóż konto" (issue #180) - ta sama natura, co wyżej: krok logowania bez sesji,
  // list z linkiem, a osoba powstaje dopiero na stronie z linku.
  { path: SIGN_UP, element: <SignUpScreen /> },
  // Wybór zakresu stoi POZA ramą, jak logowanie: klub nie jest jeszcze wybrany, więc
  // pasek górny i kolumna boczna nie miałyby czego w sobie napisać. To drugi krok
  // logowania (mockup `00a-wybor-klubu`), nie moduł.
  { path: '/klub', element: <ScopePickScreen /> },
  {
    path: '/',
    element: <ShellRoute />,
    children: [
      { index: true, element: <HomeRedirect /> },

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
      //
      // Piloci mają TRZY szuflady nad jedną listą i każda ma własny adres, bo każda
      // opisuje inny byt: członka klubu (`:id`), KANDYDATA z kolejki zgłoszeń
      // (`zgloszenia/:id` - osoba, która nie ma jeszcze kodu) i KOD KLUBU (`kod` -
      // konfiguracja klubu, nie człowiek). Rozstrzyga to trasa, a nie ekran czytający
      // adres w środku: `zgloszenia` i `kod` byłyby dla `:id?` zwykłym identyfikatorem.
      { path: 'piloci/kod', element: <AccountsScreen drawer="club-code" /> },
      { path: 'piloci/zgloszenia/:id', element: <AccountsScreen drawer="request" /> },
      { path: 'piloci/:id?', element: <AccountsScreen drawer="account" /> },
      { path: 'samoloty/:id?', element: <FleetScreen /> },

      // Kalendarz: siatka i szuflada pod JEDNĄ trasą, jak flota - szuflada opisuje
      // jedną zajętość i otwiera się NAD siatką, więc siatka ma zostać pod spodem
      // jako kontekst decyzji. Formularze (wyłączenie z użytku, rezerwacja za pilota)
      // adresu NIE MAJĄ: nie opisują istniejącego bytu, tylko go tworzą.
      // Konfiguracja i kolejka modułu Kalendarz (3.1.0, issue #165) mają WŁASNE adresy
      // PRZED `:id?`, bo `sciezka` i `decyzje` byłyby dla niego identyfikatorem zajętości
      // - ta sama reguła, co `piloci/kod` przed `piloci/:id?`. Oba pytają o zdolność:
      // ścieżka to rozdanie władzy (`accounts.manage`), kolejka - moje kroki
      // (`reservations.approve`); wklejony adres bez zdolności wraca na ekran startowy.
      // Krok ścieżki ma adres jak każda szuflada nad listą (`nowy` = nowy krok).
      {
        path: 'kalendarz/sciezka/:stepId?',
        element: (
          <RequireCapability capability="accounts.manage">
            <ApprovalPathScreen />
          </RequireCapability>
        ),
      },
      {
        path: 'kalendarz/decyzje',
        element: (
          <RequireCapability capability="reservations.approve">
            <DecisionQueueScreen />
          </RequireCapability>
        ),
      },
      { path: 'kalendarz/:id?', element: <CalendarScreen /> },

      // Moduł PLATFORMY (`docs/wielofirmowosc.md` §8.1), więc trasa pyta o zdolność -
      // ta sama reguła, co przy Zgłoszeniach: wklejony adres odsyła administratora klubu
      // na jego ekran startowy, a nie pokazuje mu ramy modułu, którego dane serwer
      // i tak odmówi. `nowy` w miejscu identyfikatora to ten sam widok z pustą kartą.
      {
        path: 'organizacje/:id?',
        element: (
          <RequireCapability capability="platform.manage">
            <OrganizationsScreen />
          </RequireCapability>
        ),
      },

      // Zgłoszenia: lista i karta pod JEDNĄ trasą, jak konta i flota - karta
      // otwiera się NAD listą, więc lista ma zostać pod spodem jako kontekst.
      // Moduł PLATFORMY (issue #99 C6), więc trasa pyta o zdolność: wklejony adres
      // ma odesłać administratora klubu na jego ekran startowy, a nie pokazać mu ramę
      // modułu, którego dane serwer i tak odmówi.
      {
        path: 'zgloszenia/:uuid?',
        element: (
          <RequireCapability capability="bugs.triage">
            <BugsScreen />
          </RequireCapability>
        ),
      },

      // MOJE KONTO (2.1.0) - w ramie, ale BEZ zdolności i bez pozycji w kolumnie:
      // hasło i własne urządzenia ma każdy zalogowany, także superadministrator bez
      // klubu. Adres stoi przy kanonicznej liście tras (`ui/shell/nav.ts`), bo wejście
      // jest z paska górnego, a nie z kolumny.
      { path: ACCOUNT.slice(1), element: <AccountScreen /> },

      // Adres spoza mapy prowadzi na ekran startowy. Osobnej strony „nie znaleziono"
      // nie ma świadomie: modułów jest kilka i żaden nie ma podstron, więc taka strona
      // opisywałaby literówkę w pasku przeglądarki, a nie stan systemu.
      { path: '*', element: <HomeRedirect /> },
    ],
  },
]);
