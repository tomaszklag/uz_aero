/**
 * UZ Aero — panel: SKRZYNKA FLAG (`design/admin/A03-flagi.html` + `A03b-flagi-zero.html`).
 *
 * Jeden widok, dwa stany: `A03b` nie jest osobnym ekranem, tylko tą samą skrzynką bez
 * otwartych spraw. Szuflada szczegółu (`A03a`) otwiera się NAD listą pod adresem
 * `#/flagi/<id>` — lista zostaje pod spodem, bo po zamknięciu sprawy wraca się do niej,
 * a nie do początku.
 *
 * Ekran jest `.tsx` BEZ arytmetyki i bez decyzji o treści: każdy napis, plakietka
 * i próg pochodzą z czystych modułów obok (`flagRows`, `flagDetails`, `flagFilters`,
 * `flagInbox`, `flagResolve`), które mają testy w Node. Tutaj zostaje układ i spięcie
 * danych z komponentami.
 *
 * Porządku listy NIE RUSZAMY. Serwer sortuje skrzynkę „blokujące eksport → najstarsze"
 * (`pg/admin/flagsRepo.ts`) i to jest część kontraktu: otwarta `aircraft_overlap`
 * wstrzymuje kartę doby, więc jest innym rodzajem sprawy niż `mh_gap` sprzed godziny.
 * `pilot_overlap` mimo bliźniaczej nazwy stoi po drugiej stronie tej granicy — opisuje
 * grafik człowieka i arkusza nie dotyka (rozdzielenie z 2026-08-07, §4.7).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useSessionState } from '../../auth/sessionContext';
import { useFlagCount, useFlags } from '../../queries/useFlags';
import {
  Banner,
  Button,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  LinkButton,
  PageHead,
  Pill,
  SearchInput,
  Tile,
  TileGrid,
  type Column,
} from '../../ui/components';
import { CheckIcon } from '../../ui/components/icons';
import { FlagDrawer } from './FlagDrawer';
import {
  DEFAULT_FLAG_FILTER,
  FLAG_PAGE_LIMIT,
  filterFromParams,
  flagListQuery,
  paramsFromFilter,
  type FlagFilter,
  type StatusFilter,
} from './flagFilters';
import { blockingFlags, inboxEmpty } from './flagInbox';
import { flagRows, type FlagRow } from './flagRows';
import { FLAG_TYPE_META, FLAG_TYPE_ORDER } from './flagTypes';

export function FlagsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useSessionState();

  const filter = filterFromParams(searchParams);
  const flags = useFlags(flagListQuery(filter));
  const openCount = useFlagCount('open');
  const resolvedCount = useFlagCount('resolved');

  // Wpis w wyszukiwarce żyje lokalnie do naciśnięcia Entera: filtrem jest URL,
  // ale przeładowywanie listy po każdej literze UUID-a byłoby serią żądań, z których
  // żadne nie ma sensu — UUID jest dopasowaniem DOKŁADNYM, nie prefiksem.
  const [sessionDraft, setSessionDraft] = useState(filter.sessionUuid ?? '');
  useEffect(() => {
    setSessionDraft(filter.sessionUuid ?? '');
  }, [filter.sessionUuid]);

  const apply = (next: FlagFilter): void => setSearchParams(paramsFromFilter(next));

  const items = flags.data?.items ?? [];
  const rows = flagRows(items, Date.now());
  const blocking = blockingFlags(items);

  const openedId = id == null ? null : Number.parseInt(id, 10);
  const opened = openedId == null ? null : (items.find((flag) => flag.id === openedId) ?? null);

  /** Zamknięcie szuflady zdejmuje z adresu numer sprawy, ale ZOSTAWIA filtry listy. */
  const closeDrawer = (): void => {
    void navigate({ pathname: '/flagi', search: searchParams.toString() });
  };

  return (
    <>
      <PageHead
        title="SKRZYNKA FLAG"
        sub={
          <>
            Rozbieżności wykryte przez serwer przy scalaniu zdarzeń (§4.5). Flaga nigdy nie
            zablokowała pilota w terenie — jest do wyjaśnienia po fakcie. Sortowanie: najpierw
            sprawy blokujące kartę dnia, potem po wieku, bo flaga leżąca trzeci dzień jest
            problemem sama w sobie.
          </>
        }
        actions={
          <LinkButton to="/zdarzenia" variant="ghost">
            Rejestr zdarzeń
          </LinkButton>
        }
      />

      {blocking.length === 0 ? null : (
        <Banner tone="danger">
          <b>Na tej liście stoją sprawy, które wycinają sesje z kart doby.</b>{' '}
          <code>dayExporter</code> pomija sesję, dla której otwarta jest flaga{' '}
          <code>aircraft_overlap</code> — jedyny typ bramkujący arkusz. Doba maszyny
          wychodzi wtedy z adnotacją „niekompletna", a nie zostaje w całości poza
          dokumentem (§4.7). Dotyczy to spraw{' '}
          {blocking.map((flag, index) => (
            <span key={flag.id}>
              {index > 0 ? ', ' : ''}
              <b>
                #{flag.id} · {flag.reg}
              </b>
            </span>
          ))}
          . Karty powstaną dopiero po ich zamknięciu.
        </Banner>
      )}

      <TileGrid>
        <Tile
          label="Otwarte flagi"
          value={openCount.data ?? '—'}
          tone={openCount.data == null ? undefined : openCount.data === 0 ? 'green' : 'amber'}
          note={
            openCount.data === 0
              ? 'Żadna sesja nie czeka na odblokowanie karty doby.'
              : 'Liczba z serwera — niezależna od filtra, którym patrzysz na listę.'
          }
        />
        <Tile
          label="W tym filtrze"
          value={flags.data?.total ?? '—'}
          note={
            flags.data != null && flags.data.total > flags.data.items.length ? (
              <>
                Pokazano {flags.data.items.length} z {flags.data.total} — lista jest przycięta na{' '}
                {FLAG_PAGE_LIMIT} pozycjach. Zawęź filtr, żeby zobaczyć resztę.
              </>
            ) : (
              'Tyle spraw spełnia bieżące zawężenie skrzynki.'
            )
          }
        />
      </TileGrid>

      <FilterBar>
        <SearchInput
          value={sessionDraft}
          ariaLabel="Filtruj po UUID sesji"
          placeholder={'UUID sesji — Enter filtruje, „/" ustawia fokus'}
          onChange={setSessionDraft}
          onSubmit={() =>
            apply({ ...filter, sessionUuid: sessionDraft.trim() === '' ? null : sessionDraft.trim() })
          }
        />
        {STATUS_CHIPS.map((chip) => (
          <FilterChip
            key={chip.value}
            label={chip.label}
            count={chip.value === 'open' ? openCount.data : chip.value === 'resolved' ? resolvedCount.data : undefined}
            active={filter.status === chip.value}
            tone={chip.value === 'open' && (openCount.data ?? 0) > 0 ? 'amber' : undefined}
            onClick={() => apply({ ...filter, status: chip.value })}
          />
        ))}
        {filter.from == null && filter.to == null ? null : (
          <FilterChip
            label={`${filter.from ?? '…'} → ${filter.to ?? '…'} · zdejmij`}
            active
            title="Zakres dat pochodzi z adresu — panel nie ma jeszcze kalendarza (patrz raport)."
            onClick={() => apply({ ...filter, from: null, to: null })}
          />
        )}
      </FilterBar>

      <FilterBar>
        <FilterChip
          label="Wszystkie typy"
          active={filter.type == null}
          onClick={() => apply({ ...filter, type: null })}
        />
        {FLAG_TYPE_ORDER.map((type) => (
          <FilterChip
            key={type}
            label={type}
            active={filter.type === type}
            title={FLAG_TYPE_META[type].short}
            onClick={() => apply({ ...filter, type })}
          />
        ))}
      </FilterBar>

      {flags.isPending ? null : flags.isError ? (
        <Banner tone="danger" live>
          <b>Nie udało się pobrać skrzynki.</b> Panel działa wyłącznie online — to jedyne
          miejsce w systemie, w którym brak sieci wolno pokazać jako blokadę.{' '}
          <Button variant="ghost" size="sm" onClick={() => void flags.refetch()}>
            Ponów
          </Button>
        </Banner>
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <EmptyState
            icon={<CheckIcon size={22} />}
            title={inboxEmpty(filter).title}
            note={inboxEmpty(filter).note}
          />
        </div>
      ) : (
        <DataTable
          caption="Skrzynka flag — porządek serwera: blokujące eksport, potem od najstarszych"
          columns={columnsFor(filter.status)}
          rows={rows}
          rowKey={(row) => row.id}
          rowClass={(row) => (row.id === openedId ? 'opened' : undefined)}
          onRowClick={(row) => {
            void navigate({ pathname: row.href, search: searchParams.toString() });
          }}
        />
      )}

      <Card
        title="Typy flag — co serwer liczy dziś"
        actions={
          <>
            <Pill tone="green">5 typów w kodzie</Pill>
            <Pill tone="dim">mhChain.ts · clockDrift.ts</Pill>
          </>
        }
      >
        <div className="table-wrap plain">
          <table>
            <caption className="visually-hidden">Katalog typów flag i ich skutków</caption>
            <thead>
              <tr>
                <th>Typ</th>
                <th>Warunek</th>
                <th>Skutek i znaczenie w praktyce</th>
              </tr>
            </thead>
            <tbody>
              {FLAG_TYPE_ORDER.map((type) => (
                <tr key={type}>
                  <td>
                    <Pill tone={FLAG_TYPE_META[type].tone}>{type}</Pill>
                  </td>
                  <td className="dim">{FLAG_TYPE_META[type].condition}</td>
                  <td>{FLAG_TYPE_META[type].effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="hint">
          Serwer porządkuje sesje samolotu <b>po liczniku MH, nie po zegarze</b> — licznik jest
          monotoniczny i niezależny od tego, co pilot ma ustawione w telefonie. Progi tolerancji
          są wspólne z aplikacją (<code className="code-ref">packages/domain/src/rules/tolerances.ts</code>
          ), więc pilot dostaje ostrzeżenie od razu, a nie dzień później. Panel ich nie kopiuje
          i dlatego nie wypisuje tu liczb: wartości pokaże ekran{' '}
          <em>Progi i ustawienia</em>, gdy serwer zacznie je wystawiać.
        </span>
      </Card>

      {openedId == null || Number.isNaN(openedId) ? null : (
        <FlagDrawer
          flagId={openedId}
          flag={opened}
          pilot={session?.pilot ?? null}
          capabilities={session?.capabilities}
          onClose={closeDrawer}
          onWiden={() => apply({ ...DEFAULT_FLAG_FILTER, status: 'all' })}
        />
      )}
    </>
  );
}

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Otwarte' },
  { value: 'resolved', label: 'Rozwiązane' },
  { value: 'all', label: 'Wszystkie' },
];

/**
 * Kolumny skrzynki. Widok spraw ZAMKNIĘTYCH dokłada trzy: kto, kiedy i czym je
 * zamknął — bo o rozwiązanej fladze pyta się o co innego niż o otwartej. Przy
 * `wszystkie` zostaje zestaw podstawowy: kolumna „Kto rozwiązał" pusta w połowie
 * wierszy niesie mniej niż plakietka „Rozwiązana" w kolumnie „Skutek".
 */
function columnsFor(status: StatusFilter): Column<FlagRow>[] {
  const base: Column<FlagRow>[] = [
    {
      key: 'effect',
      header: 'Skutek',
      render: (row) => (
        <Pill tone={row.effect.tone} dot={row.effect.dot}>
          {row.effect.text}
        </Pill>
      ),
    },
    {
      key: 'age',
      header: 'Wiek',
      align: 'num',
      render: (row) => <span className={row.age.stale ? 'cell-age old' : 'cell-age'}>{row.age.text}</span>,
    },
    {
      key: 'type',
      header: 'Typ',
      render: (row) => (
        <>
          <Pill tone={row.type.tone}>{row.type.code}</Pill>
          <span className="cell-sub">{row.type.short}</span>
        </>
      ),
    },
    {
      key: 'aircraft',
      header: 'Samolot',
      render: (row) => (
        <>
          <span className="reg">{row.aircraft.reg}</span>
          {row.aircraft.type == null ? null : <span className="cell-sub">{row.aircraft.type}</span>}
        </>
      ),
    },
    {
      key: 'discrepancy',
      header: 'Rozbieżność',
      align: 'num',
      render: (row) => (
        <>
          {row.discrepancy.main}
          {row.discrepancy.sub == null ? null : <span className="cell-sub">{row.discrepancy.sub}</span>}
        </>
      ),
    },
    {
      key: 'sessions',
      header: 'Sesje',
      cellClass: 'mono dim',
      render: (row) => (
        <>
          {row.sessions[0] ?? '—'}
          {row.sessions.slice(1).map((uuid) => (
            <span className="cell-sub" key={uuid}>
              {uuid}
            </span>
          ))}
        </>
      ),
    },
    {
      key: 'created',
      header: 'Utworzona · UTC',
      align: 'num',
      render: (row) => (
        <>
          {row.created.text}
          <span className="cell-sub">{row.created.sub}</span>
        </>
      ),
    },
  ];

  const resolution: Column<FlagRow>[] =
    status !== 'resolved'
      ? []
      : [
          {
            key: 'resolvedAt',
            header: 'Rozwiązana · UTC',
            align: 'num',
            render: (row) => row.resolution?.at ?? '—',
          },
          {
            key: 'resolvedBy',
            header: 'Kto rozwiązał',
            cellClass: 'mono',
            render: (row) => row.resolution?.by ?? '—',
          },
          {
            key: 'note',
            header: 'Komentarz',
            cellClass: 'dim',
            render: (row) => row.resolution?.note ?? '',
          },
        ];

  const actions: Column<FlagRow> = {
    key: 'actions',
    header: '',
    render: (row) => (
      <div className="row-actions">
        <LinkButton to={row.href} variant="ghost" size="sm">
          Szczegóły
        </LinkButton>
      </div>
    ),
  };

  return [...base, ...resolution, actions];
}
