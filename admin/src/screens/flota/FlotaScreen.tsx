/**
 * UZ Aero — panel: FLOTA (`design/admin/A07-flota.html`).
 *
 * ══ CZYM TEN EKRAN JEST W SYSTEMIE ══
 * To nie jest lista sprzętu, tylko **panel sterowania regułami**. Pojemność zbiorników
 * wyznacza tolerancję flagi `FUEL_MISMATCH`, format motogodzin zmienia sposób wpisywania
 * na preflight, wymóg drugiego pilota bramkuje przejęcie samolotu, a stan służby
 * decyduje, czy jednostka w ogóle pojawi się na liście wyboru w aplikacji. Każda z tych
 * czterech rzeczy wychodzi do telefonów jednym kanałem — przez `GET /reference`.
 *
 * ══ DWA ŹRÓDŁA W JEDNYM WIERSZU I EKRAN MA JE ROZRÓŻNIAĆ ══
 * Lewa strona tabeli to KONFIGURACJA z bazy panelu (zmienia się tylko tutaj). Prawa —
 * stan bieżący, który przyniosły TELEFONY wraz ze zdarzeniami: kto trzyma samolot,
 * ostatnie MH i FOB. Ta druga bywa nieświeża i wtedy jest oznaczona (`flotaRows.ts`,
 * trzy stany świeżości). Liczniki fizyczne wygrywają — wartości z tej tabeli są
 * podpowiedzią dla pilota na preflight, nie prawdą.
 *
 * Ekran jest `.tsx` BEZ arytmetyki i bez decyzji o treści: plakietki, podpisy, liczniki
 * i dostępność akcji pochodzą z czystych modułów obok (`flotaFilters`, `flotaRows`,
 * `flotaTiles`, `samolotActions`), które mają testy w Node.
 *
 * ══ CZEGO TEN EKRAN ŚWIADOMIE NIE POKAZUJE ══
 *  1. **Plakietki „W locie"** z mockupu — projekcja `sessions` nie niesie stanu silnika
 *     (ta sama granica, o którą rozbił się chip „W locie" na `A02`). Claim mówi „ktoś
 *     zajął jednostkę na dziś" i tak jest podpisany: „Zajęty".
 *  2. **Daty i powodu wyłączenia** („od 19 JUN 2026 · remont"). W `aircraft` nie ma
 *     takich kolumn; kto i kiedy wyłączył jednostkę, wie dziennik audytu.
 * Obie rzeczy są opisane na ekranie, a nie przemilczane.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import type { Capability } from '../../api/dto';
import { useSessionState } from '../../auth/sessionContext';
import { useFleet } from '../../queries/useFleet';
import {
  Banner,
  Button,
  Card,
  Columns,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  KeyValue,
  LinkButton,
  PageHead,
  Pill,
  SearchInput,
  Tile,
  TileGrid,
  type Column,
} from '../../ui/components';
import { PlaneIcon } from '../../ui/components/icons';
import { SamolotDrawer } from './SamolotDrawer';
import {
  NEW_AIRCRAFT_SEGMENT,
  filterFromParams,
  fleetListQuery,
  isNarrowed,
  nowySamolotHref,
  paramsFromFilter,
  samolotHref,
  type FlotaFilter,
} from './flotaFilters';
import { disabledOpenDays, fleetRows, flotaEmpty, freshClass, type FleetRow } from './flotaRows';
import { fleetChips, fleetTiles, toleranceRows } from './flotaTiles';
import { canManageFleet, editAction, fleetLoad } from './samolotActions';

export function FlotaScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useSessionState();

  const filter = filterFromParams(searchParams);
  const fleet = useFleet(fleetListQuery(filter));
  // Druga, NIEZAWĘŻONA lista — i to nie jest marnotrawstwo. Kafle opisują flotę,
  // a nie zawężenie („Najstarszy odczyt" policzony z listy po filtrze mówiłby o czymś
  // innym, niż głosi jego etykieta). Przy pustym filtrze klucz zapytania jest ten sam,
  // więc TanStack nie wysyła drugiego żądania; przy zawężeniu płacimy jednym żądaniem
  // o kilka wierszy. Ta sama lista jest słownikiem samolotów dla filtrów `A02`.
  const all = useFleet({});

  // Wpis w wyszukiwarce żyje lokalnie do naciśnięcia Entera: filtrem jest URL, ale
  // przeładowywanie listy po każdej literze rejestracji byłoby serią żądań, z których
  // żadne nie jest tym, o które pyta człowiek.
  const [searchDraft, setSearchDraft] = useState(filter.search ?? '');
  useEffect(() => {
    setSearchDraft(filter.search ?? '');
  }, [filter.search]);

  const apply = (next: FlotaFilter): void => setSearchParams(paramsFromFilter(next));

  const items = fleet.data?.items ?? [];
  const everything = all.data?.items ?? [];
  const now = Date.now();
  const rows = fleetRows(items, now);
  const empty = flotaEmpty(isNarrowed(filter));
  // Kafle opisują CAŁĄ flotę, więc i to ostrzeżenie liczymy z listy niezawężonej —
  // inaczej chip „W służbie" chowałby jedyny wiersz, o którym ten baner mówi.
  const stranded = disabledOpenDays(everything);
  const load = fleetLoad(
    { pending: fleet.isPending, error: fleet.isError },
    { pending: all.isPending, error: all.isError },
  );

  const capabilities = session?.capabilities;
  const manage = canManageFleet(capabilities);

  /** Zamknięcie szuflady zdejmuje z adresu jednostkę, ale ZOSTAWIA zawężenie listy. */
  const closeDrawer = (): void => {
    void navigate({
      pathname: '/flota',
      search: new URLSearchParams(paramsFromFilter(filter)).toString(),
    });
  };

  const openedNew = id === NEW_AIRCRAFT_SEGMENT;
  // Wiersz szukamy najpierw w liście ZAWĘŻONEJ (to ją człowiek widzi pod spodem),
  // a w drugiej kolejności w pełnej — wklejony link do jednostki odfiltrowanej ma
  // otworzyć szufladę, a nie stan „nie ma jej tutaj". Do stanu „nie ma" schodzimy
  // dopiero wtedy, gdy identyfikatora nie zna ŻADNA z dwóch list.
  const opened =
    id == null || openedNew
      ? null
      : (items.find((item) => item.id === id) ??
        everything.find((item) => item.id === id) ??
        null);

  return (
    <>
      <PageHead
        title="FLOTA"
        sub={
          <>
            Konfiguracja jednostek: to z niej aplikacja bierze listę wyboru samolotu, skalę
            paliwomierza, format wpisu motogodzin i wymóg drugiego pilota. Kolumny po prawej
            to stan bieżący z telefonów — bywa nieświeży i jest wtedy oznaczony. Czasy UTC.
          </>
        }
        actions={
          <LinkButton
            to={nowySamolotHref(filter)}
            variant="primary"
            disabled={!manage}
            reason={editAction(capabilities).reason ?? undefined}
          >
            Dodaj samolot
          </LinkButton>
        }
      />

      <Banner tone="status">
        <b>Sekcja administratora.</b> Dodawanie i edycja jednostek wymaga roli{' '}
        <code>administrator</code>. Szef wyszkolenia czyta tę tabelę (potrzebuje jej do flag
        i statystyk), ale bez przycisków edycji — przyciski zostają{' '}
        <b>widoczne i zablokowane z powodem</b>, bo ukrycie zmuszałoby do zgadywania, czy
        funkcji nie ma w produkcie, czy nie ma jej Twoje konto.
      </Banner>

      <TileGrid>
        {fleetTiles(all.data?.counts ?? null, everything, now).map((tile) => (
          <Tile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            note={tile.note}
            {...(tile.unit == null ? {} : { unit: tile.unit })}
            {...(tile.tone == null ? {} : { tone: tile.tone })}
          />
        ))}
      </TileGrid>

      <FilterBar>
        <SearchInput
          value={searchDraft}
          ariaLabel="Szukaj jednostki"
          placeholder={'Szukaj: rejestracja, typ — Enter filtruje'}
          onChange={setSearchDraft}
          onSubmit={() =>
            apply({ ...filter, search: searchDraft.trim() === '' ? null : searchDraft.trim() })
          }
        />
        {fleetChips(fleet.data?.scopes ?? null).map((chip) => (
          <FilterChip
            key={chip.scope}
            label={chip.label}
            {...(chip.count == null ? {} : { count: chip.count })}
            active={filter.scope === chip.scope}
            {...(chip.scope === 'claimed' ? { tone: 'amber' as const } : {})}
            onClick={() => apply({ ...filter, scope: chip.scope })}
          />
        ))}
        <span className="list-spacer">
          <Pill tone="blue" dot>
            Wszystkie czasy UTC
          </Pill>
        </span>
      </FilterBar>

      {fleet.isPending ? null : fleet.isError ? (
        <Banner tone="danger" live>
          <b>Nie udało się pobrać floty.</b> Panel działa wyłącznie online — to jedyne miejsce
          w systemie, w którym brak sieci wolno pokazać jako blokadę.{' '}
          <Button variant="ghost" size="sm" onClick={() => void fleet.refetch()}>
            Ponów
          </Button>
        </Banner>
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <EmptyState icon={<PlaneIcon size={22} />} title={empty.title} note={empty.note} />
        </div>
      ) : (
        <DataTable
          caption="Flota — jednostki wyłączone na końcu, czasy UTC"
          columns={columns(filter, capabilities)}
          rows={rows}
          rowKey={(row) => row.id}
          rowClass={(row) => (row.id === id ? 'opened' : row.dim ? 'dim' : undefined)}
          onRowClick={(row) => {
            void navigate(samolotHref(filter, row.id));
          }}
        />
      )}

      <Banner tone="warn">
        <b>Wyłączenie ze służby to zmiana konfiguracji, nie kasowanie.</b> Jednostka znika
        z listy wyboru samolotu w aplikacji pilota — ale <b>historia zostaje w całości</b>:
        sesje, zdarzenia, karty dnia i łańcuch motogodzin liczą się dalej, a jej dni nadal
        widać na liście dni lotnych. Samolot z <b>otwartym dniem</b> wyłączyć się nie da;
        serwer odmawia z podanym powodem.
      </Banner>

      <Banner tone="status">
        <b>Blokada dotyczy telefonów, które pobrały świeżą konfigurację.</b> Wyłączenie ze
        służby nie jest bramką na <code>POST /events</code> i być nią nie może: rejestr jest
        append-only i przyjmuje <b>fakty z terenu</b>, a odrzucenie paczki złamałoby regułę
        nadrzędną („brak sieci nigdy nie blokuje pracy pilota") i zgubiłoby dane o locie,
        który i tak się odbył. Telefon z cache'em referencyjnym sprzed wyłączenia potrafi
        więc jeszcze otworzyć dzień na jednostce wyłączonej — i wtedy widać to w tabeli
        wyżej, w kolumnie „Stan służby".
      </Banner>

      {stranded == null ? null : (
        <Banner tone="warn">
          <b>Wyłączona jednostka z otwartym dniem.</b> {stranded.text}
        </Banner>
      )}

      <Columns>
        <Card
          title="Skąd biorą się kolumny stanu"
          actions={<Pill tone="dim">czasy UTC</Pill>}
        >
          <span className="hint">
            <b>Konfiguracja</b> (rejestracja, typ, rok, pojemność, format MH, dual, stan
            służby) jest w bazie panelu i zmienia się tylko tutaj.
          </span>
          <span className="hint">
            <b>Claim, MH i FOB</b> przychodzą z telefonów wraz ze zdarzeniami — pokazujemy je
            z wiekiem ostatniego synchronizowania. Wpis starszy niż 24 h dostaje kolor amber;
            to nie awaria, tylko informacja, że samolot od tego czasu mógł stać albo lecieć
            bez zasięgu. Brak odczytu to <b>„brak danych"</b>, nigdy zero.
          </span>
          <span className="hint">
            <b>Liczniki fizyczne wygrywają.</b> Wartości z tej tabeli są podpowiedzią dla
            pilota na preflight, nie prawdą — pilot patrzy na licznik i to jego odczyt trafia
            do rejestru.
          </span>
          <span className="hint">
            <b>„Zajęty" nie znaczy „w locie".</b> Projekcja dnia niesie informację o otwartej
            sesji, nie o pracy silnika — tak samo jak na liście dni lotnych. Kto i kiedy
            wyłączył jednostkę ze służby, wie <b>dziennik audytu</b>; w tabeli tej daty nie
            ma, bo nie ma jej w bazie.
          </span>
        </Card>

        <Card title="Progi zależne od pojemności">
          {toleranceRows(everything).map((row) => (
            <KeyValue key={row.id} label={row.label} value={row.value} />
          ))}
          <span className="hint">
            Tolerancja flagi <code>FUEL_MISMATCH</code> to większa z dwóch wartości:{' '}
            <b>10 L</b> albo <b>5% pojemności</b>. <b>Liczy ją serwer</b> — panel nie ma prawa
            mnożyć pojemności po swojemu, żeby na dwóch ekranach nie wyszły dwie różne
            wartości tego samego progu. Zmiana pojemności w szufladzie <b>nie przepisuje
            rejestru</b> — flagi już wystawione zachowują próg, przy którym powstały — ale
            nowy próg obowiązuje przy najbliższej synchronizacji tej jednostki także dla{' '}
            <b>par dni już zamkniętych</b>. Szczegóły w szufladzie samolotu.
          </span>
        </Card>
      </Columns>

      {id == null ? null : (
        <SamolotDrawer
          /**
           * KLUCZ = identyfikator jednostki z adresu. Bez niego przejście
           * `/flota/A` → `/flota/B` zostawiało zamontowaną szufladę A: React widziałby
           * ten sam komponent w tym samym miejscu drzewa, więc szkic formularza
           * przeżywałby zmianę samolotu i pokazywał cudzą pojemność pod cudzym
           * nagłówkiem. Ta sama pułapka, co przy szufladzie konta.
           */
          key={id}
          aircraft={opened}
          creating={openedNew}
          capabilities={capabilities}
          load={load}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}

/**
 * Kolumny listy — dokładnie te z `A07-flota.html`, z jedną świadomą zamianą: plakietka
 * claimu mówi „Zajęty" zamiast „W locie" (uzasadnienie w nagłówku pliku i w karcie
 * „Skąd biorą się kolumny stanu").
 *
 * Sortowania nie ma na żadnej kolumnie, bo porządek listy jest kontraktem serwera
 * (wyłączone na końcu, dalej po rejestracji) — nagłówek ze strzałką obiecywałby
 * zachowanie, którego trasa nie ma.
 */
function columns(
  filter: FlotaFilter,
  capabilities: readonly Capability[] | undefined,
): Column<FleetRow>[] {
  return [
    {
      key: 'reg',
      header: 'Rejestracja',
      render: (row) => (
        <>
          <span className="reg">{row.reg}</span>
          <span className="cell-sub">{row.type}</span>
        </>
      ),
    },
    { key: 'year', header: 'Rok', align: 'num', cellClass: 'dim', render: (row) => row.year },
    {
      key: 'capacity',
      header: 'Pojemność',
      align: 'num',
      render: (row) => (
        <>
          {row.capacity}
          <span className="cell-sub">próg {row.tolerance}</span>
        </>
      ),
    },
    {
      key: 'mhFormat',
      header: 'Format MH',
      render: (row) => <Pill tone={row.mhFormat.tone}>{row.mhFormat.text}</Pill>,
    },
    {
      key: 'dual',
      header: 'Dual',
      cellClass: 'dim',
      render: (row) =>
        row.dual == null ? <>—</> : <Pill tone={row.dual.tone}>{row.dual.text}</Pill>,
    },
    {
      key: 'service',
      header: 'Stan służby',
      render: (row) => (
        <>
          <Pill tone={row.service.tone} dot={row.service.dot}>
            {row.service.text}
          </Pill>
          {row.service.sub == null ? null : <span className="cell-sub">{row.service.sub}</span>}
        </>
      ),
    },
    {
      key: 'claim',
      header: 'Claim teraz',
      render: (row) => (
        <>
          <Pill tone={row.claim.badge.tone} dot={row.claim.badge.dot}>
            {row.claim.badge.text}
          </Pill>
          <span className={freshClass(row.claim.freshness)}>
            {row.claim.text === '—' ? row.claim.sub : `${row.claim.text} · ${row.claim.sub}`}
          </span>
        </>
      ),
    },
    {
      key: 'mh',
      header: 'Ostatnie MH',
      align: 'num',
      render: (row) => (
        <>
          {row.mh.text}
          {row.mh.sub == null ? null : (
            <span className={freshClass(row.mh.freshness)}>{row.mh.sub}</span>
          )}
        </>
      ),
    },
    {
      key: 'fuel',
      header: 'Ostatni FOB',
      align: 'num',
      render: (row) => (
        <>
          {row.fuel.text}
          {row.fuel.sub == null ? null : (
            <span className={freshClass(row.fuel.freshness)}>{row.fuel.sub}</span>
          )}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="row-actions">
          {/* Przejście do dni ma KAŻDY wiersz, nie tylko zajęty — jednostka wolna jest
              przypadkiem najczęstszym i to o jej historię pyta się najczęściej. Cel
              i etykietę wybiera `dayLink`, bo to decyzja o treści, a nie układ. */}
          <LinkButton to={row.day.to} variant="ghost" size="sm">
            {row.day.label}
          </LinkButton>
          <LinkButton
            to={samolotHref(filter, row.id)}
            variant="ghost"
            size="sm"
            disabled={!canManageFleet(capabilities)}
            reason={editAction(capabilities).reason ?? undefined}
          >
            Edytuj
          </LinkButton>
        </div>
      ),
    },
  ];
}
