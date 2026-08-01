/**
 * UZ Aero — panel: LISTA DNI LOTNYCH (`design/admin/A02-dni.html`).
 *
 * Jeden wiersz = jedna sesja (`session_claim` → `day_close`). Wszystkie liczby są
 * projekcją `projectSession` przepisaną przez serwer — panel je FORMATUJE i niczego
 * nie przelicza.
 *
 * Ekran jest `.tsx` BEZ arytmetyki i bez decyzji o treści: każdy napis, plakietka
 * i podpis pochodzą z czystych modułów obok (`dniRows`, `dniFilters`, `dniPages`,
 * `operations`), które mają testy w Node. Tutaj zostaje układ i spięcie danych
 * z komponentami.
 *
 * ══ TRZY RZECZY, KTÓRYCH TEN EKRAN ŚWIADOMIE NIE POKAZUJE ══
 *  1. **Plakietki „W locie"** — wymaga wiedzy, czy silnik pracuje; projekcja jej nie
 *     niesie, a lista celowo nie woła `projectSession` (§7.1 architektury serwera).
 *  2. **Kalendarza i list wyboru samolotu/pilota** — trasa filtruje po DOKŁADNYCH
 *     identyfikatorach, a listy floty i pilotów panel dostanie dopiero z `A06`/`A07`.
 *     Zakres dat i pilot przychodzą więc z adresu i dają się z niego zdjąć.
 *  3. **Eksportu CSV** z nagłówka mockupu — nie ma trasy, która by go budował.
 * Wszystkie trzy są opisane na ekranie, a nie przemilczane.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useSessionCount, useSessions } from '../../queries/useSessions';
import {
  Banner,
  Button,
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
import { DaysIcon } from '../../ui/components/icons';
import {
  DEFAULT_DNI_FILTER,
  filterFromParams,
  isNarrowed,
  paramsFromFilter,
  sessionCountQuery,
  sessionListQuery,
  type DniFilter,
  type StateFilter,
} from './dniFilters';
import { dayPages, dniEmpty, pagesSummary } from './dniPages';
import { dayRows, type DayRow } from './dniRows';
import { dniTiles } from './dniTiles';
import { OPERATION_META, OPERATION_ORDER } from './operations';

export function DniScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const filter = filterFromParams(searchParams);
  const days = useSessions(sessionListQuery(filter));

  // Liczniki kafli pytają serwer TYM SAMYM zawężeniem, tylko z podmienionym stanem.
  // Policzenie ich z pobranych stron dałoby liczbę, której serwer nigdy nie wysłał —
  // i fałszywą, dopóki nie dociągnie się wszystkich stron kursora.
  const openCount = useSessionCount(sessionCountQuery(filter, 'open'));
  const flaggedCount = useSessionCount(sessionCountQuery(filter, 'flagged'));
  const exportedCount = useSessionCount(sessionCountQuery(filter, 'exported'));

  // Wpis w wyszukiwarce żyje lokalnie do naciśnięcia Entera: filtrem jest URL, ale
  // przeładowywanie listy po każdej literze rejestracji byłoby serią żądań, z których
  // żadne nie ma sensu — trasa dopasowuje identyfikator DOKŁADNIE, nie prefiksem.
  const [aircraftDraft, setAircraftDraft] = useState(filter.aircraftId ?? '');
  useEffect(() => {
    setAircraftDraft(filter.aircraftId ?? '');
  }, [filter.aircraftId]);

  const apply = (next: DniFilter): void => setSearchParams(paramsFromFilter(next));

  const pages = dayPages(days.data);
  const rows = dayRows(pages.items, Date.now());

  return (
    <>
      <PageHead
        title="DNI LOTNE"
        sub={
          <>
            Jeden wiersz = jedna sesja (<code>session_claim</code> → <code>day_close</code>).
            Wszystkie liczby to projekcja <code>projectSession</code> ze strumienia zdarzeń — ta
            sama funkcja, która liczy statystyki w telefonie pilota. Panel niczego nie przelicza
            po swojemu. Czasy UTC.
          </>
        }
        actions={
          <LinkButton
            to=""
            variant="ghost"
            disabled
            reason="serwer nie wystawia jeszcze trasy eksportu listy"
          >
            Eksport CSV
          </LinkButton>
        }
      />

      <TileGrid>
        {/* Warunkiem „—" jest OBECNOŚĆ danych, nie faza ładowania. `isPending` jest
            `false` także wtedy, gdy pobranie się NIE UDAŁO — a `dayPages` bez odpowiedzi
            oddaje wtedy `total: null`, czyli „nie wiemy". Postawienie tu zera kazałoby
            ekranowi twierdzić, tuż obok banera o błędzie, że klub nie ma ani jednego
            dnia lotnego. */}
        {dniTiles(
          {
            total: pages.total,
            open: openCount.data,
            flagged: flaggedCount.data,
            exported: exportedCount.data,
          },
          isNarrowed(filter),
        ).map((tile) => (
          <Tile key={tile.label} label={tile.label} value={tile.value} tone={tile.tone} note={tile.note} />
        ))}
      </TileGrid>

      <FilterBar>
        <SearchInput
          value={aircraftDraft}
          ariaLabel="Filtruj po identyfikatorze samolotu"
          placeholder={'Identyfikator samolotu, np. SP-ABC — Enter filtruje, „/" ustawia fokus'}
          onChange={setAircraftDraft}
          onSubmit={() =>
            apply({
              ...filter,
              aircraftId: aircraftDraft.trim() === '' ? null : aircraftDraft.trim(),
            })
          }
        />
        {filter.from == null && filter.to == null ? null : (
          <FilterChip
            label={`${filter.from ?? '…'} → ${filter.to ?? '…'} · zdejmij`}
            active
            title="Zakres dat pochodzi z adresu — panel nie ma jeszcze kalendarza (patrz podpis pod tabelą)."
            onClick={() => apply({ ...filter, from: null, to: null })}
          />
        )}
        {filter.pilotId == null ? null : (
          <FilterChip
            label={`pilot: ${filter.pilotId} · zdejmij`}
            active
            title="Dopasowuje PIC-a albo Duala — dzień szkolny należy do obu."
            onClick={() => apply({ ...filter, pilotId: null })}
          />
        )}
      </FilterBar>

      <FilterBar>
        {STATE_CHIPS.map((chip) => (
          <FilterChip
            key={chip.value}
            label={chip.label}
            count={COUNT_OF[chip.value]?.(openCount.data, flaggedCount.data, exportedCount.data)}
            active={filter.state === chip.value}
            tone={chip.value === 'flagged' && (flaggedCount.data ?? 0) > 0 ? 'amber' : undefined}
            title={chip.title}
            onClick={() => apply({ ...filter, state: chip.value })}
          />
        ))}
        <span className="list-spacer">
          <Pill tone="blue" dot>
            Wszystkie czasy UTC
          </Pill>
          <Pill tone="dim">{days.isPending ? 'wczytywanie' : pagesSummary(pages)}</Pill>
        </span>
      </FilterBar>

      <FilterBar>
        <FilterChip
          label="Każda operacja"
          active={filter.operation == null}
          onClick={() => apply({ ...filter, operation: null })}
        />
        {OPERATION_ORDER.map((operation) => (
          <FilterChip
            key={operation}
            label={OPERATION_META[operation].label}
            active={filter.operation === operation}
            onClick={() => apply({ ...filter, operation })}
          />
        ))}
      </FilterBar>

      {days.isPending ? null : days.isError ? (
        <Banner tone="danger" live>
          <b>Nie udało się pobrać listy dni.</b> Panel działa wyłącznie online — to jedyne
          miejsce w systemie, w którym brak sieci wolno pokazać jako blokadę.{' '}
          <Button variant="ghost" size="sm" onClick={() => void days.refetch()}>
            Ponów
          </Button>
        </Banner>
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <EmptyState
            icon={<DaysIcon size={22} />}
            title={dniEmpty(isNarrowed(filter)).title}
            note={dniEmpty(isNarrowed(filter)).note}
          />
        </div>
      ) : (
        <>
          <DataTable
            caption="Dni lotne — porządek serwera po dniu służby, czasy UTC"
            columns={columns(filter, apply)}
            rows={rows}
            rowKey={(row) => row.sessionUuid}
            rowClass={(row) => (row.flagged ? 'flagged' : undefined)}
            onRowClick={(row) => void navigate(row.href)}
          />

          <div className="list-foot">
            <span className="hint">
              {pagesSummary(pages)}{' '}
              {pages.hasMore ? (
                <>
                  Kolejne dni dokłada <b>kursor keyset</b>, nie <code>OFFSET</code> — dopisanie
                  nowego dnia w trakcie przeglądania nie przesuwa granicy strony i nie gubi
                  wierszy.
                </>
              ) : (
                <>To wszystko, co spełnia bieżące zawężenie.</>
              )}
            </span>
            {pages.hasMore ? (
              <Button
                variant="ghost"
                disabled={days.isFetchingNextPage}
                onClick={() => void days.fetchNextPage()}
              >
                {days.isFetchingNextPage ? 'Wczytywanie…' : 'Pokaż kolejne dni'}
              </Button>
            ) : null}
          </div>
        </>
      )}

      <Banner tone="status">
        <b>Dzień otwarty ≠ dzień niekompletny.</b> Sesja bez <code>day_close</code> pokazuje sumy
        z tego, co dotarło — telefon dosyła zdarzenia w miarę zasięgu, a kolumny „koniec"
        (MH, FOB) wypełnia dopiero zamknięcie dnia. Do czasu <code>day_close</code> panel niczego
        nie domyśla i nie ekstrapoluje.
      </Banner>

      <Banner tone="warn">
        <b>Czego ta lista jeszcze nie umie.</b> Serwer nie przyjmuje filtra po kliencie ani
        wyszukiwania po nazwisku pilota i po <code>session_uuid</code>, a sortować da się wyłącznie
        po dniu — kursor keyset jedzie po <code>claim_time</code>. Zakres dat i pilot ustawia się
        więc z adresu (<code>?od=2026-07-25&amp;do=2026-07-31&amp;pilot=TML</code>), a kalendarz
        i listy wyboru dojdą razem z ekranami floty i kont. Plakietki „W locie" nie ma z innego
        powodu i to nie jest brak w API: projekcja niesie <code>status</code>, nie niesie „silnik
        pracuje", a to jest decyzja o kształcie projekcji, nie o panelu.
      </Banner>
    </>
  );
}

const STATE_CHIPS: { value: StateFilter; label: string; title?: string }[] = [
  { value: 'all', label: 'Wszystkie stany' },
  {
    value: 'open',
    label: 'Dzień otwarty',
    title: 'Sesje bez `day_close`. Nie znaczy „w locie" — projekcja nie niesie stanu silnika.',
  },
  { value: 'flagged', label: 'Z flagą', title: 'Dni z co najmniej jedną OTWARTĄ flagą.' },
  { value: 'closed', label: 'Zamknięte', title: 'Sesje z `day_close` w rejestrze.' },
  {
    value: 'exported',
    label: 'Wyeksportowane',
    title: 'Dni, dla których w `export_log` jest karta arkusza.',
  },
];

/**
 * Który licznik z serwera podpisuje który chip. Chipy bez licznika (`all`, `closed`)
 * go nie dostają, bo panel NIE liczy plakietek sam — a osobne zapytanie dla każdego
 * chipa byłoby pięcioma żądaniami na każdą zmianę filtra.
 */
const COUNT_OF: Partial<
  Record<
    StateFilter,
    (open: number | undefined, flagged: number | undefined, exported: number | undefined) => number | undefined
  >
> = {
  open: (open) => open,
  flagged: (_open, flagged) => flagged,
  exported: (_open, _flagged, exported) => exported,
};

/**
 * Kolumny listy — dokładnie te z `A02-dni.html`.
 *
 * Sortowanie dostaje WYŁĄCZNIE kolumna „Dzień", bo tylko po niej serwer umie
 * stronicować kursorem. Strzałka przy innym nagłówku obiecywałaby zachowanie,
 * którego trasa nie ma — a nagłówek, który po kliknięciu nic nie robi, jest gorszy
 * od nagłówka bez strzałki.
 */
function columns(filter: DniFilter, apply: (next: DniFilter) => void): Column<DayRow>[] {
  return [
    {
      key: 'day',
      header: 'Dzień · UTC',
      cellClass: 'mono',
      sort: {
        direction: filter.sort,
        onToggle: () => apply({ ...filter, sort: filter.sort === 'desc' ? 'asc' : 'desc' }),
      },
      render: (row) => (
        <>
          {row.day.text}
          <span className="cell-sub">{row.day.sub}</span>
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
      key: 'operation',
      header: 'Operacja',
      render: (row) =>
        row.operation == null ? (
          // Sesja bez `preflight_confirm` nie zadeklarowała operacji. Kreska, nie
          // zgadywanie z reszty dnia — „inne" byłoby wpisaniem czegoś za pilota.
          <>—</>
        ) : (
          <>
            <Pill tone={row.operation.tone}>{row.operation.badge}</Pill>
            {row.operation.client == null ? null : (
              <span className="cell-sub">{row.operation.client}</span>
            )}
          </>
        ),
    },
    {
      key: 'crew',
      header: 'PIC · dual',
      cellClass: 'cell-strong',
      render: (row) => (
        <>
          {row.crew.pic}
          <span className="cell-sub">{row.crew.sub}</span>
        </>
      ),
    },
    { key: 'block', header: 'Blok', align: 'num', render: (row) => row.block },
    { key: 'flight', header: 'Czas lotu', align: 'num', render: (row) => row.flight },
    { key: 'flights', header: 'Loty', align: 'num', render: (row) => row.flights },
    {
      key: 'mh',
      header: 'MH start → koniec',
      align: 'num',
      render: (row) => (
        <>
          {row.mh.text}
          <span className="cell-sub">{row.mh.sub}</span>
        </>
      ),
    },
    { key: 'fuel', header: 'FOB start → koniec', align: 'num', render: (row) => row.fuel },
    {
      key: 'state',
      header: 'Stan',
      render: (row) => (
        <>
          <Pill tone={row.state.tone} dot={row.state.dot}>
            {row.state.text}
          </Pill>
          {row.state.sub == null ? null : <span className="cell-sub">{row.state.sub}</span>}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="row-actions">
          <LinkButton to={row.href} variant="ghost" size="sm">
            Szczegóły
          </LinkButton>
        </div>
      ),
    },
  ];
}
