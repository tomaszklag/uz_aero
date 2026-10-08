/**
 * Ninerdeck - panel: SZUFLADA ROZMOWY W ZLECENIU (`#/zlecenia/:id/rozmowa/:adresat`;
 * makieta `zlecenia-watek`, ZL4, ZL4a, ZL4b; 4.0.0, epik Z-D #248).
 *
 * Treść i stany liczy `orderThread.ts`; tu zostaje układ, pole wiadomości i dwie
 * czynności w tle - przewinięcie do najnowszej wiadomości i zapis odczytu.
 *
 * ══ NA ŻYWO, BEZ WSKAŹNIKA POŁĄCZENIA ══
 * Wiadomości i odczyty drugiej strony przychodzą ramkami kanału klubu prosto do pamięci
 * rozmowy (`useLiveChannel`), więc stają bez odświeżania. Zerwane łącze nie jest awarią -
 * po powrocie rozmowa czyta się od nowa zwykłym odczytem - więc szuflada o łączu milczy.
 * Baner nowego powiadomienia nad otwartą rozmową nie staje (`toast.ts`): ten ekran
 * odświeża się sam.
 *
 * ══ WIADOMOŚĆ, KTÓRA NIE WYSZŁA (ZL4b) ══
 * Tekst ZOSTAJE w polu, a zdanie pod nim mówi dlaczego. Kolejki na później nie ma (moduł
 * jest sieciowy, §2.2), więc „Wyślij" po prostu próbuje jeszcze raz - z TYM SAMYM
 * identyfikatorem, żeby wysyłka, która jednak doszła, nie zapisała się drugi raz.
 *
 * Enter wysyła, Shift+Enter łamie linię - to wiadomość w komunikatorze, nie formularz.
 * Pusty „Wyślij" blokuje bez zdania: puste pole widać obok (issue #55).
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import type { DirectoryDto } from '../../api/dto';
import { useMarkThreadRead, useOrder, useOrderThread, useSendThreadMessage } from '../../queries/useOrders';
import { threadPage } from '../../queries/threadCache';
import { Button, Drawer } from '../../ui/components';
import { EyeIcon, InfoIcon } from '../../ui/components/icons';
import { loadErrorMessage } from '../common/apiMessage';
import { orderLookups } from './orderLookups';
import type { OrderPeriod } from './orderPaths';
import { threadErrorMessage } from './orderRefusal';
import { MESSAGE_MAX, threadVm, type ThreadFooterVm, type ThreadItemVm } from './orderThread';

interface Props {
  orderId: string;
  recipientId: string;
  viewerId: string | null;
  period: OrderPeriod;
  directory: DirectoryDto | undefined;
  onClose: () => void;
}

/** Ile od dołu liczy się jeszcze jako „na dole" - nowa wiadomość dociąga wtedy widok. */
const STICK_PX = 80;

export function ThreadDrawer({ orderId, recipientId, viewerId, period, directory, onClose }: Props) {
  const card = useOrder(orderId);
  const thread = useOrderThread(orderId, recipientId);
  const markRead = useMarkThreadRead(orderId, recipientId);
  const lookups = orderLookups(directory);
  const page = threadPage(thread.data);

  const vm =
    card.data == null || page == null
      ? null
      : threadVm({
          page,
          card: card.data,
          recipientId,
          viewerId,
          now: Date.now(),
          period,
          person: lookups.person,
          aircraft: lookups.aircraft,
        });

  // Przewinięcie: na dół przy otwarciu i przy nowej wiadomości - o ile człowiek nie czyta
  // właśnie starszych (wtedy widok zostaje tam, gdzie go zostawił).
  const body = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const newest = page?.messages[0]?.id ?? null;
  useEffect(() => {
    const el = body.current;
    if (el == null) return;
    const onScroll = (): void => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [vm != null]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = body.current;
    if (el != null && stick.current) el.scrollTop = el.scrollHeight;
  }, [newest, vm != null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Odczyt: uczestnik, który patrzy na rozmowę, czyta ją - przy otwarciu i przy każdej
  // nowej wiadomości drugiej strony. Czytelnik (koordynator) odczytu nie zapisuje.
  const readMark = vm?.readMark ?? null;
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (readMark == null || marked.current === readMark) return;
    marked.current = readMark;
    markRead.mutate();
  }, [readMark]); // eslint-disable-line react-hooks/exhaustive-deps

  if (vm == null) {
    const error = card.error ?? thread.error;
    // Plamki w geometrii rozmowy (pasek i trzy dymki), a nie pusty panel - i nie spinner.
    return (
      <Drawer title="Rozmowa" onClose={onClose}>
        {error != null ? (
          <p className="card-note danger">{loadErrorMessage(error)}</p>
        ) : card.data != null && page != null ? null : (
          <>
            <span className="skeleton" style={{ width: '100%', height: 44 }} />
            <span className="skeleton" style={{ width: '62%', height: 52 }} />
            <span className="skeleton" style={{ width: '54%', height: 52, alignSelf: 'flex-end' }} />
            <span className="skeleton" style={{ width: '58%', height: 52 }} />
          </>
        )}
      </Drawer>
    );
  }

  return (
    <Drawer
      title={vm.title}
      sub={
        <>
          {vm.sub.label}
          {vm.sub.code == null ? null : (
            <>
              {' · '}
              <span className="mono">{vm.sub.code}</span>
            </>
          )}
        </>
      }
      label={vm.label}
      bodyRef={body}
      pinned={
        <Link className="order-strip" to={vm.strip.href}>
          <span className="order-strip-main">
            <span className="order-strip-top">{vm.strip.top}</span>
            {vm.strip.sub == null ? null : <span className="order-strip-sub">{vm.strip.sub}</span>}
          </span>
          <span className="order-strip-go" aria-hidden="true">
            ›
          </span>
        </Link>
      }
      dock={
        <Footer
          footer={vm.footer}
          onSent={() => {
            stick.current = true;
          }}
          orderId={orderId}
          recipientId={recipientId}
        />
      }
      onClose={onClose}
    >
      {thread.hasNextPage ? (
        <Button variant="ghost" size="sm" disabled={thread.isFetchingNextPage} onClick={() => void thread.fetchNextPage()}>
          Pokaż wcześniejsze
        </Button>
      ) : null}
      <div className="msgs" aria-live="polite">
        {vm.items.map((item) => (
          <ThreadItem key={item.key} item={item} />
        ))}
      </div>
    </Drawer>
  );
}

function ThreadItem({ item }: { item: ThreadItemVm }) {
  if (item.kind === 'day') return <div className="day-sep">{item.label}</div>;
  return (
    <div className={`msg ${item.side}`}>
      {item.who == null ? null : <span className="msg-who">{item.who}</span>}
      <div className="bubble">{item.body}</div>
      <span className="msg-time">{item.time}</span>
      {item.read == null ? null : <span className="msg-read">{item.read}</span>}
    </div>
  );
}

/** Stopka rozmowy: pole wiadomości albo jedno zdanie, dlaczego tu się nie pisze. */
function Footer({
  footer,
  onSent,
  orderId,
  recipientId,
}: {
  footer: ThreadFooterVm;
  onSent: () => void;
  orderId: string;
  recipientId: string;
}) {
  if (footer.kind === 'readonly') {
    const Icon = footer.tone === 'reader' ? EyeIcon : InfoIcon;
    return (
      <div className="composer">
        <div className="composer-note">
          <Icon size={13} />
          {footer.text}
        </div>
      </div>
    );
  }
  return <Composer note={footer.note} to={footer.to} onSent={onSent} orderId={orderId} recipientId={recipientId} />;
}

function Composer({
  note,
  to,
  onSent,
  orderId,
  recipientId,
}: {
  note: string;
  to: string;
  onSent: () => void;
  orderId: string;
  recipientId: string;
}) {
  const send = useSendThreadMessage(orderId, recipientId);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Wiadomość w drodze - ponowienie tej samej treści idzie z tym samym identyfikatorem. */
  const pending = useRef<{ id: string; body: string } | null>(null);

  // Pole dostaje fokus raz, przy otwarciu rozmowy, w której się pisze.
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);

  const body = draft.trim();
  const submit = (): void => {
    if (body === '' || send.isPending) return;
    const id = pending.current?.body === body ? pending.current.id : crypto.randomUUID();
    pending.current = { id, body };
    setError(null);
    send.mutate(
      { id, body },
      {
        onSuccess: () => {
          pending.current = null;
          setDraft('');
          onSent();
        },
        onError: (e) => setError(threadErrorMessage(e)),
      },
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="composer">
      <div className="composer-note">
        <EyeIcon size={13} />
        {note}
      </div>
      <div className="composer-row">
        <textarea
          ref={field}
          className="input area"
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder="Napisz wiadomość…"
          aria-label={`Wiadomość do: ${to}`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
        />
        <Button variant="primary" disabled={body === '' || send.isPending} onClick={submit}>
          Wyślij
        </Button>
      </div>
      {error == null ? null : <span className="hint danger">{error}</span>}
    </div>
  );
}
