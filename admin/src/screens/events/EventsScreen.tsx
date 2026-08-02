/**
 * UZ Aero — panel: REJESTR ZDARZEŃ (`design/admin/A04-zdarzenia.html`).
 *
 * Wszystkie inne ekrany panelu pokazują PROJEKCJE. Ten jeden pokazuje surowy fakt,
 * z którego projekcje powstały — i sięga się po niego wtedy, gdy liczby się nie
 * zgadzają: „skąd wzięła się ta wartość", „co dokładnie przyszło z telefonu", „czy to
 * zdarzenie w ogóle dotarło". Z tego wynika reguła nadrzędna ekranu: **pokazuje to,
 * co przyszło, bez interpretacji** — nieznany typ, nieznany kształt payloadu, brak
 * fixa GPS i konto, którego już nie ma, mają się wyświetlić dosłownie i nic z tego
 * nie ma prawa wywrócić widoku.
 *
 * Ekran jest `.tsx` BEZ arytmetyki i bez decyzji o treści: każdy napis, plakietka,
 * ton i wcięcie w wypisie JSON-a pochodzą z czystych modułów obok (`eventCatalog`,
 * `eventsFilters`, `eventsRows`, `eventsPages`, `eventsTiles`, `eventPayload`),
 * które mają testy w Node.
 *
 * ══ CZEGO TEN EKRAN ŚWIADOMIE NIE POKAZUJE ══
 *  1. **Licznika duplikatów** z kafla „Przyjęte / duplikaty". Serwer go nie ma i mieć
 *     nie może: `POST /events` odsiewa duplikaty przez `ON CONFLICT DO NOTHING`,
 *     a liczba wraca wyłącznie do telefonu w odpowiedzi synca. Kafel zostaje z kreską
 *     i mówi dlaczego — brak nazwany jest lepszy niż brak ukryty.
 *  2. **Eksportu CSV.** Trasy nie ma; przycisk jest zablokowany z podanym powodem,
 *     a nie usunięty, bo mockup go obiecuje.
 *  3. **Wyszukiwania po fragmencie uuid-a.** Trasa dopasowuje uuid DOKŁADNIE (indeks
 *     po kluczu głównym); dopasowanie prefiksem byłoby pełnym skanowaniem najszybciej
 *     rosnącej tabeli w systemie. Podpowiedź pola mówi to wprost.
 * Wszystkie trzy są opisane na ekranie, nie przemilczane.
 *
 * ══ ROZWINIĘCIE, NIE SZUFLADA ══
 * Payload otwiera się DOKŁADNIE pod swoim wierszem (`DataTable.expanded`), a nie
 * w szufladzie z boku jak na `A03a`: przy dochodzeniu porównuje się sąsiednie
 * zdarzenia, a szuflada zasłania listę. Wybrany wiersz ma własny adres
 * (`#/zdarzenia/<uuid>`), więc rozwinięcie da się wkleić w zgłoszeniu.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useSessionState } from '../../auth/sessionContext';
import { can, denialReason } from '../../auth/can';
import { useEvents } from '../../queries/useEvents';
import { useFleet } from '../../queries/useFleet';
import { usePilots } from '../../queries/usePilots';
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
  PayloadView,
  Pill,
  SearchInput,
  Tile,
  TileGrid,
  type Column,
} from '../../ui/components';
import { FileIcon, LockIcon } from '../../ui/components/icons';
import { aircraftChips, pickerLabel, pilotChips } from '../days/daysPickers';
import { EVENT_TYPE_LIST } from './eventCatalog';
import { payloadLines, payloadNote } from './eventPayload';
import {
  eventHref,
  eventsHref,
  eventsListQuery,
  filterFromParams,
  isNarrowed,
  isUuidLookup,
  paramsFromFilter,
  type EventsFilter,
} from './eventsFilters';
import { eventsEmpty, eventsPages, pagesSummary } from './eventsPages';
import { driftSeconds, eventsRows, headerRows, type EventRow } from './eventsRows';
import { eventsTiles } from './eventsTiles';

/** Ile kont pobieramy do słownika chipów — tak samo jak na liście dni. */
const PILOT_DICTIONARY_LIMIT = 200;

export function EventsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { uuid: openUuid } = useParams();
  const navigate = useNavigate();
  const { session } = useSessionState();

  // Zdolnością jest `panel.access`, nie nowa `events.read`: rejestr czytają OBIE role
  // panelu (`ANALIZA.md`), a osobna zdolność nie odrzuciłaby niczego, co przechodzi.
  const allowed = can(session?.capabilities, 'panel.access');
  const mayCorrect = can(session?.capabilities, 'events.correct');
  const filter = filterFromParams(searchParams);

  const page = useEvents(eventsListQuery(filter), allowed);
  const fleet = useFleet({});
  const pilots = usePilots({ limit: PILOT_DICTIONARY_LIMIT });
  const aircraftOptions = aircraftChips(fleet.data?.items ?? []);
  const pilotOptions = pilotChips(pilots.data?.items ?? []);

  // Wpis w wyszukiwarce żyje lokalnie do naciśnięcia Entera: filtrem jest URL, ale
  // przeładowywanie rejestru po każdej literze uuid-a byłoby serią żądań, z których
  // żadne nie ma sensu — trasa dopasowuje identyfikator DOKŁADNIE, nie prefiksem.
  const [uuidDraft, setUuidDraft] = useState(filter.uuid ?? '');
  useEffect(() => {
    setUuidDraft(filter.uuid ?? '');
  }, [filter.uuid]);

  if (!allowed) {
    return (
      <NoAccess
        icon={<LockIcon size={22} />}
        title="REJESTR ZDARZEŃ"
        reason={denialReason('panel.access')}
        note={
          <>
            Rejestr surowych zdarzeń czyta każde konto z dostępem do panelu — administrator
            i szef wyszkolenia. Ta pozycja nawigacji zostaje <b>widoczna</b> właśnie po to,
            żebyś nie musiał zgadywać, czy funkcji nie ma w produkcie, czy nie ma jej Twoje
            konto.
          </>
        }
      />
    );
  }

  const apply = (next: EventsFilter): void => setSearchParams(paramsFromFilter(next));
  /** Ten sam klik otwiera i zamyka rozwinięcie — wzorzec z monitora eksportu. */
  const toggle = (uuid: string): void => {
    navigate(uuid === openUuid ? eventsHref(filter) : `/zdarzenia/${uuid}${search(filter)}`);
  };

  const pages = eventsPages(page.data);
  const threshold = pages.counts?.driftThresholdMs ?? null;
  const rows = eventsRows(pages.items, threshold);
  const empty = eventsEmpty({
    narrowed: isNarrowed(filter),
    uuidLookup: isUuidLookup(filter),
    uuid: filter.uuid,
  });

  return (
    <>
      <PageHead
        title="REJESTR ZDARZEŃ"
        sub={
          <>
            Surowy strumień z tabeli <code>events</code> — dokładnie to, co przysłały telefony,
            bez projekcji i bez upiększania. Ekran do dochodzenia „dlaczego liczby wyglądają
            tak, a nie inaczej"; rozliczenie dnia jest na <b>karcie dnia</b>, a raport
            w statystykach.
          </>
        }
        actions={
          <LinkButton
            to=""
            variant="ghost"
            disabled
            reason="serwer nie wystawia trasy eksportu rejestru"
          >
            Eksport CSV
          </LinkButton>
        }
      />

      <Banner tone="status">
        <b>Widok tylko do odczytu — rejestr jest append-only.</b> Nie ma tu „edytuj wiersz"
        ani kosza i nie będzie: zdarzenie raz przyjęte zostaje w bazie na zawsze. W całym{' '}
        <code>server/src</code> nie występuje ani jedno <code>UPDATE events</code> ani{' '}
        <code>DELETE FROM events</code> — pilnuje tego test architektury. Jedyna droga zmiany
        to dopisanie <code>event_correction</code> (<code>retime</code> / <code>void</code>)
        z karty dnia; sama korekta też jest tu widoczna jako zwykły wiersz.
      </Banner>

      <TileGrid>
        {eventsTiles(pages.counts, isNarrowed(filter)).map((tile) => (
          <Tile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            tone={tile.tone ?? undefined}
            note={tile.note}
          />
        ))}
      </TileGrid>

      <FilterBar>
        <SearchInput
          value={uuidDraft}
          ariaLabel="Filtruj po uuid zdarzenia"
          placeholder="uuid zdarzenia — pełny, Enter filtruje"
          onChange={setUuidDraft}
          onSubmit={() =>
            apply({ ...filter, uuid: uuidDraft.trim() === '' ? null : uuidDraft.trim() })
          }
        />
        {filter.sessionUuid == null ? null : (
          <FilterChip
            label={`sesja: ${filter.sessionUuid} · zdejmij`}
            active
            title="Wszystkie surowe zdarzenia jednego dnia lotnego."
            onClick={() => apply({ ...filter, sessionUuid: null })}
          />
        )}
        {filter.sourceDevice == null ? null : (
          <FilterChip
            label={`urządzenie: ${filter.sourceDevice} · zdejmij`}
            active
            title="Dokładna wartość kolumny source_device — czym zdarzenie przyszło."
            onClick={() => apply({ ...filter, sourceDevice: null })}
          />
        )}
        {filter.from == null && filter.to == null ? null : (
          <FilterChip
            label={`${filter.from ?? '…'} → ${filter.to ?? '…'} · zdejmij`}
            active
            title="Zakres dat UTC z adresu — po czasie PRZYJĘCIA przez serwer."
            onClick={() => apply({ ...filter, from: null, to: null })}
          />
        )}
        <span className="list-spacer">
          <Pill tone="blue" dot>
            Wszystkie czasy UTC
          </Pill>
          {threshold == null ? null : (
            <Pill tone="amber">próg CLOCK_DRIFT: {driftSeconds(threshold)}</Pill>
          )}
          <Pill tone="dim">{page.isPending ? 'wczytywanie' : pagesSummary(pages)}</Pill>
        </span>
      </FilterBar>

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
        {filter.aircraftId != null && !aircraftOptions.some((c) => c.id === filter.aircraftId) ? (
          <FilterChip
            label={`${pickerLabel(aircraftOptions, filter.aircraftId)} · zdejmij`}
            active
            tone="amber"
            title="Jednostka spoza słownika — zawężenie z adresu."
            onClick={() => apply({ ...filter, aircraftId: null })}
          />
        ) : null}
      </FilterBar>

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
        {filter.pilotId != null && !pilotOptions.some((c) => c.id === filter.pilotId) ? (
          <FilterChip
            label={`${pickerLabel(pilotOptions, filter.pilotId)} · zdejmij`}
            active
            tone="amber"
            title="Konto spoza słownika — zawężenie z adresu."
            onClick={() => apply({ ...filter, pilotId: null })}
          />
        ) : null}
      </FilterBar>

      <FilterBar>
        <FilterChip
          label="Wszystkie typy"
          active={filter.type == null}
          onClick={() => apply({ ...filter, type: null })}
        />
        {EVENT_TYPE_LIST.map((type) => (
          <FilterChip
            key={type}
            label={type}
            active={filter.type === type}
            title="Filtruje się WYŁĄCZNIE po typach z katalogu domeny; rejestr pokazuje także te spoza."
            onClick={() => apply({ ...filter, type })}
          />
        ))}
      </FilterBar>

      {page.isPending ? null : page.isError ? (
        <Banner tone="danger" live>
          <b>Nie udało się pobrać rejestru.</b> Panel działa wyłącznie online — to jedyne
          miejsce w systemie, w którym brak sieci wolno pokazać jako blokadę.{' '}
          <Button variant="ghost" size="sm" onClick={() => void page.refetch()}>
            Ponów
          </Button>
        </Banner>
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <EmptyState
            icon={<FileIcon size={22} />}
            title={empty.title}
            note={empty.note}
            action={
              empty.sessionRetryUuid == null ? null : (
                <LinkButton
                  to={eventsHref({
                    ...filter,
                    uuid: null,
                    sessionUuid: empty.sessionRetryUuid,
                  })}
                  variant="ghost"
                >
                  Poszukaj tego identyfikatora jako sesji
                </LinkButton>
              )
            }
          />
        </div>
      ) : (
        <>
          <DataTable
            caption="Rejestr zdarzeń — porządek serwera po czasie przyjęcia, czasy UTC"
            columns={columns(filter, apply, openUuid ?? null, toggle, mayCorrect)}
            rows={rows}
            rowKey={(row) => row.uuid}
            onRowClick={(row) => toggle(row.uuid)}
            rowClass={(row) =>
              [row.voided ? 'voided' : null, row.uuid === openUuid ? 'opened' : null]
                .filter((c) => c != null)
                .join(' ') || undefined
            }
            expanded={(row) =>
              row.uuid !== openUuid ? null : (
                <Detail row={row} entry={entryOf(pages.items, row.uuid)} threshold={threshold} />
              )
            }
          />

          {/* Wklejony link do zdarzenia, które wypadło z bieżącego zawężenia. Bez tego
              adres wyglądałby na działający, a rozwinięcia po prostu by nie było —
              czyli ekran milczałby dokładnie tam, gdzie ma odpowiadać. */}
          {openUuid == null || rows.some((row) => row.uuid === openUuid) ? null : (
            <Banner tone="warn">
              <b>Tego zdarzenia nie ma na pobranych stronach.</b> Adres wskazuje{' '}
              <code>{openUuid}</code>, ale bieżące zawężenie go nie obejmuje — albo leży
              dalej niż dociągnięte strony.{' '}
              <LinkButton to={eventHref(openUuid)} variant="ghost" size="sm">
                Pokaż wyłącznie to zdarzenie
              </LinkButton>
            </Banner>
          )}

          <div className="list-foot">
            <span className="hint">
              {pagesSummary(pages)}{' '}
              {pages.hasMore ? (
                <>
                  Kolejne zdarzenia dokłada <b>kursor keyset</b>, nie <code>OFFSET</code> —
                  rejestr rośnie w trakcie przeglądania, bo telefony właśnie dosyłają
                  outboxy, a offset na rosnącej tabeli gubi wiersze i dubluje inne.
                </>
              ) : (
                <>To wszystko, co spełnia bieżące zawężenie.</>
              )}
            </span>
            {pages.hasMore ? (
              <Button
                variant="ghost"
                disabled={page.isFetchingNextPage}
                onClick={() => void page.fetchNextPage()}
              >
                {page.isFetchingNextPage ? 'Wczytywanie…' : 'Pokaż starsze zdarzenia'}
              </Button>
            ) : null}
          </div>
        </>
      )}

      <Banner tone="warn">
        <b>Zakres dat idzie po czasie PRZYJĘCIA, nie po czasie zdarzenia.</b> Po tej samej
        kolumnie (<code>received_at</code>) idzie porządek listy i kursor, więc drugi zegar
        w filtrze kazałby stronie i zawężeniu mówić o dwóch różnych osiach czasu. Skutek jest
        realny: lot z 30 lipca wysłany z zaległego outboxu 31 lipca znajdziesz pod{' '}
        <code>?od=2026-07-31</code>. Czas samego zdarzenia stoi w kolumnach{' '}
        <code>device_time</code> i <code>gps_time</code>.
      </Banner>

      <Banner tone="status">
        <b>Czego ten rejestr nie umie wyszukać.</b> Uuid dopasowuje się <b>dokładnie</b> —
        dopasowanie fragmentem byłoby pełnym skanowaniem najszybciej rosnącej tabeli
        w systemie. Nie ma wyszukiwania pełnotekstowego po treści payloadu ani kalendarza;
        zakres ustawia się z adresu (<code>?od=2026-07-30&amp;do=2026-07-31</code>).
        Sortować da się wyłącznie po czasie przyjęcia, bo kursor keyset jedzie po{' '}
        <code>(received_at, uuid)</code>.
      </Banner>
    </>
  );
}

/**
 * Rozwinięcie wiersza: surowy payload po lewej, nagłówek zdarzenia po prawej —
 * dokładnie jak w mockupie.
 *
 * `entry` przychodzi z tej samej listy, z której powstał `row`, więc `null` tu nie
 * powstaje. Obsługujemy go mimo to jednym zdaniem zamiast wykrzyknikiem: wywrócony
 * render rejestru wygląda jak dowód, że zdarzenia nie było. Adres wskazujący zdarzenie
 * spoza pobranych stron rozstrzyga EKRAN, nad stopką listy — tam jest widoczny nawet
 * wtedy, gdy żaden wiersz się nie rozwinął.
 */
function Detail({
  row,
  entry,
  threshold,
}: {
  row: EventRow;
  entry: ReturnType<typeof entryOf>;
  threshold: number | null;
}) {
  if (entry == null) {
    return (
      <Banner tone="warn">
        <b>Brak danych rozwinięcia.</b> Wiersz <code>{row.uuid}</code> jest na liście, ale
        jego treść nie dotarła do rozwinięcia — odśwież stronę.
      </Banner>
    );
  }

  return (
    <Columns>
      <div className="cols-stack">
        <PayloadView lines={payloadLines(entry.payload)} note={payloadNote(entry.payload)} />
        {!row.voided ? null : (
          <Banner tone="warn">
            <b>To zdarzenie jest unieważnione korektą.</b> Wiersz zostaje w rejestrze na
            zawsze — projekcja go nie liczy, ale zapis pozostaje dowodem tego, co przysłał
            telefon. {row.adminCorrected ? 'Korektę zapisał panel.' : 'Korektę zapisał pilot w oknie 24 h.'}
          </Banner>
        )}
        {row.drift.missing ? (
          <Banner tone="warn">
            <b>Brak fixa GPS w chwili zapisu.</b> <code>gps_time = null</code>, więc projekcja
            spadła na <code>device_time</code> — czyli na zegar telefonu, którego nikt nie
            weryfikuje. Różnica zegarów dla tego wiersza <b>nie istnieje</b>; to nie to samo,
            co różnica równa zeru.
          </Banner>
        ) : null}
      </div>

      <Card title="Nagłówek zdarzenia" actions={<Pill tone="dim">tabela events</Pill>}>
        {headerRows(entry, threshold).map((item) => (
          <KeyValue
            key={item.label}
            label={item.label}
            value={item.value}
            unit={item.unit ?? undefined}
            tone={item.tone ?? undefined}
          />
        ))}
      </Card>
    </Columns>
  );
}

/** Wiersz odpowiedzi po uuid — rozwinięcie czyta DTO, a nie zmapowany wiersz tabeli. */
function entryOf(items: ReturnType<typeof eventsPages>['items'], uuid: string) {
  return items.find((item) => item.uuid === uuid);
}

/** Query string bieżącego filtra do doklejenia przy zmianie ścieżki. */
function search(filter: EventsFilter): string {
  const query = new URLSearchParams(paramsFromFilter(filter)).toString();
  return query === '' ? '' : `?${query}`;
}

/**
 * Kolumny rejestru — dokładnie te z `A04-zdarzenia.html`.
 *
 * Sortowanie dostaje WYŁĄCZNIE kolumna czasu przyjęcia, bo tylko po niej serwer umie
 * stronicować kursorem; nagłówek, który po kliknięciu nic nie robi, byłby gorszy od
 * nagłówka bez strzałki.
 */
function columns(
  filter: EventsFilter,
  apply: (next: EventsFilter) => void,
  openUuid: string | null,
  toggle: (uuid: string) => void,
  mayCorrect: boolean,
): Column<EventRow>[] {
  return [
    {
      key: 'received',
      header: 'received_at · UTC',
      cellClass: 'mono',
      sort: {
        direction: filter.sort,
        onToggle: () => apply({ ...filter, sort: filter.sort === 'desc' ? 'asc' : 'desc' }),
      },
      render: (row) => (
        <>
          {row.received.text}
          <span className="cell-sub">{row.received.sub}</span>
        </>
      ),
    },
    {
      key: 'device',
      header: 'device_time',
      align: 'num',
      render: (row) => (
        <span className={row.device.tone == null ? undefined : `clock-val ${row.device.tone}`}>
          {row.device.text}
        </span>
      ),
    },
    {
      key: 'gps',
      header: 'gps_time',
      align: 'num',
      render: (row) => (
        <span className={row.gps.tone == null ? undefined : `clock-val ${row.gps.tone}`}>
          {row.gps.text}
        </span>
      ),
    },
    {
      key: 'drift',
      header: 'Δ zegarów',
      align: 'num',
      render: (row) => (
        <span className={row.drift.tone == null ? undefined : `clock-val ${row.drift.tone}`}>
          {row.drift.text}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'type',
      render: (row) => (
        <>
          <Pill tone={row.type.tone}>{row.type.code}</Pill>
          {row.type.known ? null : <span className="cell-sub">{row.type.label}</span>}
        </>
      ),
    },
    {
      key: 'aircraft',
      header: 'Samolot',
      render: (row) => (
        <>
          <CellLink
            to={eventsHref({ ...filter, aircraftId: null })}
            title="Zdejmij zawężenie po jednostce"
          >
            <span className="reg">{row.aircraft.reg}</span>
          </CellLink>
          {row.aircraft.sub == null ? null : <span className="cell-sub">{row.aircraft.sub}</span>}
        </>
      ),
    },
    {
      key: 'pilot',
      header: 'Pilot',
      cellClass: 'cell-strong',
      render: (row) => (
        <>
          {row.pilot.name}
          <span className="cell-sub">{row.pilot.sub}</span>
        </>
      ),
    },
    {
      key: 'session',
      header: 'Dzień lotny',
      cellClass: 'mono',
      render: (row) => (
        <CellLink to={`/dni/${row.sessionUuid}`} title="Karta dnia, do którego należy zdarzenie">
          {row.shortSession}
        </CellLink>
      ),
    },
    {
      key: 'source',
      header: 'source_device',
      cellClass: 'mono dim',
      render: (row) => (
        <>
          {row.sourceDevice.text}
          {row.sourceDevice.fromPanel ? <span className="cell-sub">korekta z panelu</span> : null}
        </>
      ),
    },
    { key: 'schema', header: 'v', align: 'num', render: (row) => row.schemaVersion },
    {
      key: 'uuid',
      header: 'uuid',
      cellClass: 'mono',
      render: (row) => (
        <CellLink to={eventsHref({ ...filter, uuid: row.uuid })} title={row.uuid}>
          {row.short}
        </CellLink>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="row-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={(clicked) => {
              // Wiersz jest klikalny (otwiera rozwinięcie), więc bez tego kliknięcie
              // w przycisk wywołałoby akcję DWA razy i rozwinięcie zamknęłoby się
              // natychmiast po otwarciu.
              clicked.stopPropagation();
              toggle(row.uuid);
            }}
          >
            {row.uuid === openUuid ? 'Zwiń ▲' : 'Rozwiń ▾'}
          </Button>
          <LinkButton
            to={`/dni/${row.sessionUuid}/korekta/${row.uuid}`}
            variant="ghost"
            size="sm"
            disabled={!mayCorrect || !row.correctable}
            reason={
              !mayCorrect
                ? denialReason('events.correct')
                : !row.correctable
                  ? 'tego typu zdarzenia domena nie pozwala korygować'
                  : undefined
            }
          >
            Popraw
          </LinkButton>
        </div>
      ),
    },
  ];
}
