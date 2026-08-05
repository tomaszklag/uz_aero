/**
 * UZ Aero — panel: ŚLAD LOTU (`design/admin/A02c-slad.html`).
 *
 * Pełna strona, nie szuflada nad kartą dnia — inaczej niż korekta (`A02b`). Powód jest
 * w treści: mapa i profil potrzebują całej szerokości okna, a szuflada zostawiłaby na nie
 * pas, w którym trasa lotu po kręgu byłaby nieczytelna.
 *
 * Ekran jest `.tsx` BEZ arytmetyki: geometrię, profil i log policzyła domena
 * (`buildFlightTrack`, `buildFlightProfile`), a napisy powstają w `trackRows.ts`.
 *
 * **Ślad nie jest rejestrem** i ekran mówi to wprost banerem na dole. Zapis GPS
 * przychodzi z telefonu osobnym, niskopriorytetowym torem i może mieć dziury — brak
 * fragmentu trasy nie znaczy, że lot się nie odbył. Czasy rozliczeniowe pochodzą
 * wyłącznie z rejestru zdarzeń; mapa służy diagnostyce detekcji i rozmowie z pilotem.
 */

import { useNavigate, useParams } from 'react-router-dom';

import { hhmm, timeUtcSeconds } from '@uzaero/format';

import { useFlightTrack } from '../../queries/useFlightTrack';
import { useSessionDay } from '../../queries/useSessionDay';
import {
  Banner,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHead,
  Pill,
  Tile,
  TileGrid,
  type Column,
} from '../../ui/components';
import { DaysIcon } from '../../ui/components/icons';
import { TrackMap } from '../../ui/components/TrackMap';
import { VerticalProfile } from '../../ui/components/VerticalProfile';
import {
  mapPlot,
  peakLabel,
  profileFooter,
  profilePlot,
  trackTiles,
  type MapMarkerInput,
} from './trackChart';
import { trackLogRows, trackLogSummary, type TrackLogRow } from './trackRows';





/** Wymiary z mockupu A02c — płótno mapy 430 px, profil 220 px. */
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 430;
const PROFILE_WIDTH = 940;
const PROFILE_HEIGHT = 220;

const LOG_COLUMNS: Column<TrackLogRow>[] = [
  { key: 'time', header: 'Czas UTC', align: 'num', render: (row) => row.time },
  { key: 'lat', header: 'Szerokość', align: 'num', cellClass: 'pos', render: (row) => row.lat },
  { key: 'lon', header: 'Długość', align: 'num', cellClass: 'pos', render: (row) => row.lon },
  { key: 'gs', header: 'GS', align: 'num', render: (row) => row.groundSpeed },
  { key: 'alt', header: 'Wysokość', align: 'num', render: (row) => row.altitude },
  { key: 'track', header: 'Kurs', align: 'num', render: (row) => row.track },
  { key: 'acc', header: 'Dokładność', align: 'num', render: (row) => row.accuracy },
  {
    key: 'state',
    header: 'Stan',
    render: (row) => <Pill tone={row.stateTone}>{row.state}</Pill>,
  },
  {
    key: 'note',
    header: 'Uwagi',
    cellClass: 'dim',
    render: (row) => (row.note === '' ? '—' : row.note),
  },
];

export function TrackScreen() {
  const { sessionUuid, flightIndex } = useParams();
  const navigate = useNavigate();

  const index = Number(flightIndex ?? '1');
  const track = useFlightTrack(sessionUuid ?? '', index);
  // Karta dnia daje listę lotów do paska przełączania. Ładuje się równolegle i jej brak
  // nie blokuje mapy — pasek po prostu pokazuje wtedy sam bieżący lot.
  const day = useSessionDay(sessionUuid ?? '');

  if (track.isPending) return null;

  if (track.isError) {
    return (
      <Banner tone="danger" live>
        <b>Nie udało się wczytać śladu.</b> Jeżeli adres pochodzi z wklejonego linku, sprawdź
        numer lotu — serwer odpowiada „nie znaleziono" zarówno na nieznaną sesję, jak i na
        numer lotu, którego ten dzień nie ma.{' '}
        <Button variant="ghost" size="sm" onClick={() => void track.refetch()}>
          Ponów
        </Button>
      </Banner>
    );
  }

  const data = track.data;
  const flights = day.data?.state.flights ?? [];
  const rows = trackLogRows(data.log);
  const manual = data.method === 'manual';
  // ICAO bierzemy z karty dnia, a nie z odpowiedzi śladu: to informacja o SESJI
  // (pilot wpisał ją w preflighcie), więc dokładanie jej do koperty trasy dublowałoby
  // dane, które panel i tak już ma na ekranie obok.
  const departureIcao = day.data?.state.departureIcao ?? null;

  const markers: MapMarkerInput[] =
    data.line.length === 0
      ? []
      : [
          {
            position: data.line[0]!,
            color: 'var(--green)',
            label: `T/O ${timeUtcSeconds(data.takeoffAt)}`,
            ring: true,
          },
          {
            position: data.line[data.line.length - 1]!,
            color: 'var(--red)',
            label: data.landingAt != null ? `LDG ${timeUtcSeconds(data.landingAt)}` : 'w powietrzu',
          },
        ];

  // Geometria ekranowa powstaje w module czystym — widok jej nie liczy (§ reguła panelu).
  const plot = mapPlot(data.line, markers, MAP_WIDTH, MAP_HEIGHT, departureIcao);
  const profile = profilePlot(data.profile, PROFILE_WIDTH, PROFILE_HEIGHT);
  const footer = profileFooter(data.profile);
  const tiles = trackTiles(data);

  return (
    <>
      <PageHead
        title={`ŚLAD LOTU ${data.flightIndex}`}
        sub={
          <>
            {timeUtcSeconds(data.takeoffAt)} →{' '}
            {data.landingAt != null ? timeUtcSeconds(data.landingAt) : '— (lot otwarty)'} UTC ·
            metoda {manual ? 'ręczna' : 'automatyczna'}.
            <br />
            Trasa odtworzona z fixów przysłanych przez telefon, po bramce jakości. Zapis jest
            materiałem badawczym, nie rejestrem — czasy w rejestrze zdarzeń są źródłem prawdy
            niezależnie od tego, co widać na mapie.
          </>
        }
        actions={
          <Button variant="ghost" onClick={() => navigate(`/dni/${sessionUuid ?? ''}`)}>
            Wróć do dnia
          </Button>
        }
      />

      <TileGrid>
        <Tile label="Czas lotu" value={hhmm(flightDuration(data))} tone="green" note={`takeoff ${timeUtcSeconds(data.takeoffAt)} UTC`} />
        <Tile
          label="Dystans po ziemi"
          value={tiles.distance}
          unit="NM"
          note="Suma odcinków między punktami po bramce."
        />
        <Tile
          label="Maksymalna wysokość"
          value={tiles.maxAltitude}
          unit="ft"
          note="Wysokość GPS, nie ciśnieniowa — bez korekty QNH."
        />
        <Tile
          label="Punkty śladu"
          value={tiles.usable}
          unit={`/ ${tiles.total}`}
          note={`${tiles.rejected} odrzucone przez bramkę jakości.`}
        />
      </TileGrid>

      <Card title="Trasa" actions={<Pill tone="dim">siatka współrzędnych · bez pobierania z sieci</Pill>}>
        {flights.length > 1 && (
          <div className="flight-picker">
            <span className="flight-picker-label">Loty dnia</span>
            {flights.map((flight) => (
              <button
                key={flight.index}
                type="button"
                // Nazwa klasy WYBIERANA, nie sklejana — panel nie produkuje nazw klas
                // z fragmentów (reguła `test/architecture.test.ts`).
                className={flight.index === data.flightIndex ? 'fp-item active' : 'fp-item'}
                onClick={() => navigate(`/dni/${sessionUuid ?? ''}/slad/${flight.index}`)}
                title={
                  flight.method === 'manual'
                    ? 'Lot wpisany ręcznie — brak zapisu GPS'
                    : `Lot ${flight.index}`
                }
              >
                {flight.index}
              </button>
            ))}
          </div>
        )}

        {plot == null ? (
          <EmptyState
            icon={<DaysIcon />}
            title={manual ? 'Lot wpisany ręcznie' : 'Brak zapisu GPS'}
            note={
              manual
                ? 'Wzlot dodany przez pilota ręcznie (ekran 08) — GPS nie pracował albo detekcja go nie złapała. Czasy są pełnoprawne, brakuje wyłącznie geometrii.'
                : 'Dla tego lotu nie ma fixów w zapisie. Telefon mógł ich nie wysłać albo cały odcinek poległ na bramce jakości — w drugim przypadku wiersze widać w logu niżej.'
            }
          />
        ) : (
          <TrackMap plot={plot} width={MAP_WIDTH} height={MAP_HEIGHT} />
        )}
      </Card>

      {profile != null && (
        <Card
          title="Profil pionowy"
          actions={<Pill tone="dim">wysokość GPS · ft · oś czasu UTC</Pill>}
        >
          <VerticalProfile
            plot={profile}
            width={PROFILE_WIDTH}
            height={PROFILE_HEIGHT}
            startAt={data.profile.samples[0]!.time}
            endAt={data.profile.samples[data.profile.samples.length - 1]!.time}
            peakLabel={peakLabel(data.profile)}
          />
          <div className="profile-foot">
            {footer.climb != null && (
              <span>
                Wznoszenie średnio <b>{footer.climb}</b>
              </span>
            )}
            {footer.descent != null && (
              <span>
                Zejście średnio <b>{footer.descent}</b>
              </span>
            )}
            {data.profile.timeToPeakMs != null && (
              <span>
                Czas do szczytu <b>{hhmm(data.profile.timeToPeakMs)}</b>
              </span>
            )}
            <span>
              Wysokość z GPS — <b>nie</b> ciśnieniowa, bez korekty QNH
            </span>
          </div>
        </Card>
      )}

      <Card
        title="Log przeliczonych punktów"
        actions={<Pill tone="dim">próbka co 30 s plus wszystkie odrzucone</Pill>}
      >
        <DataTable
          columns={LOG_COLUMNS}
          rows={rows}
          rowKey={(row) => row.id}
          rowClass={(row) => (row.rejected ? 'rejected' : undefined)}
          caption={`Log punktów lotu ${data.flightIndex}`}
        />
        <div className="list-foot">
          {trackLogSummary(rows.length, data.totalCount, data.usableCount)} Odrzucone nie wchodzą
          do dystansu ani do profilu, ale zostają w zapisie — to materiał do strojenia progów
          (<code>server/scripts/replay.ts</code>).
        </div>
      </Card>

      {/* Baner STATUSU: opisuje właściwość danych, a nie zdarzenie — nie jest zamykalny. */}
      <Banner tone="status">
        <b>Ślad nie jest rejestrem.</b> Zapis GPS przychodzi z telefonu osobnym,
        niskopriorytetowym torem i może mieć dziury — brak fragmentu trasy nie znaczy, że lot
        się nie odbył. Czasy rozliczeniowe pochodzą wyłącznie z rejestru zdarzeń; mapa służy
        diagnostyce detekcji i rozmowie z pilotem.
      </Banner>
    </>
  );
}

/** Czas lotu z okna rejestru; lot otwarty nie ma jeszcze długości. */
function flightDuration(data: { takeoffAt: number; landingAt: number | null }): number {
  if (data.landingAt == null) return 0;
  const span = data.landingAt - data.takeoffAt;
  return span > 0 ? span : 0;
}
