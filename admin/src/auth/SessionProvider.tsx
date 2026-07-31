/**
 * UZ Aero — panel: tożsamość zalogowanego udostępniona drzewu.
 *
 * CIENKA wygoda nad cache'em Query, nie drugie źródło prawdy
 * (`docs/architektura-panelu-frontend.md` §4.1): jedynym magazynem sesji zostaje
 * zapytanie `['me']`. Ten kontekst istnieje po to, żeby sidebar i topbar nie wołały
 * hooka niezależnie od siebie i nie rozjechały się w stanie ładowania.
 */

import { createContext, useContext, type ReactNode } from 'react';

import type { PanelSessionDto } from '../api/dto';
import { useSession } from '../queries/useSession';

export interface SessionState {
  /** `null` = nie ma sesji (nie „jeszcze nie wiemy" — od tego jest `loading`). */
  session: PanelSessionDto | null;
  loading: boolean;
  /** Awaria SIECI, nie odmowa serwera — 401/403 są normalną odpowiedzią `null`. */
  error: unknown;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const query = useSession();

  const value: SessionState = {
    session: query.data ?? null,
    loading: query.isPending,
    error: query.error,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionState(): SessionState {
  const value = useContext(SessionContext);
  // Rzucamy zamiast zwracać wartość zastępczą: komponent poza providerem to błąd
  // złożenia aplikacji, a cichy „brak sesji" wyglądałby jak wylogowanie.
  if (value == null) throw new Error('useSessionState poza <SessionProvider>');
  return value;
}
