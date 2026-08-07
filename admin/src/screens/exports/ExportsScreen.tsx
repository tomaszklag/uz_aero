/**
 * UZ Aero — panel: MONITOR EKSPORTU KART DZIENNYCH (`design/admin/A05-eksporty.html`).
 *
 * Odpowiada na jedno pytanie: czy każdy dzień lotny ma aktualny arkusz — a jeśli nie,
 * dlaczego. Ekran istnieje, bo §4.7 mówi, że **karta jest SKUTKIEM, nie warunkiem**:
 * telefon dostaje 200, zanim karta powstanie, więc nieudany eksport niczego pilotowi nie
 * cofa i nie zgłasza się sam. To jedyne miejsce, w którym widać, że arkusz i rejestr
 * się rozjechały.
 *
 * Ekran jest `.tsx` BEZ arytmetyki i bez decyzji o treści: każdy napis, plakietka
 * i podpis pochodzą z czystych modułów obok (`exportsFilters`, `exportsRows`,
 * `exportsStates`, `exportsTiles`, `exportsHistory`, `exportsSheet`), które mają
 * testy w Node.
 *
 * ══ CZEGO TEN EKRAN ŚWIADOMIE NIE POKAZUJE ══
 *  1. **Kolejki ponowień z licznikiem prób i treścią błędu** („próba 3/6 · następna
 *     14:38 · `sheets_write_timeout`" z mockupu). Nieudany eksport NIE zostawia śladu
 *     w żadnej tabeli: wiersz `export_log` powstaje dopiero po udanym zapisie karty, bo
 *     odwrotna kolejność pokazywałaby na ekranie 11 telefonu link do arkusza, którego
 *     nie ma. Tabeli kolejki system nie ma, a jej dołożenie to decyzja z `A11`, nie
 *     pole do wypełnienia. Widać za to SKUTEK tych awarii: dzień w stanie „Brak karty".
 *  2. **„Zdrowia eksportu" z medianą opóźnienia.** Wymagałoby różnicy między przyjęciem
 *     `day_close` a wysyłką, a `sessions` nie ma stempla SERWEROWEGO przyjęcia —
 *     `close_time` jest czasem z telefonu i bywa starszy o dobę bez zasięgu. Liczba
 *     nazywałaby się „opóźnieniem eksportu", a mierzyłaby długość ciszy telefonu.
 *  3. **Stanu „karta nieaktualna".** Wymagałby porównania stempla eksportu ze stemplem
 *     projekcji, a te pochodzą z dwóch różnych zegarów. Mockup tego stanu zresztą nie ma.
 * Wszystkie trzy są opisane NA EKRANIE, nie przemilczane.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { can, denialReason } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { useExportHistory, useExports, useSheetPreview } from '../../queries/useExports';
import { useRetryExport } from '../../queries/useRetryExport';
import {
  Banner,
  Button,
  Card,
  CellLink,
  Columns,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  KeyValue,
  LinkButton,
  NoAccess,
  PageHead,
  Pill,
  SearchInput,
  Tile,
  TileGrid,
  Timeline,
  TimelineRow,
  type Column,
} from '../../ui/components';
import { ExportIcon, LockIcon } from '../../ui/components/icons';
import {
  exportsHref,
  exportListQuery,
  filterFromParams,
  isNarrowed,
  paramsFromFilter,
  type ExportsFilter,
} from './exportsFilters';
import {
  currentRevisionLabel,
  historySummary,
  overwrittenNotice as historyOverwrittenNotice,
  revisionEntries,
} from './exportsHistory';
import { shortUuid } from '../flags/flagRows';
import { exportRows, narrowToScope, type ExportRow } from './exportsRows';
import { sheetLines, sheetWidth } from './exportsSheet';
import { retryLabel, retryMessage } from './exportsStates';
import {
  exportsEmpty,
  exportChips,
  exportTiles,
  overwrittenNotice,
  truncationNotice,
} from './exportsTiles';

export function ExportsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { sessionUuid } = useParams<{ sessionUuid?: string }>();
  const navigate = useNavigate();
  const { session } = useSessionState();

  const allowed = can(session?.capabilities, 'panel.access');
  const mayRetry = can(session?.capabilities, 'fleet.manage');
  const filter = filterFromParams(searchParams);

  const page = useExports(exportListQuery(filter), allowed);
  const selected = sessionUuid ?? null;
  const history = useExportHistory(allowed ? selected : null);
  const preview = useSheetPreview(allowed ? selected : null);
  const retry = useRetryExport();

  // Wpis w wyszukiwarce żyje lokalnie do naciśnięcia Entera: filtrem jest URL, ale
  // przeładowywanie listy po każdej literze uuid-a byłoby serią żądań, z których żadne
  // nie ma sensu.
  const [searchDraft, setSearchDraft] = useState(filter.search ?? '');
  useEffect(() => {
    setSearchDraft(filter.search ?? '');
  }, [filter.search]);

  // Wynik ostatniego ponowienia PRZESTAJE opisywać to, co widać, gdy zmieni się
  // zawężenie albo zaznaczony wiersz: baner „Karta … zregenerowana" wisiał wtedy nad
  // tabelą, w której tej karty już nie ma. `retry.reset()` czyści go razem z listą.
  const queryKey = searchParams.toString();
  const resetRetry = retry.reset;
  useEffect(() => {
    resetRetry();
  }, [queryKey, sessionUuid, resetRetry]);

  if (!allowed) {
    return (
      <NoAccess
        icon={<LockIcon size={22} />}
        title="EKSPORT KART DZIENNYCH"
        reason={denialReason('panel.access')}
        note={
          <>
            Monitor eksportu czyta każdy, kto ma wejście do panelu. Ta pozycja nawigacji
            zostaje <b>widoczna</b> właśnie po to, żebyś nie musiał zgadywać, czy funkcji nie
            ma w produkcie, czy nie ma jej Twoje konto.
          </>
        }
      />
    );
  }

  const apply = (next: ExportsFilter): void => setSearchParams(paramsFromFilter(next));
  // Kliknięcie w wybrany wiersz ZWIJA rozwinięcie: ta sama akcja otwiera i zamyka,
  // bo wiersz jest przełącznikiem widoku, a nie nawigacją w głąb.
  const open = (uuid: string | null): void => {
    void navigate(exportsHref(filter, uuid === selected ? null : uuid));
  };

  const counts = page.data?.counts;
  const rows = narrowToScope(
    exportRows(page.data?.items ?? [], Date.now(), (uuid) => exportsHref(filter, uuid)),
    filter.scope,
  );
  const empty = exportsEmpty(isNarrowed(filter));
  const result = retry.data?.retry;
  const message =
    result == null ? null : retryMessage(result.outcome, result.revisionBefore, result.failure);
  // Stan „Ponawiam…" należy do WIERSZA, którego dotyczy: `retry.variables` niesie uuid
  // przekazany do mutacji, więc pozostałe wiersze nie mają czego o sobie twierdzić.
  const retryingUuid = retry.isPending ? (retry.variables ?? null) : null;
  const truncated =
    page.data == null
      ? null
      : truncationNotice({
          shown: page.data.items.length,
          matched: page.data.matched,
          truncated: page.data.truncated,
        });
  const overwritten = overwrittenNotice(counts);
  const previewWarning = history.data == null ? null : historyOverwrittenNotice(history.data);

  return (
    <>
      <PageHead
        title="EKSPORT KART DZIENNYCH"
        sub={
          <>
            Karta jest <b>DOBĄ SAMOLOTU</b> (<code>YYYY-MM-DD_SP-XXX</code>, §4.7), a sesje
            tej maszyny są jej WIERSZAMI — dwie zmiany tego samego dnia trafiają do jednego
            dokumentu, spięte kolumną <code>Sesja</code>. Ta lista pokazuje jednak SESJE, bo
            to one mają stan: pytanie brzmi „której zmiany brakuje w karcie". Eksport jest{' '}
            <b>skutkiem</b> przyjęcia zdarzeń, nigdy warunkiem — telefon dostał 200, zanim
            karta powstała, więc błąd tutaj niczego pilotowi nie cofa. Ten ekran jest jedynym
            miejscem, w którym widać, że arkusz i rejestr się rozjechały.
          </>
        }
        actions={
          <LinkButton to={exportsHref({ ...filter, scope: 'missing' })} variant="ghost">
            Pokaż dni bez karty
          </LinkButton>
        }
      />

      <Banner tone="status">
        <b>Dwie tabele, dwa różne zadania.</b> <code>export_log</code> jest{' '}
        <b>append-only</b>: każda regeneracja dopisuje wiersz z podbitą rewizją i to jedyny
        ślad, którym da się wyjaśnić rozjazd między arkuszem a rejestrem.{' '}
        <code>exported_sheets</code> trzyma wyłącznie treść <b>bieżącą</b> (UPSERT po nazwie
        karty), bo czytelnik linku z ekranu 11 ma widzieć aktualny stan dnia — dokładnie to,
        co zobaczyłby w arkuszu. Gdyby regeneracja nadpisywała wiersz dziennika, nie dałoby
        się już odpowiedzieć na pytanie „co widział skarbnik klubu, kiedy zamykał miesiąc".
      </Banner>

      {counts != null && counts.blocked > 0 ? (
        <Banner tone="danger" live>
          <b>
            {counts.blocked === 1
              ? 'Jedna sesja wypada z karty doby, dopóki nie zamknie się flagi.'
              : `${counts.blocked} sesje wypadają z kart doby, dopóki nie zamkną się flagi.`}
          </b>{' '}
          <code>dayExporter</code> pomija sesję, dla której otwarta jest flaga{' '}
          <code>aircraft_overlap</code> — §4.7: sporna zmiana nie ma prawa utrwalić się
          w dokumencie klubu. Reszta doby idzie do arkusza z adnotacją „niekompletna",
          więc maszyna nie znika z rejestru przez jedną sporną zmianę. Ponowienie tej
          bramki <b>nie omija</b>.{' '}
          <CellLink to="/flagi" title="Skrzynka flag">
            Skrzynka flag →
          </CellLink>
        </Banner>
      ) : null}

      {overwritten == null ? null : (
        <Banner tone="warn" live>
          <b>Karta nadpisana przez inną sesję tego dnia.</b> {overwritten}
        </Banner>
      )}

      <TileGrid>
        {exportTiles(counts).map((tile) => (
          <Tile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            tone={tile.tone}
            note={tile.note}
          />
        ))}
      </TileGrid>

      <FilterBar>
        <SearchInput
          value={searchDraft}
          ariaLabel="Filtruj po rejestracji albo identyfikatorze sesji"
          placeholder="Szukaj: rejestracja, identyfikator samolotu, UUID sesji — Enter filtruje"
          onChange={setSearchDraft}
          onSubmit={() =>
            apply({ ...filter, search: searchDraft.trim() === '' ? null : searchDraft.trim() })
          }
        />
        {filter.from == null && filter.to == null ? null : (
          <FilterChip
            label={`${filter.from ?? '…'} → ${filter.to ?? '…'} · zdejmij`}
            active
            title="Zakres dat UTC z adresu — panel nie ma jeszcze kalendarza (patrz baner pod tabelą)."
            onClick={() => apply({ ...filter, from: null, to: null })}
          />
        )}
        {filter.aircraftId == null ? null : (
          <FilterChip
            label={`samolot: ${filter.aircraftId} · zdejmij`}
            active
            title="Identyfikator samolotu z rejestru floty. Dopasowanie dokładne."
            onClick={() => apply({ ...filter, aircraftId: null })}
          />
        )}
        <span className="list-spacer">
          <Pill tone="blue" dot>
            Wszystkie czasy UTC
          </Pill>
        </span>
      </FilterBar>

      <FilterBar>
        {exportChips(counts).map((chip) => (
          <FilterChip
            key={chip.scope}
            label={chip.label}
            count={chip.count}
            active={filter.scope === chip.scope}
            title={chip.title}
            onClick={() => apply({ ...filter, scope: chip.scope })}
          />
        ))}
      </FilterBar>

      {message == null ? null : (
        <Banner tone={message.tone}>
          <b>{message.title}</b> {message.body}
        </Banner>
      )}

      {page.isPending ? null : page.isError ? (
        <Banner tone="danger" live>
          <b>Nie udało się pobrać monitora eksportu.</b> Panel działa wyłącznie online — to
          jedyne miejsce w systemie, w którym brak sieci wolno pokazać jako blokadę.{' '}
          <Button variant="ghost" size="sm" onClick={() => void page.refetch()}>
            Ponów
          </Button>
        </Banner>
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <EmptyState icon={<ExportIcon size={22} />} title={empty.title} note={empty.note} />
        </div>
      ) : (
        <>
          <DataTable
            caption="Monitor eksportu kart dziennych — porządek serwera od najnowszego dnia, czasy UTC"
            columns={columns(mayRetry, retryingUuid, (row) => void retry.mutate(row.sessionUuid))}
            rows={rows}
            rowKey={(row) => row.sessionUuid}
            onRowClick={(row) => open(row.sessionUuid)}
            rowClass={(row) =>
              [row.flagged ? 'flagged' : null, row.sessionUuid === selected ? 'opened' : null]
                .filter((c) => c != null)
                .join(' ') || undefined
            }
          />
          {truncated == null ? null : (
            <Banner tone="warn">
              <b>Lista jest przycięta.</b> {truncated}
            </Banner>
          )}
        </>
      )}

      {selected == null ? (
        <Banner tone="status">
          <b>Wybierz wiersz, żeby zobaczyć historię rewizji i treść karty.</b> Rozwinięcie
          otwiera się pod tabelą i ma własny adres (<code>#/eksporty/&lt;uuid&gt;</code>), więc
          da się je wkleić w rozmowie o konkretnym dniu.
        </Banner>
      ) : (
        <Columns>
          <Card
            title={
              <>
                Podgląd karty{' '}
                {preview.data == null ? null : <code className="code-ref">{preview.data.tab}</code>}
              </>
            }
            actions={
              history.data == null ? null : (
                <>
                  <Pill tone="blue">{currentRevisionLabel(history.data)}</Pill>
                  {history.data.overwrittenBy == null ? null : (
                    <Pill tone="amber">treść z innej sesji</Pill>
                  )}
                </>
              )
            }
          >
            {/* Ostrzeżenie STOI NAD treścią, a nie pod nią: administrator, który przewinie
                tabelę i zamknie rozwinięcie, ma zobaczyć je zanim uzna liczby za swoje. */}
            {previewWarning == null ? null : (
              <Banner tone="warn" live>
                <b>Podgląd pokazuje kartę INNEJ sesji.</b> {previewWarning}
              </Banner>
            )}
            {preview.isPending ? null : preview.isError || preview.data == null ? (
              <span className="hint">
                <b>Tej karty nie ma w bazie.</b> Dzień jeszcze nie został wyeksportowany albo
                karty nie da się nazwać (sesja bez preflightu). Podgląd czyta{' '}
                <code>exported_sheets</code> — tę samą treść, którą telefon dostaje linkiem
                z ekranu 11.
              </span>
            ) : (
              <SheetTable tab={preview.data.tab} rows={preview.data.rows} />
            )}
          </Card>

          <div className="cols-stack">
            <Card
              title="Historia rewizji"
              actions={
                history.data == null ? null : (
                  <>
                    <Pill tone="dim">{historySummary(history.data).logLabel}</Pill>
                    <Pill tone="dim">{historySummary(history.data).sheetLabel}</Pill>
                  </>
                )
              }
            >
              {history.isPending ? null : history.isError || history.data == null ? (
                <span className="hint">Nie udało się pobrać historii tej karty.</span>
              ) : (
                <>
                  {history.data.revisions.length === 0 ? (
                    <KeyValue label="Wysyłki" value="—" tone="red" unit="karta nigdy nie poszła" />
                  ) : (
                    <Timeline>
                      {revisionEntries(history.data.revisions).map((entry) => (
                        <TimelineRow
                          key={entry.key}
                          time={entry.time}
                          tone={entry.tone}
                          name={entry.name}
                          meta={entry.meta}
                          badge={<Pill tone="dim">{entry.badge}</Pill>}
                        />
                      ))}
                    </Timeline>
                  )}
                  <span className="hint">{historySummary(history.data).note}</span>
                </>
              )}
            </Card>

            <Card title="Czego tu nie ma i dlaczego">
              <KeyValue label="Kolejka ponowień" value="nie istnieje" tone="red" />
              <KeyValue label="Licznik prób" value="nie istnieje" tone="red" />
              <KeyValue label="Treść błędu eksportu" value="nie jest zapisywana" tone="red" />
              <KeyValue label="Mediana opóźnienia" value="nie do policzenia" tone="amber" />
              <span className="hint">
                <b>Nieudanej próby nie ma w <code>export_log</code>.</b> Dziennik dostaje wiersz
                dopiero po udanym zapisie karty — odwrotna kolejność pokazywałaby na ekranie 11
                telefonu link do arkusza, którego nie ma. Historia porażek nie żyje więc nigdzie:
                widać wyłącznie ich SKUTEK, czyli dzień w stanie „Brak karty", i wynik
                pojedynczego ponowienia zaraz po kliknięciu. Kolejka z backoffem to osobna
                decyzja (<code className="code-ref">A11-konserwacja.html</code>), nie pole
                do wypełnienia.
              </span>
              <span className="hint">
                <b>Opóźnienia eksportu też nie policzymy.</b> Wymagałoby stempla przyjęcia{' '}
                <code>day_close</code> po stronie serwera, a projekcja niesie czas z telefonu —
                telefon bez zasięgu zapisuje zamknięcie o 18:00, a serwer widzi je o 22:00.
                Liczba nazywałaby się „opóźnieniem eksportu", a mierzyła długość ciszy telefonu.
              </span>
            </Card>
          </div>
        </Columns>
      )}

      <Banner tone="status">
        <b>Czym różni się ponowienie od naprawy.</b> „Ponów" powtarza dokładnie tę samą
        operację, którą wykonuje automat po przyjęciu zdarzeń — <b>nie omija żadnej bramki</b>.
        Doba, w której nikt jeszcze nie zdał samolotu, sesja bez <code>session_claim</code>{' '}
        i otwarta flaga <code>aircraft_overlap</code> odmówią tak samo. Jeśli karta ma powstać, najpierw musi
        zniknąć powód; przycisk służy do sytuacji, w której powodu już nie ma, a eksport nie
        wrócił sam. Każde kliknięcie trafia do{' '}
        <CellLink to="/audyt?typ=sheet" title="Dziennik audytu — akcje na kartach arkusza">
          dziennika audytu
        </CellLink>{' '}
        z nazwą karty, rewizją przed i po oraz wynikiem próby.
      </Banner>
    </>
  );
}

/**
 * Karta arkusza jako tabela — DOSŁOWNE komórki dokumentu, bez interpretacji.
 *
 * Wiersze puste z `buildDaySheet` są separatorami sekcji i muszą zostać, bo bez nich
 * karta zlewa się w jeden blok; pusty `<tr>` bez komórek jest w HTML-u niepoprawny,
 * więc separator dostaje jedną komórkę rozciągniętą na całą szerokość.
 */
function SheetTable({ tab, rows }: { tab: string; rows: string[][] }) {
  const width = sheetWidth(rows);
  return (
    <>
      <div className="table-wrap plain">
        <table>
          <caption className="visually-hidden">Dosłowne wiersze karty {tab}</caption>
          <tbody>
            {sheetLines(rows).map((line) =>
              line.spacer ? (
                <tr key={line.key}>
                  <td className="dim" colSpan={width} />
                </tr>
              ) : (
                <tr key={line.key}>
                  {line.cells.map((cell, index) => (
                    <td
                      key={`${line.key}-${index}`}
                      className={index === 0 ? 'cell-strong' : 'mono'}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <span className="hint">
        Karta to <b>dosłowne wiersze dokumentu</b> (<code>rows</code> jako{' '}
        <code>string[][]</code>), nie projekcja do dalszego liczenia — dlatego motogodziny są
        sformatowane wg <code>mh_format</code> samolotu, a nie surową liczbą. Panel niczego
        tu nie interpretuje i nie przelicza.
      </span>
    </>
  );
}

/**
 * Kolumny monitora — dokładnie te z `A05-eksporty.html`.
 *
 * Sortowania nie ma na żadnej kolumnie i to jest świadome: trasa oddaje jeden porządek
 * (po chwili przejęcia, malejąco), więc nagłówek ze strzałką, który po kliknięciu nic nie
 * robi, byłby gorszy od nagłówka bez strzałki. Ta sama decyzja, co na `A09`.
 */
function columns(
  mayRetry: boolean,
  /** Uuid wiersza, którego ponowienie WŁAŚNIE trwa; `null` = żadnego. */
  retryingUuid: string | null,
  onRetry: (row: ExportRow) => void,
): Column<ExportRow>[] {
  return [
    {
      key: 'day',
      header: 'Dzień',
      cellClass: 'mono',
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
          <span className="cell-sub">{row.aircraft.type ?? 'typ nieznany'}</span>
        </>
      ),
    },
    {
      key: 'tab',
      header: 'Karta arkusza',
      cellClass: 'mono',
      render: (row) => (
        <>
          {row.tab.text}
          <span className="cell-sub">{row.tab.sub}</span>
        </>
      ),
    },
    {
      key: 'revision',
      header: 'Rewizja',
      align: 'num',
      render: (row) => (
        <>
          {row.revision.text}
          {row.revision.sub == null ? null : <span className="cell-sub">{row.revision.sub}</span>}
        </>
      ),
    },
    {
      key: 'exportedAt',
      header: 'Ostatni eksport · UTC',
      align: 'num',
      render: (row) => (
        <>
          {row.exportedAt.text}
          {row.exportedAt.sub == null ? null : (
            <span className="cell-sub">{row.exportedAt.sub}</span>
          )}
        </>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      render: (row) => (
        <>
          <Pill tone={row.state.tone} dot={row.state.dot}>
            {row.state.text}
          </Pill>
          {/* Druga plakietka, nie inny stan: dziennik TEGO dnia ma własne rewizje, więc
              „W arkuszu" jest prawdą — nadpisana została TREŚĆ pod nazwą karty. Link
              prowadzi do sesji, która nadpisała, bo bez niego administrator ma nazwę
              karty, dwie sesje i żadnej drogi między nimi. */}
          {row.overwritten == null ? null : (
            <>
              <Pill tone="amber">{row.overwritten.label}</Pill>
              <CellLink
                to={row.overwritten.href}
                title="Sesja, której eksport nadpisał tę kartę"
              >
                {row.overwritten.note}
              </CellLink>
            </>
          )}
          <span className="cell-sub">{row.state.sub}</span>
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="row-actions">
          <LinkButton to={row.dayHref} variant="ghost" size="sm">
            Dzień
          </LinkButton>
          {row.flagHref == null ? null : (
            <LinkButton to={row.flagHref} variant="ghost" size="sm">
              Do flagi
            </LinkButton>
          )}
          {/* Przycisk zostaje WIDOCZNY i wyszarzony z powodem, nigdy ukryty: człowiek
              ma nie zgadywać, czy funkcji nie ma w produkcie, czy nie ma jej w tej
              sytuacji. Serwer i tak odmówi tak samo — to nie jest zabezpieczenie. */}
          {/* Stan zajętości należy do WIERSZA, nie do tabeli. Do 2026-08-01 i napis,
              i wyszarzenie szły z `retry.isPending`, więc jedno kliknięcie kazało
              dwustu wierszom twierdzić, że są ponawiane — a wyszarzało je BEZ POWODU,
              czyli łamało zasadę tego ekranu („widoczny i wyszarzony z powodem, nigdy
              ukryty"): tooltip był pusty, bo `retryReason` tych wierszy jest `null`. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={!mayRetry || !row.canRetry || retryingUuid === row.sessionUuid}
            reason={
              mayRetry
                ? (row.retryReason ?? undefined)
                : 'Wymaga roli: administrator — ponowienie nadpisuje dokument klubu'
            }
            onClick={(clickEvent) => {
              // Wiersz jest klikalny (otwiera rozwinięcie), więc bez tego kliknięcie
              // „Ponów" zmieniałoby przy okazji zaznaczenie — czyli akcja robiłaby
              // dwie rzeczy naraz, z których jednej nikt nie prosił.
              clickEvent.stopPropagation();
              onRetry(row);
            }}
          >
            {retryLabel(retryingUuid === row.sessionUuid)}
          </Button>
        </div>
      ),
    },
    {
      key: 'session',
      header: 'Sesja',
      cellClass: 'mono dim',
      render: (row) => (
        <CellLink to={row.href} title="Historia rewizji i podgląd karty tego dnia">
          {shortUuid(row.sessionUuid)}
        </CellLink>
      ),
    },
  ];
}
