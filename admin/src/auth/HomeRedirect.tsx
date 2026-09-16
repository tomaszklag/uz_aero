/**
 * Ninerdeck - panel: dokąd prowadzi goły adres i adres spoza mapy tras.
 *
 * Do wielofirmowości był to stały `#/dziennik` - jedna linijka w `routes.tsx`. Odkąd
 * panel obsługuje DWA rodzaje sesji (klub i platforma), stała odsyłałaby
 * superadministratora na ekran, którego jego sesja nie otwiera: `#/dziennik` woła
 * trasę klubu, ta odpowiada 401, a człowiek dostaje pustą tabelę z błędem zamiast
 * swojej kolejki zgłoszeń.
 *
 * Cel wybiera więc `homeFor` z tych samych zdolności, z których powstaje kolumna
 * boczna (`ui/shell/nav.ts`) - jedna reguła na „dokąd wolno wejść", nie dwie.
 *
 * Komponent stoi POD `ShellRoute`, więc sesja tu JEST (brama odesłała już każdego bez
 * niej na ekran logowania). `?? undefined` jest wyłącznie po to, żeby ta zależność nie
 * była założeniem: bez sesji cel schodzi do ekranu startowego klubu, jak dotąd.
 */

import { Navigate } from 'react-router-dom';

import { homeFor } from '../ui/shell/nav';
import { useSessionState } from './sessionContext';

export function HomeRedirect() {
  const { session } = useSessionState();
  return <Navigate to={homeFor(session?.capabilities)} replace />;
}
