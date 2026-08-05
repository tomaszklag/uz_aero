/**
 * UZ Aero — panel: ANALITYKA ZUŻYCIA
 * (`design/admin/A10a-analityka.html`, wariant `A10b-analityka-brak-danych.html`).
 *
 * ══ KONSTYTUCJA EKRANU ══
 * Wszystkie liczby policzyła domena (`packages/domain/src/consumption/`) i przysłał
 * serwer. Ekran ich NIE LICZY — zamienia je na napisy i geometrię, tak samo jak
 * statystyki zakresu. Jedyne dzielenie, jakie tu jest, to szerokości segmentów wstęgi.
 *
 * ══ ESTYMATA, NIE POMIAR ══
 * Przepływomierza w samolocie nie ma, więc zużycia „w samym wznoszeniu" nikt nigdy nie
 * zmierzył. Każda stawka na tym ekranie jest wnioskiem z regresji i dlatego **stoi razem
 * ze swoim przedziałem ufności** — liczba bez niepewności wyglądałaby jak odczyt
 * przyrządu. Ta sama zasada rządzi bramką publikacji: poniżej progu danych ekran mówi,
 * czego brakuje (`A10b`), zamiast pokazać stawkę „wstępną".
 *
 * ══ DWA WARIANTY, JEDNA TRASA ══
 * `A10a` i `A10b` to ten sam widok w dwóch stanach tych samych danych, nie dwa adresy.
 * O tym, który zobaczy administrator, rozstrzyga `fuel.published` z serwera — panel nie
 * zgaduje przed pobraniem, ile danych ma samolot.
 */

import { Link, useParams, useSearchParams } from 'react-router-dom';

import { useConsumption } from '../../queries/useConsumption';
import {
  Banner,
  Card,
  Columns,
  DataTable,
  EmptyState,
  KeyValue,
  MeterRow,
  PageHead,
  Pill,
  RibbonBar,
  Tile,
  TileGrid,
  type Column,
} from '../../ui/components';
import { ChartIcon } from '../../ui/components/icons';

import { hoursMinutes } from './consumptionFormat';
import {
  consumptionTiles,
  fitQualityLabel,
  mhCards,
  outliersLabel,
  trendAxis,
  counterLabel,
  degradationNote,
  gateView,
  intervalRows,
  mhRows,
  rateCards,
  ribbonSegments,
  type IntervalRowView,
  type MhRowView,
} from './consumptionView';

const INTERVAL_COLUMNS: Column<IntervalRowView>[] = [
  { key: 'day', header: 'Dzień', cellClass: 'mono', render: (row) => row.day },
  {
    key: 'span',
    header: 'Interwał',
    cellClass: 'mono dim',
    render: (row) => row.span,
  },
  {
    key: 'consumed',
    header: 'Zużycie',
    align: 'num',
    render: (row) => (
      <>
        <span className="cell-strong">{row.consumed}</span>
        <span className="cell-sub">{row.reading}</span>
      </>
    ),
  },
  { key: 'engine', header: 'Silnik', align: 'num', render: (row) => row.engine },
  {
    key: 'phases',
    header: 'Ziemia / wzn / przelot / zniż',
    align: 'num',
    render: (row) => row.phases,
  },
  {
    key: 'state',
    header: 'Stan',
    render: (row) => (
      <>
        <Pill tone={row.state === 'ok' ? 'green' : row.state === 'outlier' ? 'amber' : 'dim'}>
          {row.stateLabel}
        </Pill>
        {row.stateNote == null ? null : <span className="cell-sub">{row.stateNote}</span>}
      </>
    ),
  },
  {
    key: 'go',
    header: '',
    render: (row) => (
      <div className="row-actions">
        <Link className="btn sm ghost" to={`/dni/${row.sessionUuid}`}>
          Dzień
        </Link>
      </div>
    ),
  },
];

const MH_COLUMNS: Column<MhRowView>[] = [
  { key: 'day', header: 'Dzień', cellClass: 'mono', render: (row) => row.day },
  { key: 'flight', header: 'Lot', align: 'num', render: (row) => row.flight },
  { key: 'ground', header: 'Ziemia', align: 'num', render: (row) => row.ground },
  {
    key: 'actual',
    header: 'ΔMH fakt',
    align: 'num',
    render: (row) => <span className="cell-strong">{row.actual}</span>,
  },
  { key: 'modelled', header: 'Model', align: 'num', cellClass: 'dim', render: (row) => row.modelled },
  { key: 'residual', header: 'Reszta', align: 'num', cellClass: 'dim', render: (row) => row.residual },
];

export function ConsumptionScreen() {
  const { aircraftId = '' } = useParams();
  const [params] = useSearchParams();

  const from = params.get('od') ?? undefined;
  const to = params.get('do') ?? undefined;

  const { data, isLoading, isError } = useConsumption({ aircraftId, from, to });

  if (isLoading) {
    return (
      <div className="content">
        <PageHead title="Analityka zużycia" sub="Wczytywanie raportu…" />
      </div>
    );
  }

  if (isError || data == null) {
    return (
      <div className="content">
        <PageHead title="Analityka zużycia" sub="Raport nie dotarł." />
        <Card title="Nie udało się pobrać raportu">
          <EmptyState
            icon={<ChartIcon />}
            title="BRAK DANYCH"
            note="Serwer nie oddał raportu dla tej jednostki. Sprawdź, czy samolot istnieje we flocie."
          />
        </Card>
      </div>
    );
  }

  const gate = gateView(data);
  const degradation = degradationNote(data);
  const rates = rateCards(data);
  const segments = ribbonSegments(data);
  const intervals = intervalRows(data);

  return (
    <div className="content">
      <PageHead
        title={`Analityka zużycia · ${data.aircraft.reg}`}
        sub={
          <>
            Skąd biorą się średnie tego samolotu: każdy odczyt paliwomierza (preflight,
            tankowanie, koniec dnia) tnie dzień na <b>interwały o znanym zużyciu</b>,
            a regresja rozdziela je między fazy. Motogodziny analogicznie — jedno równanie
            na każdy zamknięty dzień. Każda liczba klika się w dół: do interwału, dnia
            i zdarzeń źródłowych.
          </>
        }
        actions={
          <Link className="btn ghost" to="/statystyki">
            ← Statystyki zakresu
          </Link>
        }
      />

      <Banner tone="status">
        <span>
          <b>Estymata statystyczna, nie dokumentacja samolotu.</b> Liczby uczą się
          z odczytów pilotów i czasów z rejestru zdarzeń. Służą nadzorowi i prognozom —
          nie zastępują instrukcji użytkowania ani odczytu przyrządów. Liczniki fizyczne
          pozostają źródłem prawdy.
        </span>
      </Banner>

      <TileGrid>
        {consumptionTiles(data).map((tile) => (
          <Tile
            key={tile.key}
            label={tile.label}
            value={tile.value}
            unit={tile.unit}
            tone={tile.tone}
            note={tile.note}
          />
        ))}
      </TileGrid>

      {gate.published ? null : (
        <Banner tone="warn">
          <span>
            <b>Za mało danych na stawki.</b> {gate.message}
          </span>
        </Banner>
      )}

      <Columns even>
        <Card
          title="Paliwo — model fazowy"
          actions={
            <>
              <Pill tone="dim">{`${data.fuel.equations} równań`}</Pill>
              <Pill tone={gate.published ? 'green' : 'amber'}>
                {gate.published ? phaseSetLabel(data.fuel.phaseSet) : 'poniżej progu'}
              </Pill>
            </>
          }
        >
          {gate.published ? (
            <>
              <div className="rate-grid">
                {rates.map((rate) => (
                  <span key={rate.key} className={rate.muted ? 'rate na' : 'rate'}>
                    <span className="rate-phase">
                      <span className={`rate-dot ${rate.tone}`} />
                      {rate.phase}
                    </span>
                    <span className="rate-val">
                      {rate.value}
                      <small>{rate.unit}</small>
                    </span>
                    <span className="rate-ci">{rate.uncertainty}</span>
                  </span>
                ))}
              </div>

              {segments.length === 0 ? null : (
                <RibbonBar
                  label="Podział czasu pracy silnika na fazy"
                  segments={segments.map((segment) => ({
                    key: segment.key,
                    width: segment.width,
                    tone: segment.tone === 'dim' ? 'amber' : segment.tone,
                    label: segment.label,
                  }))}
                />
              )}

              <KeyValue label="σ reszt · R²" value={fitQualityLabel(data)} />
              <KeyValue
                label="Odstające"
                tone={data.fuel.outliers.length > 0 ? 'amber' : undefined}
                value={outliersLabel(data)}
              />
              <KeyValue
                label="Interwały ze śladem GPS"
                value={`${data.fuel.tracedIntervals} / ${data.fuel.gate.intervals}`}
              />
            </>
          ) : (
            <>
              <MeterRow
                name="Interwały"
                width={`${gate.intervalsPercent}%`}
                amber
                label={gate.intervalsLabel}
              />
              <MeterRow
                name="Silnik"
                width={`${gate.enginePercent}%`}
                amber
                label={gate.engineLabel}
              />
              <span className="hint">
                Interwały są widoczne od pierwszego dnia — dowód liczenia zbiera się na
                oczach administratora, a nie pojawia znikąd razem ze stawkami.
              </span>
            </>
          )}

          {degradation == null ? null : <span className="hint">{degradation}</span>}
        </Card>

        <Card
          title="Motogodziny — przelicznik na godzinę zegara"
          actions={
            <Pill tone={data.mh.kind === 'tach' ? 'amber' : data.mh.kind === 'hobbs' ? 'green' : 'dim'}>
              {`licznik ${counterLabel(data.mh.kind)}`}
            </Pill>
          }
        >
          <div className="rate-grid">
            {mhCards(data).map((card) => (
              <span key={card.key} className={card.muted ? 'rate na' : 'rate'}>
                <span className="rate-phase">
                  <span className={`rate-dot ${card.tone}`} />
                  {card.phase}
                </span>
                <span className="rate-val">
                  {card.value}
                  <small>{card.unit}</small>
                </span>
                <span className="rate-ci">{card.uncertainty}</span>
              </span>
            ))}
          </div>

          {data.mh.rows.length === 0 ? (
            <span className="hint">
              Żaden dzień w oknie nie ma pary odczytów licznika — bez nich nie ma równania.
            </span>
          ) : (
            <DataTable
              caption="Przyrost motogodzin: fakt kontra model"
              columns={MH_COLUMNS}
              rows={mhRows(data).slice(0, 6)}
              rowKey={(row) => row.key}
            />
          )}

          <span className="hint">
            Licznik obrotomierzowy zlicza <b>obroty silnika</b> przeliczone na godziny przy
            obrotach znamionowych — dlatego ΔMH dnia nie równa się blokowi i nie ma prawa
            się równać: na ziemi silnik kręci wolniej. Charakter licznika model wykrywa sam
            z danych; przelicznik bliski jedności w obu fazach znaczy licznik godzinowy.
          </span>
        </Card>
      </Columns>

      {data.summary.months.length < 2 ? null : (
        <Card
          title="Średnie spalanie miesiąc po miesiącu · L/h bloku"
          actions={<Pill tone="dim">{`${data.summary.months.length} mies.`}</Pill>}
        >
          <div className="trend-axis">
            {trendAxis(data).map((point) => (
              <span key={point.key}>{point.label}</span>
            ))}
          </div>
          <span className="hint">
            Rosnące spalanie przy niezmienionym profilu operacji to <b>wczesny sygnał
            serwisowy</b>, nie ciekawostka księgowa — dokładnie po to ten wykres tu stoi.
            Wzrost w granicach niepewności jeszcze niczego nie dowodzi.
          </span>
        </Card>
      )}

      <Card
        title="Interwały paliwowe — skąd biorą się liczby"
        actions={<Pill tone="dim">odczyt → odczyt · zawsze w obrębie sesji</Pill>}
      >
        {intervals.length === 0 ? (
          <EmptyState
            icon={<ChartIcon />}
            title="BRAK INTERWAŁÓW W OKNIE"
            note="Interwał powstaje między dwoma odczytami paliwomierza w obrębie jednej sesji. Dzień bez zamknięcia nie ma odczytu końcowego, więc jego zużycia nie znamy."
          />
        ) : (
          <DataTable
            caption="Interwały paliwowe: odczyty, zużycie, czasy faz i stan"
            columns={INTERVAL_COLUMNS}
            rows={intervals}
            rowKey={(row) => row.key}
            rowClass={(row) => (row.state === 'ok' ? undefined : 'flagged')}
          />
        )}

        <span className="hint table-hint">
          Pokazano {intervals.length} interwałów z {data.basis.sessions} dni zamkniętych
          {data.basis.openSessions === 0
            ? '.'
            : ` (dni otwartych w oknie: ${data.basis.openSessions} — bez odczytu końcowego nie znamy ich zużycia).`}
          {data.basis.sessionsInRange > data.basis.sessions
            ? ` Uwaga: okno obejmuje ${data.basis.sessionsInRange} dni, a analiza objęła ${data.basis.sessions} — resztę przycięto limitem.`
            : ''}
        </span>
      </Card>

      <Columns even>
        <Card title="Jak liczymy — reguły">
          <ul className="reason-list">
            <li>
              średnia okna to iloraz sum (Σ zużycia / Σ godzin), nigdy średnia dziennych
              średnich — krótki interwał z błędem odczytu nie może rządzić wynikiem
            </li>
            <li>
              interwał zaczyna się i kończy odczytem paliwomierza, zawsze WEWNĄTRZ jednej
              sesji; ciągłości między dniami pilnują flagi <code>fuel_mismatch</code> i{' '}
              <code>mh_gap</code>
            </li>
            <li>
              liczymy na strumieniu efektywnym: korekty (<code>retime</code> /{' '}
              <code>void</code>) nałożone przed arytmetyką, jak w projekcji sesji
            </li>
            <li>
              ujemne zużycie i odcinki krótsze niż 30 min pracy silnika nie wchodzą do
              regresji — zostają na liście z powodem
            </li>
            <li>
              stawki publikujemy od 5 interwałów i 10 h silnika; wcześniej ekran mówi „za
              mało danych"
            </li>
            <li>
              odstające odcinamy medianą odchyleń, nie odchyleniem standardowym: pojedynczy
              błąd odczytu podniósłby próg tak, że sam by się w nim zmieścił
            </li>
          </ul>
        </Card>

        <Card
          title="Równania"
          actions={<span className="code-ref">GET /admin/api/fleet/:id/consumption</span>}
        >
          <pre className="payload">
            <span className="payload-line">
              <span className="payload-key">zużycie_i</span> = r_ziemia·t_zi + r_wzn·t_wi +
              r_prz·t_pi + r_zniż·t_di + ε_i
            </span>
            <span className="payload-line">
              <span className="payload-key">ΔMH_d</span>    = k_lot·t_lot,d + k_ziemia·t_ziemia,d
              + ε_d
            </span>
            <span className="payload-line"> </span>
            <span className="payload-line">
              estymator:  min Σ ε² przy <span className="payload-val green">r ≥ 0, k ≥ 0</span>{' '}
              (NNLS)
            </span>
            <span className="payload-line">niepewność: przedziały 95% z (AᵀA)⁻¹σ², t-Studenta</span>
          </pre>
          <span className="hint">
            Stawki <code>r</code> (L/h) i przeliczniki <code>k</code> (MH na godzinę zegara)
            to niewiadome; czasy faz <code>t</code> są znane z rejestru i śladu.
            Identyfikowalność bierze się ze zmienności proporcji faz między interwałami —
            dzień z trzema wyniesieniami i dzień z ośmioma to dwa różne równania.
            Niepewność liczymy <b>ze wzoru, nie losowaniem</b>: ta sama odpowiedź przy
            każdym przeliczeniu, sprawdzalna i przybita testem.
          </span>
        </Card>
      </Columns>
    </div>
  );
}

function phaseSetLabel(phaseSet: string): string {
  switch (phaseSet) {
    case 'four':
      return '4-fazowy';
    case 'two':
      return '2-fazowy';
    default:
      return 'jednofazowy';
  }
}
