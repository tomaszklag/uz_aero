/**
 * UZ Aero - panel: trasa logowania (A00) razem z odbiciem zalogowanego.
 *
 * Zalogowany, który trafi na `#/logowanie` (zakładka, przycisk „wstecz"), wraca na
 * pulpit zamiast oglądać formularz - formularz logowania pokazany komuś, kto JEST
 * zalogowany, wygląda jak wylogowanie i prowokuje do wpisania hasła bez powodu.
 */

import { Navigate } from 'react-router-dom';

import { LoginScreen } from '../screens/login/LoginScreen';
import { useSessionState } from './sessionContext';

export function LoginRoute() {
  const { session, loading } = useSessionState();

  if (loading) return null;
  if (session != null) return <Navigate to="/pulpit" replace />;

  return <LoginScreen />;
}
