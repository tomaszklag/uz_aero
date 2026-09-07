/**
 * UZ Aero - panel 2.0: DZIENNIK, poziom 2 - sesje JEDNEJ maszyny (`#/dziennik/SP-KLM`).
 *
 * ══ W ADRESIE STOI REJESTRACJA, NIE IDENTYFIKATOR ══
 * `#/dziennik/SP-KLM` człowiek przeczyta i wpisze z pamięci, a o to w wymogu
 * „do wklejenia" chodziło. Tłumaczenie na `aircraftId` robi panel z listy floty,
 * którą i tak ma; przy rejestracji spoza floty mówi to wprost, zamiast pokazywać
 * pustą tabelę, która wygląda jak „ta maszyna nic nie robiła".
 *
 * ══ KOLUMNY „SAMOLOT" TU NIE MA ══
 * Jesteśmy wewnątrz jednej maszyny, więc rejestracja w każdym wierszu miałaby stałą
 * wartość - czyli byłaby kolumną, która nie odróżnia żadnego wiersza od żadnego.
 * Stoi w tytule strony. Skutek uboczny jest korzystny: format licznika jest
 * własnością maszyny, więc kolumna motogodzin nie ma jak wymieszać `1284.6` z `645:06`.
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useFleet } from '../../queries/useFleet';
import { useAircraftSessions } from '../../queries/useLog';
import {
  Banner,
  DataTable,
  EmptyState,
  LinkButton,
  Loadable,
  PageHead,
  Pill,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { PlaneIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { DateRange } from './DateRange';
import type { DayRange } from './dateRanges';
import { sessionRow, type CellPair, type SessionRow } from './sessionRows';

const HEADERS = [
  'Operacja',
  'Bieg silnika',
  'Lot',
  'Loty',
  'Pilot',
  'Zadanie',
  'Paliwo',
  'Motogodziny',
  'Olej do lotu',
  '',
];

/** Para wartości w jednej komórce - strzałka wygaszona, druga linia ją kwalifikuje. */
function Pair({ value }: { value: CellPair }) {
  return (
    <>
      <span className="cell-pair">
        {value.from}
        <span className="cell-arrow" aria-hidden="true">
          →
        </span>
        {value.to}
      </span>
      {value.note == null ? null : <span className="cell-sub">{value.note}</span>}
    </>
  );
}

export function AircraftLogScreen() {
  const { reg = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const range: DayRange = { from: params.get('od') ?? '', to: params.get('do') ?? '' };
  const setRange = (next: DayRange): void => {
    setParams(new URLSearchParams({ od: next.from, do: next.to }), { replace: true });
  };

  // Rejestracja -> identyfikator. Lista floty i tak jest w cache'u panelu.
  const fleet = useFleet({});
  const aircraft = fleet.data?.items.find((item) => item.reg === reg.toUpperCase());
  const missing = fleet.data != null && aircraft == null;

  const sessions = useAircraftSessions({
    aircraftId: aircraft?.id ?? '',
    from: range.from === '' ? undefined : range.from,
    to: range.to === '' ? undefined : range.to,
  });

  const rows = (sessions.data?.items ?? []).map(sessionRow);
  const truncated = sessions.data?.nextCursor != null;

  const columns: Column<SessionRow>[] = [
    {
      /* Kolumna IDENTYFIKUJE, więc nazywa się jak to, co identyfikuje (issue #68).
         Data zostaje linią mocną - po niej skanuje się listę jednej maszyny -
         a sygnatura schodzi do drugiej linii: to nazwa do przeczytania albo
         przepisania, nie klucz sortowania. Bez niej wiersz wygląda jak przed
         issue #68 i to jest stan poprawny, nie brak danych. */
      key: 'day',
      header: 'Operacja',
      render: (row) => (
        <>
          <span className="cell-strong">{row.day}</span>
          {row.manual ? <Pill tone="dim">ręcznie</Pill> : null}
          {row.signature == null ? null : <span className="cell-sub">{row.signature}</span>}
        </>
      ),
    },
    { key: 'engine', header: 'Bieg silnika', render: (row) => <Pair value={row.engine} /> },
    { key: 'flight', header: 'Lot', render: (row) => <Pair value={row.flight} /> },
    { key: 'flights', header: 'Loty', align: 'num', render: (row) => row.flights },
    {
      key: 'pic',
      header: 'Pilot',
      render: (row) => (
        <>
          <span className="cell-strong">{row.pic}</span>
          {row.dual == null ? null : <span className="cell-sub">{row.dual}</span>}
        </>
      ),
    },
    { key: 'operation', header: 'Zadanie', render: (row) => <Pill tone="dim">{row.operation}</Pill> },
    { key: 'fuel', header: 'Paliwo', render: (row) => <Pair value={row.fuel} /> },
    { key: 'moto', header: 'Motogodziny', render: (row) => <Pair value={row.moto} /> },
    {
      key: 'oil',
      header: 'Olej do lotu',
      render: (row) => (
        <>
          <span className="cell-pair">{row.oil}</span>
          {row.oilNote == null ? null : <span className="cell-sub">{row.oilNote}</span>}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      render: (row) => (
        <LinkButton
          to={`/dziennik/${reg}/${row.sessionUuid}?od=${range.from}&do=${range.to}`}
          size="sm"
          variant="ghost"
        >
          Szczegóły
        </LinkButton>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title={reg.toUpperCase()}
        sub={aircraft?.type}
        actions={
          <LinkButton to={`/dziennik?od=${range.from}&do=${range.to}`} variant="ghost">
            ← Dziennik
          </LinkButton>
        }
      />

      <div className="filters">
        <DateRange range={range} now={Date.now()} onChange={setRange} />
      </div>

      {missing ? (
        <EmptyState
          icon={<PlaneIcon size={20} />}
          title={`Nie ma samolotu ${reg.toUpperCase()}`}
          note="Sprawdź znaki na kadłubie albo wróć do listy floty."
          action={
            <LinkButton to="/dziennik" variant="primary">
              Pokaż wszystkie
            </LinkButton>
          }
        />
      ) : null}

      {sessions.error == null ? null : <Banner tone="danger">{errorMessage(sessions.error)}</Banner>}

      {missing ? null : (
        <Loadable
          pending={sessions.isPending}
          skeleton={
            <TableSkeleton
              headers={HEADERS}
              widths={[150, 96, 96, 20, 82, 54, 92, 110, 52, 60]}
              rows={8}
            />
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={<PlaneIcon size={20} />}
              title={`${reg.toUpperCase()} nie latał w tym zakresie`}
              note="Zmień zakres dat albo wróć do listy floty."
            />
          ) : (
            <>
              <DataTable
                caption={`Operacje samolotu ${reg.toUpperCase()}`}
                columns={columns}
                rows={rows}
                rowKey={(row) => row.sessionUuid}
                rowClass={(row) => (row.voided ? 'voided' : undefined)}
                onRowClick={(row) =>
                  navigate(`/dziennik/${reg}/${row.sessionUuid}?od=${range.from}&do=${range.to}`)
                }
              />
              {/* Lista przycięta po cichu wygląda jak komplet - a to najgorszy tryb
                  awarii narzędzia, które ma odpowiadać „co ta maszyna robiła". */}
              {truncated ? (
                <p className="list-foot">
                  Pokazano {rows.length} z {sessions.data?.total ?? rows.length} operacji - zawęź
                  zakres dat, żeby zobaczyć resztę.
                </p>
              ) : null}
            </>
          )}
        </Loadable>
      )}
    </>
  );
}
