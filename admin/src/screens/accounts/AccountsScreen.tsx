/**
 * Ninerdeck - panel 2.0: lista pilotów (`#/piloci`).
 *
 * Ekran ma jedną tabelę. Czego tu NIE MA wobec panelu 1.0: czterech kafli z licznikami
 * (i ich czterech przypisów), liczb przy chipach, kolumny „Zmieniono", kolumny „Dni lotne"
 * (statystyka na ekranie konfiguracji), akcji w wierszach oraz dwóch banerów i trzech kart
 * wyjaśniających pod tabelą.
 *
 * == LISTA TO CZŁONKOSTWA, NIE OSOBY (wielofirmowość 2.0.0) ==
 * Kod i rola należą do CZŁONKOSTWA w tym klubie: ta sama osoba w drugim klubie ma inny
 * kod i może mieć inną rolę. Nad listą stoi kolejka zgłoszeń kodem klubu - zadanie do
 * zrobienia nad stanem - a jedyną akcją główną jest „Kod klubu": nowy członek wchodzi
 * WYŁĄCZNIE kodem, z panelu nie da się nikogo dopisać ani adresem, ani linkiem.
 *
 * == TRZY SZUFLADY NAD JEDNĄ LISTĄ ==
 * Członek (`:id`), KANDYDAT z kolejki (`zgloszenia/:id`) i KOD KLUBU (`kod`) - każda ma
 * własny adres, bo każda opisuje inny byt. Który to, mówi TRASA (`routes.tsx`), a nie
 * ekran czytający adres w środku: `zgloszenia` i `kod` byłyby dla `:id?` zwykłym
 * identyfikatorem konta.
 */

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { can } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { usePendingMemberships } from '../../queries/useMemberships';
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
import { KeyIcon, PeopleIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { AccountDrawer } from './AccountDrawer';
import { accountRow, type AccountRow } from './accountRows';
import { ClubCodeDrawer } from './ClubCodeDrawer';
import { PendingCard } from './PendingCard';
import { RequestDrawer } from './RequestDrawer';

const HEADERS = ['Kod', 'Imię i nazwisko', 'E-mail', 'Rola', 'Status', ''];

/** Która szuflada stoi nad listą - rozstrzyga TRASA, nie ekran (patrz nagłówek pliku). */
export type AccountsDrawer = 'account' | 'request' | 'club-code';

export function AccountsScreen({ drawer }: { drawer: AccountsDrawer }) {
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

  // Kolejka i kod klubu jadą na `accounts.manage` TAKŻE NA ODCZYT: w kolejce stoją
  // adresy ludzi spoza klubu, a kod jest włącznikiem jedynej drogi do niego. Pytanie
  // zadane bez tej zdolności wróciłoby 403 i zapaliło baner błędu na ekranie, na
  // którym nic złego się nie stało.
  const queue = usePendingMemberships(manages);

  const listError = pilots.error ?? queue.error;
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
        JEDNA akcja główna: „Kod klubu". Dawne „Dodaj pilota" zniknęło razem z drogą,
        którą opisywało (issue #100, D3) - nowy członek wchodzi WYŁĄCZNIE kodem.
        Bez `accounts.manage` przycisku nie ma wcale: wyszarzony obiecywałby akcję,
        której reguły odmówią (zasada „brak uprawnień = brak przycisku").
      */}
      <PageHead
        title="Piloci"
        actions={
          manages ? (
            <LinkButton to="/piloci/kod" variant="primary">
              <KeyIcon size={13} />
              Kod klubu
            </LinkButton>
          ) : undefined
        }
      />

      <PendingCard queue={queue.data} />

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

      {/* Nieudany odczyt KOLEJKI mówi o sobie tak samo jak nieudany odczyt listy: bez
          tego karta zgłoszeń po prostu by nie wjechała, czyli awaria wyglądałaby jak
          „nikt nie czeka" - a to jest gorsze niż komunikat o błędzie. */}
      {listError == null ? null : <Banner tone="danger">{errorMessage(listError)}</Banner>}

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

      {drawer === 'club-code' ? (
        <ClubCodeDrawer orgName={session?.org?.name ?? 'Klub'} onClose={backToList} />
      ) : drawer === 'request' && id != null ? (
        <RequestDrawer
          pilotId={id}
          queue={queue.data?.items ?? null}
          queuePending={queue.isPending}
          onClose={backToList}
        />
      ) : drawer === 'account' && id != null ? (
        <AccountDrawer
          id={id}
          pilots={pilots.data?.items ?? null}
          listPending={pilots.isPending}
          manages={manages}
          selfId={session?.pilot.id ?? null}
          onClose={backToList}
        />
      ) : null}

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
      // Jedyna droga do klubu to kod klubu, więc pusta lista mówi, CO ma się stać,
      // i prowadzi tam, gdzie ten kod stoi. Bez `accounts.manage` zostaje samo zdanie:
      // przycisk do karty, której serwer nie odda, byłby obietnicą.
      note="Podaj pilotom kod klubu - po wpisaniu trafią do zgłoszeń, a Ty zdecydujesz."
      action={
        manages ? (
          <LinkButton to="/piloci/kod" variant="primary" size="sm">
            Kod klubu
          </LinkButton>
        ) : undefined
      }
    />
  );
}
