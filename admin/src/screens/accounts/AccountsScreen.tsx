/**
 * UZ Aero - panel 2.0: lista pilotów (`#/piloci`).
 *
 * Ekran ma jedną tabelę i - gdy ktoś czeka - KOLEJKĘ ZGŁOSZEŃ nad nią. Czego tu NIE MA
 * wobec panelu 1.0: czterech kafli z licznikami (i ich czterech przypisów), liczb przy
 * chipach, kolumny „Zmieniono", kolumny „Dni lotne" (statystyka na ekranie konfiguracji),
 * akcji w wierszach oraz dwóch banerów i trzech kart wyjaśniających pod tabelą.
 *
 * == KOLEJKA ZGŁOSZEŃ (logowanie Google, 2026-09-04) ==
 * Ludzie, którzy zalogowali się kontem Google i czekają na decyzję
 * (`docs/logowanie-google.md` §8). Stoi NAD listą, bo to jest zadanie do zrobienia,
 * a lista - stan; i stoi wyłącznie wtedy, gdy ktoś czeka. Pusta kolejka nie dostaje
 * karty z zerem: to stan domyślny, a stan domyślny nie zajmuje ekranu (reguła SyncChipa).
 * Widzi ją tylko konto z `accounts.manage` - to e-maile osób spoza klubu.
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { can } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { usePilots } from '../../queries/usePilots';
import { useRegistrations } from '../../queries/useRegistrations';
import {
  Banner,
  Card,
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
import { PeopleIcon, PlusIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { AccountDrawer } from './AccountDrawer';
import { accountRow, type AccountRow } from './accountRows';
import { RegistrationDrawer } from './RegistrationDrawer';
import { registrationRow, type RegistrationRow } from './registrationRows';

const HEADERS = ['Kod', 'Imię i nazwisko', 'E-mail', 'Rola', 'Status', ''];

export function AccountsScreen() {
  const { session } = useSessionState();
  const navigate = useNavigate();
  // `id` pod `piloci/:id?`, `subject` pod `piloci/zgloszenia/:subject` - ten sam ekran
  // pod dwiema trasami, bo obie karty otwierają się NAD tą samą listą.
  const { id, subject } = useParams();
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
  const registrations = useRegistrations(['pending'], manages);
  const queue = (registrations.data?.items ?? []).map(registrationRow);

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

  const queueColumns: Column<RegistrationRow>[] = [
    { key: 'name', header: 'Imię u Google', cellClass: 'cell-strong', render: (row) => row.name },
    { key: 'email', header: 'E-mail', cellClass: 'cell-sub', render: (row) => row.email },
    { key: 'since', header: 'Czeka od', cellClass: 'cell-sub', render: (row) => row.sinceLabel },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      render: (row) => (
        <LinkButton to={`/piloci/zgloszenia/${encodeURIComponent(row.subject)}`} size="sm" variant="primary">
          Rozpatrz
        </LinkButton>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="PILOCI"
        // Brak uprawnień = BRAK przycisku, nie przycisk wyszarzony. Powód stoi raz,
        // w karcie konta („tylko podgląd") - a nie przy każdej akcji na ekranie.
        actions={
          manages ? (
            <LinkButton to="/piloci/nowy" variant="primary">
              <PlusIcon size={13} />
              Dodaj pilota
            </LinkButton>
          ) : undefined
        }
      />

      {registrations.error == null ? null : (
        <Banner tone="danger">{errorMessage(registrations.error)}</Banner>
      )}

      {queue.length === 0 ? null : (
        <Card title={`ZGŁOSZENIA · ${queue.length}`}>
          <DataTable
            caption="Zgłoszenia czekające na decyzję"
            columns={queueColumns}
            rows={queue}
            rowKey={(row) => `${row.provider}:${row.subject}`}
            onRowClick={(row) => navigate(`/piloci/zgloszenia/${encodeURIComponent(row.subject)}`)}
          />
        </Card>
      )}

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

      {subject == null ? null : (
        <RegistrationDrawer
          subject={subject}
          registrations={registrations.data?.items ?? null}
          listPending={registrations.isPending}
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
      note="Dodaj konto z adresem Google pilota albo poczekaj na jego zgłoszenie z aplikacji."
      action={
        manages ? (
          <LinkButton to="/piloci/nowy" variant="primary">
            <PlusIcon size={13} />
            Dodaj pilota
          </LinkButton>
        ) : undefined
      }
    />
  );
}
