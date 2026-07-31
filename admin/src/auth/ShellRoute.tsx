/**
 * UZ Aero — panel: brama sesji dla wszystkiego, co jest ZA logowaniem.
 *
 * Jedno miejsce, w którym panel odpowiada na pytanie „czy wolno tu wejść" — i jedno,
 * w którym składa ramę. Rozsianie tego po ekranach dałoby konstrukcję, w której nikt
 * nie wie, czy każdy ekran pamiętał o sprawdzeniu.
 *
 * To NIE JEST zabezpieczenie, tylko nawigacja: dane i tak wydaje serwer i to on
 * odrzuca żądania bez sesji. Tutaj chodzi o to, żeby człowiek zobaczył ekran
 * logowania zamiast pustej ramy z pustymi tabelami.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useLogout } from '../queries/useSession';
import { AppShell } from '../ui/shell/AppShell';
import { trailFor } from '../ui/shell/navTrail';
import { useSessionState } from './SessionProvider';

export function ShellRoute() {
  const { session, loading } = useSessionState();
  const location = useLocation();
  const logout = useLogout();

  // Pierwsze `GET /me` trwa jedno żądanie. Świadomie BEZ spinnera („nie dodawaj
  // loadera bez określonego celu", `CLAUDE.md`): migający na ułamek sekundy ekran
  // ładowania jest gorszy od niczego, a dłuższe czekanie znaczy awarię sieci,
  // którą i tak pokaże ekran logowania.
  if (loading) return null;

  if (session == null) return <Navigate to="/logowanie" replace />;

  return (
    <AppShell
      pilot={session.pilot}
      capabilities={session.capabilities}
      trail={trailFor(location.pathname)}
      onLogout={() => logout.mutate()}
      logoutDisabled={logout.isPending}
    >
      <Outlet />
    </AppShell>
  );
}
