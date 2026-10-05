/**
 * Ninerdeck - BINDER ŁĄCZA KANAŁU KLUBU (4.0.0, `docs/kanal-klubu.md` §3.4, K1, K6;
 * epik KK-C #246).
 *
 * Łącze chodzi za `linkTarget`: na wierzchu, po odblokowaniu, z żywą sesją, poza kokpitem
 * i dla klubu aktywnego. Zmiana któregokolwiek warunku przestawia łącze w tym samym
 * renderze - powrót z tła otwiera je od nowa (a powitanie każe ekranom dociągnąć stan),
 * zdanie samolotu otwiera je po wyjściu z kokpitu, zmiana klubu zamyka stare połączenie
 * i otwiera nowe poświadczeniem nowego klubu.
 *
 * PUSH NA WIERZCHU ZASTĘPUJE RAMKĘ (K4): serwer budzi pushem tylko urządzenie bez
 * połączenia, więc push odebrany przy otwartej aplikacji przyszedł w chwili bez łącza.
 * Wiadomość z klubu aktywnego trafia wtedy na szynę jako ramka bez pozycji - skrzynka
 * i dzwonek odświeżają się tą samą drogą, co od kanału, a baner pokazuje sam push
 * (ramkę bez pozycji pomija). Wiadomość z innego klubu do nich nie należy.
 *
 * Hook jest cienki z zamiarem: decyzje mieszkają w czystych funkcjach z testami, a tu
 * zostaje zebranie warunków ze store'ów, jedno `start`/`stop` i jeden słuchacz.
 */

import { useEffect } from 'react';

import { linkTarget } from '../../application/live/linkRule';
import { onNotificationReceived } from '../../infrastructure/push/expoNotifications';
import { useLive } from '../bootstrap/servicesContext';
import { holdsAircraft } from '../navigation/resumeTarget';
import { isActiveClubPush } from '../screens/logic/pushTarget';
import { useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useAppForeground } from './useAppForeground';

export function useLiveLink(): void {
  const live = useLive();
  const foreground = useAppForeground();
  const signedIn = useAuthStore((s) => s.status === 'signed_in');
  const revoked = useAuthStore((s) => s.revoked);
  const orgId = useAuthStore((s) => s.org?.id ?? null);
  const holds = useSessionStore((s) => holdsAircraft(s.projection));

  const target = linkTarget({ foreground, signedIn, revoked, holdsAircraft: holds, orgId });

  useEffect(() => {
    if (live == null || target == null) return;
    live.link.start(target);
    // Zmiana celu i zejście bindera (zamek, wylogowanie) zamykają łącze tą samą drogą.
    return () => live.link.stop();
  }, [live, target]);

  useEffect(() => {
    if (live == null) return;
    return onNotificationReceived((received) => {
      // Klub aktywny W CHWILI wiadomości - pilot mógł go przełączyć, odkąd słuchacz stoi.
      const active = useAuthStore.getState().org?.id ?? null;
      if (!isActiveClubPush(received.data, active)) return;
      live.bus.publish({ type: 'notification', org: active, item: null, unread: null });
    });
  }, [live]);
}
