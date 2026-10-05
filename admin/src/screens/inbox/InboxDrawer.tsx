/**
 * Ninerdeck - panel: SKRZYNKA POWIADOMIEŃ w szufladzie (4.0.0, K7 `docs/kanal-klubu.md`;
 * makieta `design/panel/powiadomienia.html` PW2, PW3).
 *
 * Szuflada BEZ WŁASNEGO ADRESU, inaczej niż szuflady modułów: skrzynka jest osobista,
 * więc wklejony link nie miałby czego otworzyć u drugiej osoby. Otwiera ją dzwonek
 * z każdego ekranu; zamyka „×", Esc i kliknięcie w tło.
 *
 * ══ „NOWE" GAŚNIE Z OTWARCIEM LISTY, KRAWĘDŹ ZOSTAJE DO KOŃCA WIZYTY ══
 * Otwarcie przeczytuje wszystkie pobrane nowe wiadomości - w panelu i w telefonie naraz
 * (wspólne „przeczytane") - a ich zielona krawędź zostaje, dopóki szuflada jest otwarta,
 * żeby było widać, co doszło. Wiadomość, która przyjdzie kanałem przy otwartej liście,
 * wjeżdża na górę i przeczytuje się tak samo. „Do decyzji" nie gaśnie od patrzenia -
 * liczy się z kolejki decyzji.
 */

import { useEffect, useRef, useState } from 'react';

import { can } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { inboxItems } from '../../queries/inboxCache';
import { useApprovalQueue } from '../../queries/useApprovals';
import { useDirectory } from '../../queries/useDirectory';
import { useInbox, useMarkRead } from '../../queries/useNotifications';
import { Banner, Button, Drawer, EmptyState, Loadable } from '../../ui/components';
import { BellIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { InboxRow } from './InboxRow';
import { inboxLookups } from './inboxLookups';
import { inboxPending, inboxRows, notSentYet, unreadIdsOf } from './inboxRows';

interface InboxDrawerProps {
  onClose: () => void;
}

export function InboxDrawer({ onClose }: InboxDrawerProps) {
  const { session } = useSessionState();
  const capabilities = session?.capabilities ?? [];
  const canDecide = can(capabilities, 'reservations.approve');

  const inbox = useInbox(true);
  const directory = useDirectory();
  const queue = useApprovalQueue(canDecide);
  const markRead = useMarkRead();
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  // Wysłane „przeczytaj" tej wizyty - ref, nie stan: drugi przebieg efektu w StrictMode
  // widzi jeszcze stary stan, a wysyłka jest skutkiem ubocznym, nie renderem.
  const sent = useRef<Set<string>>(new Set());

  const items = inboxItems(inbox.data);
  const unreadKey = unreadIdsOf(items).join(',');
  const { mutate } = markRead;
  useEffect(() => {
    const ids = notSentYet(unreadKey === '' ? [] : unreadKey.split(','), sent.current);
    if (ids.length === 0) return;
    for (const id of ids) sent.current.add(id);
    setFresh((previous) => new Set([...previous, ...ids]));
    mutate(ids);
  }, [unreadKey, mutate]);

  const rows = inboxRows({
    items,
    timezone: inbox.data?.pages[0]?.timezone ?? '',
    now: Date.now(),
    ...inboxLookups(directory.data),
    todoIds: new Set((queue.data?.items ?? []).map((entry) => entry.booking.id)),
    freshIds: fresh,
    canOpen: { fleet: can(capabilities, 'panel.access'), decisions: canDecide },
  });

  const pending = inboxPending({
    inbox: inbox.isPending,
    directory: directory.isPending,
    queue: queue.isPending,
    canDecide,
  });

  return (
    <Drawer title="Powiadomienia" onClose={onClose}>
      <Loadable pending={pending} skeleton={<InboxSkeleton />}>
        {/* `Loadable` rysuje treść, dopóki plamki nie wyjdą zza progu - a wiersz bez
            słownika i kolejki mówiłby najpierw ogólnie, potem przeskakiwał na pełne
            zdanie. Póki czekamy, treści nie ma wcale. */}
        {pending ? null : (
          <>
            {inbox.isError && items.length === 0 ? (
              <Banner tone="warn">{errorMessage(inbox.error)}</Banner>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<BellIcon size={20} />}
                title="Nic nie przyszło"
                note="Tu trafiają zlecenia lotów, decyzje o Twoich rezerwacjach i wiadomości o obserwowanych samolotach, a jeśli rozstrzygasz cudze rezerwacje - prośby o zgodę."
              />
            ) : (
              <div className="inbox">
                {rows.map((row) => (
                  <InboxRow key={row.id} row={row} onOpen={onClose} />
                ))}
              </div>
            )}
            {inbox.hasNextPage ? (
              <Button variant="ghost" size="sm" disabled={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()}>
                Pokaż starsze
              </Button>
            ) : null}
          </>
        )}
      </Loadable>
    </Drawer>
  );
}

/** Plamki ładowania - trzy wiersze skrzynki w ich własnej geometrii. */
function InboxSkeleton() {
  return (
    <div className="inbox">
      {[0, 1, 2].map((index) => (
        <div key={index} className="inbox-row">
          <span className="skeleton" style={{ width: 28, height: 28, borderRadius: 8 }} />
          <span className="inbox-body">
            <span className="skeleton" style={{ width: 220, height: 12 }} />
            <span className="skeleton" style={{ width: 160, height: 10 }} />
          </span>
          <span className="skeleton" style={{ width: 52, height: 10 }} />
        </div>
      ))}
    </div>
  );
}
