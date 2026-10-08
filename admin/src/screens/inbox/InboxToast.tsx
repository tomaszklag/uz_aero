/**
 * Ninerdeck - panel: BANER NOWEGO POWIADOMIENIA (`.toast`, 4.0.0, K7 `docs/kanal-klubu.md`
 * §3.4; makieta `design/panel/powiadomienia.html` PW1).
 *
 * Lewy dolny róg treści, to samo zdanie, co wiersz skrzynki, znika sam. Decyzje - zdanie,
 * kiedy baner stoi, odliczanie z pauzą pod kursorem i fokusem - liczy `toast.ts`; tutaj
 * są tylko hooki i znaczniki.
 *
 * REGION `role="status"` STOI ZAWSZE, nawet pusty: czytnik ekranu ogłasza zmianę treści
 * regionu, który już jest na stronie, a baner wstawiony razem z regionem przemknąłby bez
 * słowa. To jedyna świadoma różnica wobec makiety, która stawia `role` na samym linku -
 * tam odbierałaby mu rolę linku.
 */

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import type { InboxItemDto } from '../../api/dto';
import { can } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { useDirectory } from '../../queries/useDirectory';
import { InboxRowBody } from './InboxRow';
import { inboxLookups } from './inboxLookups';
import type { InboxRowVm } from './inboxRows';
import { dueIn, hold, startCountdown, toastRow, toastShows } from './toast';

/** Ostatnia wiadomość z kanału; `seq` rośnie z każdą, więc nowa zaczyna odliczanie od nowa. */
export interface ToastNotice {
  seq: number;
  item: InboxItemDto;
}

interface InboxToastProps {
  notice: ToastNotice | null;
  inboxOpen: boolean;
  /** Strefa klubu z pierwszej strony skrzynki - terminy liczą się jego dobą. */
  timezone: string;
  onDismiss: () => void;
}

export function InboxToast({ notice, inboxOpen, timezone, onDismiss }: InboxToastProps) {
  const { session } = useSessionState();
  const { pathname } = useLocation();
  // Słownik dopiero przy pierwszym banerze, a baner czeka na niego: zdanie bez nazwiska
  // przeskakiwałoby po chwili na pełne. Słownik, który nie przyszedł, daje zdanie ogólne.
  const directory = useDirectory(notice != null);
  const capabilities = session?.capabilities ?? [];

  const waiting = notice != null && directory.isPending;
  const row =
    notice == null || waiting
      ? null
      : toastRow(notice.item, {
          timezone,
          now: Date.now(),
          ...inboxLookups(directory.data),
          canOpen: { fleet: can(capabilities, 'panel.access'), decisions: can(capabilities, 'reservations.approve') },
        });
  const shows = row != null && toastShows(row.href, { inboxOpen, path: pathname });

  // Baner, który nie ma prawa stać (skrzynka otwarta, ekran tej rzeczy, wiadomość już
  // przeczytana), znika na dobre - nie wraca po zamknięciu skrzynki ani po zmianie ekranu.
  useEffect(() => {
    if (notice != null && !waiting && !shows) onDismiss();
  }, [notice, waiting, shows, onDismiss]);

  return (
    <div role="status" aria-live="polite">
      {shows && row != null && notice != null ? <ToastCard key={notice.seq} row={row} onDone={onDismiss} /> : null}
    </div>
  );
}

/** Karta z odliczaniem. Nowa wiadomość to nowa karta (`key`), więc i nowe odliczanie. */
function ToastCard({ row, onDone }: { row: InboxRowVm; onDone: () => void }) {
  const [countdown, setCountdown] = useState(() => startCountdown(Date.now()));

  useEffect(() => {
    const due = dueIn(countdown, Date.now());
    if (due == null) return undefined;
    const timer = setTimeout(onDone, due);
    return () => clearTimeout(timer);
  }, [countdown, onDone]);

  const holding = (what: 'hover' | 'focus', on: boolean) => () =>
    setCountdown((current) => hold(current, what, on, Date.now()));
  const handlers = {
    onMouseEnter: holding('hover', true),
    onMouseLeave: holding('hover', false),
    onFocus: holding('focus', true),
    onBlur: holding('focus', false),
  };

  if (row.href == null) {
    return (
      <div className="toast" {...handlers}>
        <InboxRowBody row={row} />
      </div>
    );
  }
  return (
    <Link className="toast" to={row.href} onClick={onDone} {...handlers}>
      <InboxRowBody row={row} />
    </Link>
  );
}
