/**
 * UZ Aero — panel: kontekst sesji i jego JEDYNY czytnik.
 *
 * Osobny plik od `SessionProvider.tsx` i to nie z upodobania do małych plików, tylko
 * z twardego powodu narzędziowego: **Fast Refresh odświeża moduł tylko wtedy, gdy ten
 * eksportuje same komponenty**. Hook `useSessionState` obok komponentu `SessionProvider`
 * sprawiał, że Vite odrzucał cały moduł jako granicę odświeżania:
 *
 *     [vite] invalidate /src/auth/SessionProvider.tsx:
 *     Could not Fast Refresh ("useSessionState" export is incompatible)
 *
 * …a unieważnienie szło w górę do `main.tsx`, który niczego nie przyjmuje — więc każda
 * edycja providera przeładowywała CAŁĄ stronę zamiast podmienić komponent. W panelu
 * znaczy to utratę stanu ekranu i ponowne `GET /me` przy każdym zapisie pliku.
 *
 * Dlaczego kontekst i hook zostają RAZEM, mimo rozbijania na atomy: to jedna
 * odpowiedzialność — dostęp do stanu sesji. Rozdzielenie ich kazałoby eksportować sam
 * obiekt kontekstu szerzej, a wtedy `useContext(SessionContext)` z pominięciem hooka
 * omijałby rzut niżej i wracał ciche `null`. Plik nie zawiera JSX i nie ma czego
 * odświeżać, więc nie jest granicą Fast Refresh — i dobrze, bo tożsamość kontekstu
 * MUSI przetrwać odświeżenie komponentów, które go czytają.
 */

import { createContext, useContext } from 'react';

import type { PanelSessionDto } from '../api/dto';

export interface SessionState {
  /** `null` = nie ma sesji (nie „jeszcze nie wiemy" — od tego jest `loading`). */
  session: PanelSessionDto | null;
  loading: boolean;
  /** Awaria SIECI, nie odmowa serwera — 401/403 są normalną odpowiedzią `null`. */
  error: unknown;
}

export const SessionContext = createContext<SessionState | null>(null);

export function useSessionState(): SessionState {
  const value = useContext(SessionContext);
  // Rzucamy zamiast zwracać wartość zastępczą: komponent poza providerem to błąd
  // złożenia aplikacji, a cichy „brak sesji" wyglądałby jak wylogowanie.
  if (value == null) throw new Error('useSessionState poza <SessionProvider>');
  return value;
}
