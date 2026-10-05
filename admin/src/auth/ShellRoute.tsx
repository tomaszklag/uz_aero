/**
 * Ninerdeck - panel 2.0: brama sesji dla wszystkiego, co jest ZA logowaniem.
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

import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { useLiveChannel } from '../live/useLiveChannel';
import { unreadCount } from '../queries/inboxCache';
import { useAttention } from '../queries/useAttention';
import { useInbox } from '../queries/useNotifications';
import { useLogout } from '../queries/useSession';
import { InboxDrawer } from '../screens/inbox/InboxDrawer';
import { InboxToast, type ToastNotice } from '../screens/inbox/InboxToast';
import { Loadable } from '../ui/components';
import { AppShell } from '../ui/shell/AppShell';
import { kindOf } from '../ui/shell/nav';
import { shellScope } from '../ui/shell/scope';
import { can } from './can';
import { useSessionState } from './sessionContext';

export function ShellRoute() {
  const { session, loading } = useSessionState();
  const logout = useLogout();
  // Liczba „Do sprawdzenia" w kolumnie (3.2.0, P-D) - pyta się WYŁĄCZNIE sesja klubu
  // z „Podglądem klubu": dla innych odpowiedź byłaby 403, czyli baner w ramie, w której
  // nic złego się nie stało. Hook stoi tu, bo rama (`ui/`) nie zna zapytań.
  const counted = session != null && kindOf(session) === 'org' && can(session.capabilities, 'panel.access');
  const attention = useAttention(counted);
  // Baner nowego powiadomienia (K7): ostatnia wiadomość z kanału. Kilka naraz - widać
  // ostatnią, licznik przy dzwonku mówi resztę.
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const showNotice = useCallback(
    (item: ToastNotice['item']) => setNotice((previous) => ({ seq: (previous?.seq ?? 0) + 1, item })),
    [],
  );
  // Kanał klubu (4.0.0, K3): jedno połączenie na kartę, wyłącznie w sesji klubu. Klub
  // i osoba są tożsamością połączenia - przełączenie klubu otwiera nowe.
  const scopeKey = session?.org == null ? null : `${session.org.id}:${session.pilot.id}`;
  useLiveChannel(scopeKey, showNotice);
  // Przełączenie klubu kończy baner poprzedniego - jego wiadomość należy do tamtego klubu,
  // a słownik nowego nie zna jej nazwisk.
  useEffect(() => {
    setNotice(null);
  }, [scopeKey]);
  // Skrzynka (K7): dzwonek w każdej ramie KLUBU - liczba z pierwszej strony, którą kanał
  // trzyma świeżą; szuflada bez własnego adresu, więc jej stan mieszka tutaj.
  const club = session?.org != null;
  const inbox = useInbox(club);
  const [inboxOpen, setInboxOpen] = useState(false);

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
      scope={shellScope(session)}
      capabilities={session.capabilities}
      attentionCount={counted ? (attention.data?.counts.attention ?? null) : null}
      bell={
        club ? { count: unreadCount(inbox.data), open: inboxOpen, onToggle: () => setInboxOpen((open) => !open) } : null
      }
      onLogout={() => logout.mutate()}
      logoutPending={logout.isPending}
    >
      <Outlet />
      {club && inboxOpen ? <InboxDrawer onClose={() => setInboxOpen(false)} /> : null}
      {club ? (
        <InboxToast
          notice={notice}
          inboxOpen={inboxOpen}
          timezone={inbox.data?.pages[0]?.timezone ?? ''}
          onDismiss={dismissNotice}
        />
      ) : null}
    </AppShell>
  );
}
