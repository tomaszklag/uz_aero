/**
 * Ninerdeck - panel: ZLECENIA - lista (`#/zlecenia`; makieta `zlecenia-lista`, ZL1 i ZL1a;
 * 4.0.0, epik Z-D #248).
 *
 * ══ PRZEŁĄCZNIK „DO MNIE / ZLECONE" TO SEGMENT, NIE CHIPY ══
 * Dwie połowy odpowiadają na DWA pytania - „na co mam odpowiedzieć" i „czego szukam" -
 * i dokładnie jedna jest zawsze włączona. Segment stoi wyłącznie przy „Zlecaniu lotów"
 * albo „Cudzych rezerwacjach": członek bez nich ma jedną połowę, więc przełącznik byłby
 * wyborem bez wyboru. Chipy okresu stoją po segmencie - zmieniają zakres, nie pytanie.
 *
 * ══ ŚWIEŻOŚĆ BEZ WSKAŹNIKA POŁĄCZENIA ══
 * Odczyty i odpowiedzi odświeżają się na żywo kanałem klubu (temat `orders`,
 * `live/topicKeys.ts`); zerwane łącze nie jest awarią - po powrocie lista dociąga się
 * zwykłym odczytem, więc ekran o łączu milczy.
 *
 * Czego tu jeszcze NIE MA (epik Z-D idzie etapami): szuflady zlecenia (etap 3 - wiersz
 * prowadzi dziś tylko tam, gdzie cel już istnieje: do rezerwacji w kalendarzu) i „Zleć
 * lot" (etap 6, razem z formularzem) - przycisk bez formularza obiecywałby akcję, której
 * nie ma.
 */

import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { can } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { useDirectory } from '../../queries/useDirectory';
import { useOrderList, useOrderSummary } from '../../queries/useOrders';
import {
  Banner,
  DataTable,
  EmptyState,
  FilterChip,
  LinkButton,
  Loadable,
  PageHead,
  Pill,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { ChatIcon, OrdersIcon } from '../../ui/components/icons';
import { loadErrorMessage } from '../common/apiMessage';
import { inboxRows, managedRows, type InboxRowVm, type ManagedRowVm, type OrderRowBase } from './orderListRows';
import { orderLookups } from './orderLookups';
import { BOX_OF, defaultView, ordersPath, periodOf, viewOf, type OrderView } from './orderPaths';

const MANAGED_HEADERS = ['Termin', 'Samolot', 'Zadanie', 'Fotele', 'Odpowiedzi', 'Stan', 'Zleca', ''];
const INBOX_HEADERS = ['Termin', 'Samolot', 'Zadanie', 'Twój fotel', 'Zleca', 'Stan', ''];

export function OrdersScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { session } = useSessionState();
  const capabilities = session?.capabilities;
  const seesManaged = can(capabilities, 'orders.create') || can(capabilities, 'reservations.manage');

  const requested = viewOf(params.get('widok'));
  // „Zlecone" w adresie u kogoś, dla kogo tej połowy nie ma, wraca do „Do mnie" -
  // serwer i tak odpowiedziałby 403, a ekran pokazałby błąd tam, gdzie nic złego się nie stało.
  const view: OrderView | null = requested === 'zlecone' && !seesManaged ? 'do-mnie' : requested;
  const period = periodOf(params.get('okres'));

  // Pierwsza połowa przy wejściu z kolumny (pkt 36) - liczba z serwera rozstrzyga ją
  // dopiero wtedy, gdy jest z czego wybierać.
  const summary = useOrderSummary(view == null && seesManaged);
  useEffect(() => {
    if (view === requested && view != null) return;
    if (view != null) {
      navigate(ordersPath(view, period), { replace: true });
      return;
    }
    if (!seesManaged) {
      navigate(ordersPath('do-mnie', period), { replace: true });
      return;
    }
    if (summary.data == null) return;
    navigate(ordersPath(defaultView({ awaitingAnswer: summary.data.awaitingAnswer, seesManaged }), period), {
      replace: true,
    });
  }, [view, requested, seesManaged, summary.data, period, navigate]);

  const list = useOrderList(view == null ? null : BOX_OF[view]);
  const directory = useDirectory();

  const context = {
    lookups: orderLookups(directory.data),
    viewerId: session?.pilot.id ?? null,
    now: Date.now(),
    timezone: list.data?.timezone ?? '',
  };
  const error = list.error ?? summary.error ?? directory.error;
  const headers = view === 'zlecone' ? MANAGED_HEADERS : INBOX_HEADERS;

  return (
    <>
      <PageHead title="Zlecenia" />

      <div className="filters">
        {seesManaged && view != null ? <ViewSwitch view={view} /> : null}
        <FilterChip
          label="Nadchodzące"
          on={period === 'upcoming'}
          onToggle={() => view != null && navigate(ordersPath(view, 'upcoming'), { replace: true })}
        />
        <FilterChip
          label="Minione"
          on={period === 'past'}
          onToggle={() => view != null && navigate(ordersPath(view, 'past'), { replace: true })}
        />
      </div>

      {error == null ? null : <Banner tone="danger">{loadErrorMessage(error)}</Banner>}

      <Loadable
        pending={list.isPending || directory.isPending}
        loaded={view != null && list.data != null && directory.data != null}
        skeleton={
          <TableSkeleton
            headers={headers}
            widths={view === 'zlecone' ? [96, 64, 70, 120, 96, 104, 86, 48] : [96, 64, 70, 80, 86, 104, 48]}
            rows={4}
          />
        }
      >
        {view === 'zlecone' ? (
          <ManagedTable
            rows={managedRows(list.data?.items ?? [], period, context)}
            past={period === 'past'}
            onOpen={(href) => navigate(href)}
          />
        ) : (
          <InboxTable
            rows={inboxRows(list.data?.items ?? [], period, context)}
            past={period === 'past'}
            onOpen={(href) => navigate(href)}
          />
        )}
      </Loadable>
    </>
  );
}

/** Segment połów - obie pozycje niosą bieżący okres, jak oś dziennika niesie zakres. */
function ViewSwitch({ view }: { view: OrderView }) {
  const [params] = useSearchParams();
  const period = periodOf(params.get('okres'));
  return (
    <div className="seg" role="group" aria-label="Które zlecenia">
      <SegLink to={ordersPath('do-mnie', period)} on={view === 'do-mnie'} label="Do mnie" />
      <SegLink to={ordersPath('zlecone', period)} on={view === 'zlecone'} label="Zlecone" />
    </div>
  );
}

function SegLink({ to, on, label }: { to: string; on: boolean; label: string }) {
  return (
    <Link className={on ? 'seg-btn on' : 'seg-btn'} aria-current={on ? 'page' : undefined} to={to}>
      {label}
    </Link>
  );
}

// ── kolumny wspólne obu połów ──────────────────────────────────────────────────

const termColumn: Column<OrderRowBase> = {
  key: 'term',
  header: 'Termin',
  render: (row) => (
    <>
      <span className="cell-strong">{row.termDay}</span>
      <span className="cell-sub">
        <span className="mono">{row.termHours}</span>
        {row.termRelative == null ? null : ` · ${row.termRelative}`}
      </span>
    </>
  ),
};

const aircraftColumn: Column<OrderRowBase> = {
  key: 'aircraft',
  header: 'Samolot',
  render: (row) => (
    <>
      <span className="reg">{row.reg}</span>
      {row.aircraftType == null ? null : <span className="cell-sub">{row.aircraftType}</span>}
    </>
  ),
};

const taskColumn: Column<OrderRowBase> = {
  key: 'task',
  header: 'Zadanie',
  render: (row) => (
    <>
      {row.operation}
      {row.route == null ? null : <span className="cell-sub mono">{row.route}</span>}
    </>
  ),
};

const authorColumn: Column<OrderRowBase> = {
  key: 'author',
  header: 'Zleca',
  render: (row) => (
    <>
      {row.author.name}
      {row.author.code == null ? null : <span className="cell-sub mono">{row.author.code}</span>}
    </>
  ),
};

const stateColumn: Column<OrderRowBase> = {
  key: 'state',
  header: 'Stan',
  render: (row) => (
    <>
      {row.unread ? (
        <span className="msg-ind" title="Nowa wiadomość w rozmowie" aria-label="Nowa wiadomość w rozmowie">
          <ChatIcon size={14} />
        </span>
      ) : null}
      <Pill tone={row.pill.tone}>{row.pill.text}</Pill>
      {row.pillSub == null ? null : <span className="cell-sub">{row.pillSub}</span>}
    </>
  ),
};

const actionsColumn: Column<OrderRowBase> = {
  key: 'actions',
  header: '',
  cellClass: 'row-actions',
  render: (row) =>
    row.href == null ? null : (
      <LinkButton to={row.href} variant="ghost" size="sm">
        Otwórz
      </LinkButton>
    ),
};

/**
 * Wiersz jest skrótem myszy dla linku „Otwórz" - klikalny wyłącznie wtedy, gdy KAŻDY wiersz
 * dokądś prowadzi. Do szuflady zlecenia (etap 3) prowadzą tylko wiersze z celem już
 * istniejącym, a wiersz z kursorem rączki, który nic nie robi, wygląda jak usterka.
 */
const clickable = (rows: readonly OrderRowBase[]): boolean => rows.every((row) => row.href != null);

interface TableProps<Row> {
  rows: Row[];
  past: boolean;
  onOpen: (href: string) => void;
}

/** „Zlecone" - zlecenia oczami prowadzącego. */
function ManagedTable({ rows, past, onOpen }: TableProps<ManagedRowVm>) {
  const columns: Column<ManagedRowVm>[] = [
    termColumn,
    aircraftColumn,
    taskColumn,
    {
      key: 'seats',
      header: 'Fotele',
      render: (row) => (
        <span className="order-seats">
          {row.seats.flatMap((seat) => [
            <span key={`${seat.label}-k`} className="order-seat-k">
              {seat.label}
            </span>,
            <span key={`${seat.label}-v`}>{seat.who}</span>,
          ])}
        </span>
      ),
    },
    {
      key: 'answers',
      header: 'Odpowiedzi',
      cellClass: (row) => (row.answers.dim ? 'dim' : undefined),
      render: (row) => (
        <>
          {row.answers.text}
          {row.answers.volunteers == null ? null : <span className="cell-sub ok">{row.answers.volunteers}</span>}
        </>
      ),
    },
    stateColumn,
    authorColumn,
    actionsColumn,
  ];

  if (rows.length === 0) {
    return past ? (
      <EmptyState
        icon={<OrdersIcon size={20} />}
        title="Nic tu jeszcze nie minęło"
        note="Zlecenie schodzi tutaj po swoim terminie i zostaje przez dwa tygodnie."
      />
    ) : (
      <EmptyState
        icon={<OrdersIcon size={20} />}
        title="Nie zlecasz jeszcze żadnego lotu"
        note="Wskaż termin, maszynę i zadanie, a zlecenie trafi do wybranych osób albo grup naraz - odpowiedzi zobaczysz tutaj."
      />
    );
  }

  return (
    <DataTable
      caption={past ? 'Zlecenia klubu - minione terminy' : 'Zlecenia klubu - nadchodzące terminy'}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      rowClass={(row) => (row.muted ? 'muted' : undefined)}
      onRowClick={clickable(rows) ? (row) => row.href != null && onOpen(row.href) : undefined}
    />
  );
}

/** „Do mnie" - zlecenia oczami adresata, bez słowa o innych adresatach (pkt 18). */
function InboxTable({ rows, past, onOpen }: TableProps<InboxRowVm>) {
  const columns: Column<InboxRowVm>[] = [
    termColumn,
    aircraftColumn,
    taskColumn,
    { key: 'seat', header: 'Twój fotel', render: (row) => row.mySeat },
    authorColumn,
    stateColumn,
    actionsColumn,
  ];

  if (rows.length === 0) {
    return past ? (
      <EmptyState
        icon={<OrdersIcon size={20} />}
        title="Nic tu jeszcze nie minęło"
        note="Zlecenie schodzi tutaj po swoim terminie i zostaje przez dwa tygodnie."
      />
    ) : (
      <EmptyState
        icon={<OrdersIcon size={20} />}
        title="Nic nie czeka na Twoją odpowiedź"
        note="Zlecenie lotu od klubu pojawi się tutaj i w skrzynce aplikacji."
      />
    );
  }

  return (
    <DataTable
      caption={past ? 'Zlecenia do mnie - minione terminy' : 'Zlecenia do mnie - nadchodzące terminy'}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      rowClass={(row) => (row.muted ? 'muted' : undefined)}
      onRowClick={clickable(rows) ? (row) => row.href != null && onOpen(row.href) : undefined}
    />
  );
}
