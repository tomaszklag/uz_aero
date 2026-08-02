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
import { AuditScreen } from './screens/audit/AuditScreen';
import { DaysScreen } from './screens/days/DaysScreen';
import { DayScreen } from './screens/day/DayScreen';
import { EventsScreen } from './screens/events/EventsScreen';
import { ExportsScreen } from './screens/exports/ExportsScreen';
import { FlagsScreen } from './screens/flags/FlagsScreen';
import { FleetScreen } from './screens/fleet/FleetScreen';
import { MaintenanceScreen } from './screens/maintenance/MaintenanceScreen';
import { PilotsScreen } from './screens/pilots/PilotsScreen';
import { DashboardScreen } from './screens/dashboard/DashboardScreen';
import { UnderConstructionScreen } from './screens/underConstruction/UnderConstructionScreen';
import { NAV_GROUPS } from './ui/shell/navItems';

/** Pozycje nawigacji, dla których ekran już istnieje — nie dostają „w budowie". */
const IMPLEMENTED = new Set([
  '/pulpit',
  '/dni',
  '/flagi',
  '/audyt',
  '/piloci',
  '/flota',
  '/eksporty',
  '/zdarzenia',
  '/konserwacja',
]);

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

      // Pulpit (`A01`) i wariant „cisza" (`A01a`) to JEDNA trasa i jeden ekran, a nie
      // dwie: cisza nie jest osobnym widokiem, tylko innym stanem tych samych danych.
      // Rozdzielenie ich na dwa adresy kazałoby panelowi rozstrzygać PRZED pobraniem,
      // który pokazać — czyli zgadywać stan, o który dopiero pyta.
      { path: 'pulpit', element: <DashboardScreen /> },

      // Skrzynka flag i jej szuflada pod JEDNYM ekranem: `A03a` otwiera się NAD listą,
      // więc `/flagi/1046` to ten sam widok z dodatkowym parametrem, a nie druga trasa.
      // Segment opcjonalny (`:id?`) trzyma to w jednym wpisie i nie przemontowuje ekranu
      // przy otwieraniu szuflady — inaczej lista pod spodem migałaby przy każdym wejściu
      // w sprawę, czyli traciłaby dokładnie ten kontekst, dla którego szuflada istnieje.
      { path: 'flagi/:id?', element: <FlagsScreen /> },

      // Lista dni i karta dnia to DWA ekrany, nie jeden z parametrem — inaczej niż
      // przy flagach. Powód jest w mockupach: `A03a` to szuflada NAD listą (kontekst
      // skrzynki zostaje pod spodem), a `A02a` to pełna strona, która listę zastępuje.
      // Karta dnia ma własne kafle, oś zdarzeń i tabelę lotów; trzymanie jej w tej samej
      // trasie kazałoby ekranowi listy pobierać dane, których nigdy nie pokaże.
      { path: 'dni', element: <DaysScreen /> },
      { path: 'dni/:sessionUuid', element: <DayScreen /> },

      // Korekta administratora (`A02b`) — TEN SAM ekran co karta dnia, z dodatkowym
      // parametrem. Mockup pokazuje ją jako szufladę NAD kartą (dzień widać pod
      // spodem), a adres z paska przeglądarki niesie DWA identyfikatory: sesji
      // i korygowanego zdarzenia. Korekta nigdy nie dotyczy „dnia" — zawsze
      // konkretnego wpisu w rejestrze, więc trasa bez `:targetUuid` opisywałaby
      // operację, której nie ma. Wyboru zdarzenia dokonuje oś zdarzeń karty dnia;
      // osobnego ekranu wyboru nie budujemy.
      { path: 'dni/:sessionUuid/korekta/:targetUuid', element: <DayScreen /> },

      // Dziennik audytu (`A09`) — JEDNA trasa bez parametrów ścieżki, bo wpis audytu
      // nie ma ekranu szczegółu: cała jego treść mieści się w wierszu. Zawężenia
      // (konto, obiekt, grupa akcji, zakres dat) jadą query stringiem, żeby link
      // „ślad w audycie" z karty dnia i z korekty dało się wkleić.
      { path: 'audyt', element: <AuditScreen /> },

      // Rejestr zdarzeń (`A04`) — jedna trasa z OPCJONALNYM uuid-em zdarzenia, jak przy
      // flagach i kontach: rozwinięcie (surowy payload + nagłówek zdarzenia) otwiera się
      // POD wierszem, więc lista ma zostać na ekranie. Segment opcjonalny trzyma to
      // w jednym wpisie i nie przemontowuje ekranu przy rozwijaniu wiersza — inaczej
      // tabela migałaby przy każdym kliknięciu, czyli traciłaby dokładnie ten kontekst,
      // dla którego rozwinięcie jest rozwinięciem, a nie osobną stroną.
      //
      // Zawężenia (samolot, pilot, sesja, typ, zakres dat, urządzenie) jadą query
      // stringiem po polsku, żeby link „gdzie jest zdarzenie uuid=…" dało się wkleić
      // w zgłoszeniu — `ANALIZA` §3 nazywa to podstawowym scenariuszem współpracy.
      { path: 'zdarzenia/:uuid?', element: <EventsScreen /> },

      // Monitor eksportu (`A05`) — jedna trasa z OPCJONALNYM uuid-em sesji, jak przy
      // flagach i kontach: rozwinięcie wiersza (historia rewizji + podgląd karty)
      // otwiera się POD tabelą, więc lista ma zostać na ekranie. Segment opcjonalny
      // trzyma to w jednym wpisie i nie przemontowuje ekranu przy wyborze wiersza —
      // inaczej tabela migałaby przy każdym kliknięciu.
      { path: 'eksporty/:sessionUuid?', element: <ExportsScreen /> },

      // Konta pilotów (`A06`) i szuflada konta (`A06a`) pod JEDNYM ekranem — jak przy
      // flagach, bo szuflada otwiera się NAD listą i kontekst tabeli ma zostać pod
      // spodem: decyzja o roli zapada w porównaniu z resztą kont. Segment opcjonalny
      // (`:id?`) trzyma to w jednym wpisie i nie przemontowuje ekranu przy otwieraniu
      // szuflady — inaczej lista migałaby przy każdym wejściu w konto.
      //
      // `#/piloci/nowe` jest tym samym widokiem z pustym formularzem (mockup A06a ma
      // ten adres w pasku przeglądarki), a `?akcja=haslo` otwiera wariant „reset hasła"
      // z zablokowaną tożsamością. Oba są deep-linkowalne, bo oba bywają wklejane.
      { path: 'piloci/:id?', element: <PilotsScreen /> },

      // Flota (`A07`) i szuflada samolotu (`A07a`) pod JEDNYM ekranem — jak przy
      // kontach i flagach, bo szuflada otwiera się NAD listą i kontekst tabeli ma
      // zostać pod spodem: skutki zmiany pojemności czyta się w porównaniu z resztą
      // floty (progi innych jednostek stoją w karcie obok). Segment opcjonalny
      // (`:id?`) trzyma to w jednym wpisie i nie przemontowuje ekranu przy otwieraniu
      // szuflady.
      //
      // `#/flota/nowy` jest tym samym widokiem z pustym formularzem — mockup A07a
      // ma ten adres w pasku przeglądarki i bywa wklejany.
      { path: 'flota/:id?', element: <FleetScreen /> },

      // Konserwacja (`A11`) — JEDNA trasa bez parametrów i bez stanu w URL-u, inaczej
      // niż wszystkie listy panelu. Powód: na tym ekranie nie ma czego deep-linkować.
      // Raport różnic powstaje na żądanie i opisuje chwilę uruchomienia, a nie zawężenie,
      // które dałoby się komuś wkleić; wklejony link do „porównania" obiecywałby wynik,
      // a odtworzyłby wyłącznie pusty formularz. Przejścia W GŁĄB (do dnia, do flagi,
      // do karty) prowadzą stąd na ekrany, które adresy mają.
      { path: 'konserwacja', element: <MaintenanceScreen /> },

      ...NAV_ITEMS.map((item) => ({
        // `path` bez wiodącego ukośnika: trasy potomne są względne wobec `/`.
        path: item.to.slice(1),
        element: <UnderConstructionScreen title={item.label} mockup={item.mockup} />,
      })),

      {
        path: '*',
        element: <UnderConstructionScreen title="Nie znaleziono" mockup={null} />,
      },
    ],
  },
]);
