/**
 * UZ Aero - panel 2.0: brama sesji dla wszystkiego, co jest ZA logowaniem.
 *
 * Jedno miejsce, w którym panel odpowiada na pytanie „czy wolno tu wejść" - i jedno,
 * w którym składa ramę. Rozsianie tego po ekranach dałoby konstrukcję, w której nikt
 * nie wie, czy każdy ekran pamiętał o sprawdzeniu.
 *
 * To NIE JEST zabezpieczenie, tylko nawigacja: dane i tak wydaje serwer i to on
 * odrzuca żądania bez sesji. Tutaj chodzi o to, żeby człowiek zobaczył ekran
 * logowania zamiast pustej ramy z pustymi tabelami.
 *
 * == DLACZEGO PODCZAS PIERWSZEGO PYTANIA NIE MA JESZCZE RAMY ==
 * Bo rama znaczy „jesteś w środku", a tego jeszcze nie wiemy - narysowana przed
 * odpowiedzią mignęłaby każdemu, kto właśnie zostanie odesłany do logowania. Plamka
 * jest więc pojedyncza i wyśrodkowana, a przez pierwsze 180 ms nie ma nawet jej
 * (`skeletonGate.ts`): typowe `GET /me` wraca szybciej.
 */

import { Navigate, Outlet } from 'react-router-dom';

import { useLogout } from '../queries/useSession';
import { Loadable } from '../ui/components';
import { AppShell } from '../ui/shell/AppShell';
import { useSessionState } from './sessionContext';

export function ShellRoute() {
  const { session, loading } = useSessionState();
  const logout = useLogout();

  if (loading) {
    return (
      <Loadable
        pending
        skeleton={
          <div className="centered">
            <span className="skeleton" style={{ width: 220, height: 12 }} />
          </div>
        }
      >
        {null}
      </Loadable>
    );
  }

  if (session == null) return <Navigate to="/logowanie" replace />;

  return (
    <AppShell
      who={session.pilot.name}
      onLogout={() => logout.mutate()}
      logoutPending={logout.isPending}
    >
      <Outlet />
    </AppShell>
  );
}
