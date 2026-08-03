/**
 * UZ Aero — panel: LISTA DNI LOTNYCH (`design/admin/A02-dni.html`).
 *
 * Jeden wiersz = jedna sesja (`session_claim` → `day_close`). Wszystkie liczby są
 * projekcją `projectSession` przepisaną przez serwer — panel je FORMATUJE i niczego
 * nie przelicza.
 *
 * Ekran jest `.tsx` BEZ arytmetyki i bez decyzji o treści: każdy napis, plakietka
 * i podpis pochodzą z czystych modułów obok (`daysRows`, `daysFilters`, `daysPages`,
 * `operations`), które mają testy w Node. Tutaj zostaje układ i spięcie danych
 * z komponentami.
 *
 * ══ CZEGO TEN EKRAN ŚWIADOMIE NIE POKAZUJE ══
 *  1. **Plakietki „W locie"** — wymaga wiedzy, czy silnik pracuje; projekcja jej nie
 *     niesie, a lista celowo nie woła `projectSession` (§7.1 architektury serwera).
 *  2. **Kalendarza** — trasa filtruje po dniach (`?od=`/`?do=`), ale komponentu wyboru
 *     dat panel jeszcze nie ma; zakres przychodzi z adresu i daje się z niego zdjąć.
 *  3. **Eksportu CSV** z nagłówka mockupu — nie ma trasy, która by go budował.
 * Wszystkie trzy są opisane na ekranie, a nie przemilczane.
 *
 * ══ CO DOSZŁO 2026-08-01 ══
 * **Filtry po samolocie i po pilocie przestały być martwe.** Serwer miał je od pierwszej
 * wersji listy (`SessionListFilter.aircraftId`, `.pilotId`), ale panel nie miał skąd
 * wziąć nazw — jedyną drogą było ręczne sklejenie adresu. Oba słowniki dostarczają
 * teraz `GET /admin/api/fleet` (`A07`) i `GET /admin/api/pilots` (`A06`), a chipy
 * składa czysty `daysPickers.ts`. Chip niesie IDENTYFIKATOR do trasy — skład listy
 * ustala serwer, panel dokłada wyłącznie etykietę.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useFleet } from '../../queries/useFleet';
import { usePilots } from '../../queries/usePilots';
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
  DEFAULT_DAYS_FILTER,
  filterFromParams,
  isNarrowed,
  paramsFromFilter,
  sessionCountQuery,
  sessionListQuery,
  type DaysFilter,
  type StateFilter,
} from './daysFilters';
import { dayPages, daysEmpty, pagesSummary } from './daysPages';
import { aircraftChips, pickerLabel, pilotChips } from './daysPickers';
import { dayRows, type DayRow } from './daysRows';
import { daysTiles } from './daysTiles';
import { OPERATION_META, OPERATION_ORDER } from './operations';

export function DaysScreen() {
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

  // Słowniki filtrów. Obie listy są KOMPLETNE i bez kursora, właśnie po to, żeby dało
  // się z nich zbudować chipy — dlatego trasy floty i kont mają taki kształt. Cache
  // TanStacka dzieli je z ekranami `A06`/`A07`, więc przejście między listami nie
  // pobiera ich drugi raz.
  const fleet = useFleet({});
  const pilots = usePilots({ limit: PILOT_DICTIONARY_LIMIT });
  const aircraftOptions = aircraftChips(fleet.data?.items ?? []);
  const pilotOptions = pilotChips(pilots.data?.items ?? []);

  // Wpis w wyszukiwarce żyje lokalnie do naciśnięcia Entera: filtrem jest URL, ale
  // przeładowywanie listy po każdej literze rejestracji byłoby serią żądań, z których
  // żadne nie ma sensu — trasa dopasowuje identyfikator DOKŁADNIE, nie prefiksem.
  const [aircraftDraft, setAircraftDraft] = useState(filter.aircraftId ?? '');
  useEffect(() => {
    setAircraftDraft(filter.aircraftId ?? '');
  }, [filter.aircraftId]);

  const apply = (next: DaysFilter): void => setSearchParams(paramsFromFilter(next));

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
        {daysTiles(
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
      </FilterBar>

      {/* Rząd samolotów 1:1 z mockupu A02. Chip niesie IDENTYFIKATOR do trasy — panel
          nie odsiewa wierszy sam, dokłada wyłącznie etykietę, bo `?samolot=ac_7b21…`
          da się wkleić, ale nie da się przeczytać. */}
      <FilterBar>
        {aircraftOptions.map((chip) => (
          <FilterChip
            key={chip.id ?? 'all'}
            label={chip.label}
            active={filter.aircraftId === chip.id}
            title={chip.title}
            onClick={() => apply({ ...filter, aircraftId: chip.id })}
          />
        ))}
        {filter.aircraftId != null &&
        !aircraftOptions.some((chip) => chip.id === filter.aircraftId) ? (
          // Adres wskazuje jednostkę spoza słownika (wklejony link, samolot usunięty
          // z rejestru). Pokazujemy surowy identyfikator zamiast udawać, że filtra nie
          // ma — inaczej lista byłaby zawężona bez widocznego powodu.
          <FilterChip
            label={`${pickerLabel(aircraftOptions, filter.aircraftId)} · zdejmij`}
            active
            title="Ta jednostka nie jest w rejestrze floty — zawężenie pochodzi z adresu."
            onClick={() => apply({ ...filter, aircraftId: null })}
          />
        ) : null}
      </FilterBar>

      {/* Rząd pilotów — mockup A02 zapowiada ten filtr w wyszukiwarce („Pilot,
          rejestracja albo session_uuid…"), ale trasa dopasowuje DOKŁADNY identyfikator,
          nie frazę. Chipy ze słownika kont są tym, co panel może obiecać uczciwie:
          każdy z nich na pewno coś zawęża, a wyszukiwanie po nazwisku wymagałoby
          filtra tekstowego, którego serwer nie ma. */}
      <FilterBar>
        {pilotOptions.map((chip) => (
          <FilterChip
            key={chip.id ?? 'all'}
            label={chip.label}
            active={filter.pilotId === chip.id}
            title={chip.title}
            onClick={() => apply({ ...filter, pilotId: chip.id })}
          />
        ))}
        {filter.pilotId != null && !pilotOptions.some((chip) => chip.id === filter.pilotId) ? (
          <FilterChip
            label={`${pickerLabel(pilotOptions, filter.pilotId)} · zdejmij`}
            active
            title="Tego konta nie ma w słowniku — zawężenie pochodzi z adresu."
            onClick={() => apply({ ...filter, pilotId: null })}
          />
        ) : null}
        <span className="list-spacer">
          <Pill tone="dim">dopasowuje PIC-a albo Duala</Pill>
        </span>
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
            title={daysEmpty(isNarrowed(filter)).title}
            note={daysEmpty(isNarrowed(filter)).note}
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
        wyszukiwania tekstowego po nazwisku pilota i po <code>session_uuid</code>, a sortować da
        się wyłącznie po dniu — kursor keyset jedzie po <code>claim_time</code>. Zakres dat
        ustawia się więc z adresu (<code>?od=2026-07-25&amp;do=2026-07-31</code>), bo kalendarza
        panel jeszcze nie ma. <b>Filtry po samolocie i po pilocie już działają</b> — chipy wyżej
        biorą słowniki z <code>GET /admin/api/fleet</code> i <code>GET /admin/api/pilots</code>,
        a zawężenie robi serwer. Plakietki „W locie" nie ma z innego powodu i to nie jest brak
        w API: projekcja niesie <code>status</code>, nie niesie „silnik pracuje", a to jest
        decyzja o kształcie projekcji, nie o panelu.
      </Banner>
    </>
  );
}

/**
 * Ile kont pobieramy jako SŁOWNIK do chipów pilotów.
 *
 * Trasa kont nie ma kursora i domyślnie oddaje 200 wierszy — tyle wystarczy klubowi
 * z zapasem, a liczba stoi tu jawnie, żeby nie brać jej z domyślnej wartości serwera:
 * słownik obcięty po cichu dałby filtr, w którym brakuje kilku pilotów i nikt nie wie
 * dlaczego.
 */
const PILOT_DICTIONARY_LIMIT = 200;

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
function columns(filter: DaysFilter, apply: (next: DaysFilter) => void): Column<DayRow>[] {
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
