/**
 * UZ Aero — panel: tożsamość zalogowanego udostępniona drzewu.
 *
 * CIENKA wygoda nad cache'em Query, nie drugie źródło prawdy
 * (`docs/architektura-panelu-frontend.md` §4.1): jedynym magazynem sesji zostaje
 * zapytanie `['me']`. Ten kontekst istnieje po to, żeby sidebar i topbar nie wołały
 * hooka niezależnie od siebie i nie rozjechały się w stanie ładowania.
 *
 * Plik eksportuje WYŁĄCZNIE komponent — sam kontekst i hook `useSessionState` mieszkają
 * w `sessionContext.ts`, bo inaczej Fast Refresh odrzuca ten moduł i każda edycja
 * providera przeładowuje stronę (powód zapisany tam).
 */

import type { ReactNode } from 'react';

import { useSession } from '../queries/useSession';
import { SessionContext, type SessionState } from './sessionContext';

export function SessionProvider({ children }: { children: ReactNode }) {
  const query = useSession();

  const value: SessionState = {
    session: query.data ?? null,
    loading: query.isPending,
    error: query.error,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
