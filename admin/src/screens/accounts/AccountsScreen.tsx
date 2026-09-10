/**
 * UZ Aero - panel 2.0: lista pilotów (`#/piloci`).
 *
 * Ekran ma jedną tabelę. Czego tu NIE MA wobec panelu 1.0: czterech kafli z licznikami
 * (i ich czterech przypisów), liczb przy chipach, kolumny „Zmieniono", kolumny „Dni lotne"
 * (statystyka na ekranie konfiguracji), akcji w wierszach oraz dwóch banerów i trzech kart
 * wyjaśniających pod tabelą.
 *
 * == KOLEJKA ZGŁOSZEŃ WRACA W EPIKU E (wielofirmowość, issue #101) ==
 * Do epiku D (issue #100) stała tu kolejka zgłoszeń rejestracyjnych z logowania Google.
 * Zgłoszenie jest odtąd CZŁONKOSTWEM `pending` po kodzie klubu (`docs/wielofirmowosc.md`
 * §3.8, §8.3), a karta ZGŁOSZENIA nad listą i karta „Kod klubu" wchodzą 1:1 z makiet
 * `piloci-lista`, `piloci-zgloszenie` i `piloci-kod-klubu` razem z kontraktem członkostw.
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { can } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { usePilots } from '../../queries/usePilots';
import {
  Banner,
  DataTable,
  EmptyState,
  FilterChip,
  LinkButton,
  Loadable,
  PageHead,
  Pill,
  SearchInput,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { PeopleIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { AccountDrawer } from './AccountDrawer';
import { accountRow, type AccountRow } from './accountRows';

const HEADERS = ['Kod', 'Imię i nazwisko', 'E-mail', 'Rola', 'Status', ''];

export function AccountsScreen() {
  const { session } = useSessionState();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();

  // Filtry mieszkają w adresie, nie w stanie komponentu: link „pokaż mi to samo, co
  // widzisz" jest podstawowym scenariuszem rozmowy o panelu.
  const search = params.get('szukaj') ?? '';
  const onlyActive = params.get('stan') === 'aktywni';
  const descending = params.get('kolejnosc') === 'z-a';

  const setParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(params);
    if (value == null || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const pilots = usePilots({
    q: search === '' ? undefined : search,
    active: onlyActive ? 'true' : undefined,
    sort: descending ? 'desc' : undefined,
  });

  const manages = can(session?.capabilities, 'accounts.manage');

  const rows = (pilots.data?.items ?? []).map(accountRow);
  const backToList = (): void => {
    void navigate({ pathname: '/piloci', search: params.toString() });
  };

  const columns: Column<AccountRow>[] = [
    { key: 'code', header: 'Kod', cellClass: 'reg', render: (row) => row.code },
    {
      key: 'name',
      header: 'Imię i nazwisko',
      cellClass: 'cell-strong',
      sort: {
        direction: descending ? 'desc' : 'asc',
        onToggle: () => setParam('kolejnosc', descending ? null : 'z-a'),
      },
      render: (row) => row.name,
    },
    { key: 'email', header: 'E-mail', cellClass: 'cell-sub', render: (row) => row.email },
    {
      key: 'role',
      header: 'Rola',
      render: (row) => <Pill tone={row.roleTone}>{row.roleLabel}</Pill>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Pill tone={row.active ? 'green' : 'dim'} dot={row.active}>
          {row.statusLabel}
        </Pill>
      ),
    },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      // Link, nie przycisk: kartę konta da się wtedy otworzyć w nowej karcie
      // przeglądarki i wkleić komuś jej adres.
      render: (row) => (
        <LinkButton to={`/piloci/${row.id}`} size="sm" variant="ghost">
          {manages ? 'Edytuj' : 'Zobacz'}
        </LinkButton>
      ),
    },
  ];

  return (
    <>
      {/*
        Akcji głównej ekran NIE MA (issue #100, D3): dawne „Dodaj pilota" zniknęło razem
        z `POST /pilots` - nowy członek wchodzi WYŁĄCZNIE kodem klubu. Jej miejsce zajmie
        „Kod klubu" (makieta `piloci-kod-klubu`) razem z ekranami epiku E; wyszarzony
        przycisk obiecywałby akcję, której serwer nie ma.
      */}
      <PageHead title="Piloci" />

      <div className="filters">
        <SearchInput
          value={search}
          placeholder="Szukaj: nazwisko, kod, e-mail"
          ariaLabel="Szukaj pilota"
          onChange={(value) => setParam('szukaj', value)}
          onSubmit={() => undefined}
        />
        <FilterChip label="Wszyscy" on={!onlyActive} onToggle={() => setParam('stan', null)} />
        <FilterChip
          label="Aktywni"
          on={onlyActive}
          onToggle={() => setParam('stan', onlyActive ? null : 'aktywni')}
        />
      </div>

      {pilots.error == null ? null : <Banner tone="danger">{errorMessage(pilots.error)}</Banner>}

      <Loadable
        pending={pilots.isPending}
        skeleton={<TableSkeleton headers={HEADERS} widths={[42, 150, 190, 96, 78, 54]} rows={6} />}
      >
        {rows.length === 0 ? (
          <EmptyAccounts search={search} manages={manages} onClear={() => setParam('szukaj', null)} />
        ) : (
          <DataTable
            caption="Piloci"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowClass={(row) => (row.muted ? 'muted' : undefined)}
            onRowClick={(row) => navigate(`/piloci/${row.id}`)}
          />
        )}
      </Loadable>

      {id == null ? null : (
        <AccountDrawer
          id={id}
          pilots={pilots.data?.items ?? null}
          listPending={pilots.isPending}
          manages={manages}
          selfId={session?.pilot.id ?? null}
          onClose={backToList}
        />
      )}

    </>
  );
}

function EmptyAccounts({
  search,
  manages,
  onClear,
}: {
  search: string;
  manages: boolean;
  onClear: () => void;
}) {
  // Dwa różne stany puste, bo to dwie różne wiadomości: „nikogo tu nie ma" i „nikt
  // nie pasuje do tego, czego szukasz". Jeden komunikat na oba kazałby zgadywać.
  if (search !== '') {
    return (
      <EmptyState
        icon={<PeopleIcon size={20} />}
        title={`Nikt nie pasuje do „${search}”`}
        note="Sprawdź pisownię albo wyczyść wyszukiwanie."
        action={
          <button type="button" className="btn sm" onClick={onClear}>
            Wyczyść wyszukiwanie
          </button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<PeopleIcon size={20} />}
      title="Nie ma jeszcze żadnego pilota"
      // Jedyna droga do klubu to kod klubu (issue #100), więc pusta lista mówi, CO ma
      // się stać, a nie oferuje akcji, której nie ma: karta „Kod klubu" dochodzi w epiku E.
      note="Podaj pilotom kod klubu - po wpisaniu trafią do zgłoszeń, a Ty zdecydujesz."
    />
  );
}
