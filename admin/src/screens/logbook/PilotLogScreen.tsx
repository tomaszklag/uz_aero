/**
 * Ninerdeck - panel 3.2: DZIENNIK, poziom 2 - operacje JEDNEGO pilota
 * (`#/dziennik/pilot/AKO`, `docs/panel-3.2.md` §4.2).
 *
 * ══ TEN SAM KSZTAŁT, CO GRID MASZYNY ══
 * Nagłówek doby z sumami, para godzin biegu z sygnaturą, te same odczyty. Różnica jest
 * DOKŁADNIE JEDNA: kolumna „Pilot" zamienia się w „Samolot" (znak + typ), bo osoba
 * stoi w tytule, a maszyna jest tu zmienną. Jedna rzecz, jeden kształt (issue #42).
 *
 * ══ PRAWY FOTEL (decyzja właściciela 2026-09-26, wariant B) ══
 * Loty JAKO DRUGI PILOT to zwykłe wiersze z plakietką - poza czterema sumami nalotu
 * dowódcy, ale z WŁASNĄ, piątą sumą w nagłówku doby, wyłącznie w dobie z takim lotem.
 * Lista przychodzi z serwera z OBOMA fotelami (filtr pilota dopasowuje też Duala).
 *
 * ══ W ADRESIE STOI KOD PILOTA ══
 * Jedyny w klubie i czytelny - do wklejenia w rozmowie, jak rejestracja. Kod tłumaczy
 * się na osobę ze słownika klubu, który panel i tak ma; kod spoza klubu mówi to wprost.
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useDirectory } from '../../queries/useDirectory';
import { useLogPilots, usePilotSessions } from '../../queries/useLog';
import {
  Banner,
  Breadcrumbs,
  DataTable,
  EmptyState,
  LinkButton,
  Loadable,
  PageHead,
  Pill,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { PeopleIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { DateRange } from './DateRange';
import { dayGroups } from './dayGroups';
import type { DayRange } from './dateRanges';
import { pilotRangeSummary } from './logbookRows';
import { logbookPath, sessionPath } from './logbookPaths';
import { DayHeader, OperationCell, Pair } from './SessionCells';
import { aircraftNote, asDual, sessionRow, type SessionRow } from './sessionRows';

const HEADERS = [
  'Operacja',
  'Lot',
  'Loty',
  'Blok',
  'Samolot',
  'Zadanie',
  'Paliwo',
  'Motogodziny',
  'Olej do lotu',
  '',
];

export function PilotLogScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const range: DayRange = { from: params.get('od') ?? '', to: params.get('do') ?? '' };
  const setRange = (next: DayRange): void => {
    setParams(new URLSearchParams({ od: next.from, do: next.to }), { replace: true });
  };

  // Kod -> osoba. Słownik klubu niesie także członków wyłączonych: ich operacje
  // zostają w dzienniku, więc ich adres ma dalej otwierać kartę.
  const directory = useDirectory();
  const member = directory.data?.members.find((m) => m.code === code.toUpperCase());
  const missing = directory.data != null && member == null;
  const pilotId = member?.id ?? '';

  const sessions = usePilotSessions({
    pilotId,
    from: range.from === '' ? undefined : range.from,
    to: range.to === '' ? undefined : range.to,
  });
  // Liczby podtytułu z wiersza osi pilotów TEGO SAMEGO zakresu - panel niczego nie
  // sumuje. Odpowiedź zwykle już jest w cache po wejściu z poziomu 1.
  const axis = useLogPilots({
    from: range.from === '' ? undefined : range.from,
    to: range.to === '' ? undefined : range.to,
  });
  const totals = axis.data?.pilots.find((p) => p.pilotId === pilotId);

  const rows = (sessions.data?.items ?? []).map(sessionRow);
  const groups = dayGroups(rows, sessions.data?.days ?? []);
  const truncated = sessions.data?.nextCursor != null;
  const title = member?.name ?? code.toUpperCase();

  const columns: Column<SessionRow>[] = [
    {
      key: 'operation',
      header: 'Operacja',
      render: (row) => <OperationCell row={row} asDualRow={asDual(row, pilotId)} />,
    },
    { key: 'flight', header: 'Lot', render: (row) => <Pair value={row.flight} /> },
    { key: 'flights', header: 'Loty', align: 'num', render: (row) => row.flights },
    { key: 'block', header: 'Blok', align: 'num', render: (row) => row.block },
    {
      /* Jedyna kolumna inna niż na osi maszyny: załoga dwuosobowa jest faktem operacji
         i stoi w podpisie („z A. Kowal", „dowódca B. Nowak"), typ maszyny - gdy nie ma
         czego dopowiedzieć. */
      key: 'aircraft',
      header: 'Samolot',
      render: (row) => (
        <>
          <span className="reg">{row.reg}</span>
          <span className="cell-sub">{aircraftNote(row, pilotId)}</span>
        </>
      ),
    },
    { key: 'task', header: 'Zadanie', render: (row) => <Pill tone="dim">{row.operation}</Pill> },
    { key: 'fuel', header: 'Paliwo', render: (row) => <Pair value={row.fuel} warn={row.warn.fuel} /> },
    { key: 'moto', header: 'Motogodziny', render: (row) => <Pair value={row.moto} warn={row.warn.moto} /> },
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
        <LinkButton to={sessionPath(row.reg, row.sessionUuid, range)} size="sm" variant="ghost">
          Szczegóły
        </LinkButton>
      ),
    },
  ];

  const rowClass = (row: SessionRow): string | undefined => {
    const dual = asDual(row, pilotId);
    if (row.voided) return dual ? 'voided as-dual' : 'voided';
    return dual ? 'as-dual' : undefined;
  };

  return (
    <>
      {/* Okruszek „Dziennik" niesie OŚ PILOTÓW i zakres, z którego się przyszło. */}
      <Breadcrumbs items={[{ label: 'Dziennik', to: logbookPath('piloci', range) }, { label: title }]} />

      <PageHead
        title={title}
        sub={
          member == null ? undefined : (
            <>
              <span className="mono">{member.code}</span>
              {totals == null ? null : ` · ${pilotRangeSummary(totals)}`}
            </>
          )
        }
        actions={
          member == null ? null : (
            <LinkButton to={`/piloci/${encodeURIComponent(member.id)}`}>Karta członka</LinkButton>
          )
        }
      />

      <div className="filters">
        <DateRange range={range} now={Date.now()} onChange={setRange} />
      </div>

      {missing ? (
        <EmptyState
          icon={<PeopleIcon size={20} />}
          title={`Nie ma pilota o kodzie ${code.toUpperCase()}`}
          note="Sprawdź kod pilota albo wróć do listy."
          action={
            <LinkButton to={logbookPath('piloci', range)} variant="primary">
              Pokaż wszystkich
            </LinkButton>
          }
        />
      ) : null}

      {/* Słownik klubu, który nie dojechał, zostawiłby ekran na plamkach bez słowa -
          osoba z adresu nie ma się wtedy z czego rozwiązać. */}
      {directory.error == null ? null : <Banner tone="danger">{errorMessage(directory.error)}</Banner>}
      {sessions.error == null ? null : <Banner tone="danger">{errorMessage(sessions.error)}</Banner>}

      {missing ? null : (
        <Loadable
          pending={directory.isPending || sessions.isPending}
          skeleton={
            <TableSkeleton
              headers={HEADERS}
              widths={[150, 96, 20, 36, 82, 54, 92, 110, 52, 60]}
              rows={8}
            />
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              icon={<PeopleIcon size={20} />}
              title="Bez operacji w tym zakresie"
              note="Zmień zakres dat albo wróć do listy pilotów."
            />
          ) : (
            <>
              <DataTable
                caption={`Operacje pilota ${title}, dobami`}
                columns={columns}
                groups={groups.map((group) => ({
                  key: group.key,
                  header: <DayHeader group={group} />,
                  rows: group.rows,
                }))}
                rowKey={(row) => row.sessionUuid}
                rowClass={rowClass}
                onRowClick={(row) => navigate(sessionPath(row.reg, row.sessionUuid, range))}
              />
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
