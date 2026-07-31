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

import { useFlagCount } from '../queries/useFlags';
import { useLogout } from '../queries/useSession';
import { AppShell } from '../ui/shell/AppShell';
import { openFlagsCount } from '../ui/shell/navCounts';
import { trailFor } from '../ui/shell/navTrail';
import { useSessionState } from './sessionContext';

export function ShellRoute() {
  const { session, loading } = useSessionState();
  const location = useLocation();
  const logout = useLogout();

  // Licznik otwartych spraw wisi w SIDEBARZE, więc pobiera go rama, a nie ekran flag:
  // plakietka jest widoczna na każdym ekranie panelu (tak rysują ją wszystkie mockupy
  // `A0x`) i to jedyne miejsce, w którym administrator dowiaduje się o zaległej
  // sprawie, nie będąc na jej ekranie. Zapytanie dzieli klucz ze skrzynką, więc
  // wejście na `#/flagi` nie dokłada drugiego żądania.
  const openFlags = useFlagCount('open', session != null);

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
      navCounts={{ '/flagi': openFlagsCount(openFlags.data) }}
      onLogout={() => logout.mutate()}
      logoutDisabled={logout.isPending}
    >
      <Outlet />
    </AppShell>
  );
}
