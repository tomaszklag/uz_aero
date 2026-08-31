/**
 * UZ Aero - panel 2.0: DZIENNIK, poziom 3 - jedna sesja (`#/dziennik/SP-KLM/<uuid>`).
 *
 * ══ PEŁNA STRONA, NIE SZUFLADA ══
 * Szuflady panelu 2.0 (konto, samolot) są formularzami JEDNEGO rekordu; tutaj treścią
 * jest dokument: oś kilkudziesięciu zdarzeń i komplet odczytów. Argument za szufladą
 * („kontekst listy zostaje pod spodem") tu nie działa - do sesji wchodzi się, żeby JĄ
 * przeczytać, a zakres dat wraca razem z linkiem powrotnym.
 *
 * Rejestracja jest w tytule powtórzona z poziomu 2 świadomie: link do sesji bywa
 * wklejony komuś, kto poziomu 2 nigdy nie widział.
 */

import { dateUtcShort, litres, motoHours, oilLitres, timeUtc } from '@uzaero/format';
import { useParams, useSearchParams } from 'react-router-dom';

import type { SessionTrackDto } from '../../api/dto';
import { useSessionDetail, useSessionTrack } from '../../queries/useLog';
import {
  Banner,
  Card,
  EmptyState,
  LinkButton,
  Loadable,
  PageHead,
  Pill,
  TrackMap,
  VerticalProfile,
} from '../../ui/components';
import { PlaneIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { operationLabel } from './sessionRows';
import { timelineRow } from './timelineRows';
import { mapPlot, peakLabel, profilePlot } from './trackChart';
import { hasTrack, noTrackReason, trackFacts } from './trackFacts';
import { trackMarkers } from './trackMarkers';

export function SessionScreen() {
  const { reg = '', uuid } = useParams();
  const [params] = useSearchParams();
  const back = `/dziennik/${reg}?od=${params.get('od') ?? ''}&do=${params.get('do') ?? ''}`;

  const detail = useSessionDetail(uuid);
  const session = detail.data?.session;
  const rows = (detail.data?.timeline ?? []).map(timelineRow);

  // Ślad idzie OSOBNYM żądaniem: karta sesji ma kilkadziesiąt zdarzeń, nagranie -
  // kilkaset wierzchołków po kompresji. Mapa dociąga się pod gotowym ekranem, zamiast
  // opóźniać jego pierwsze wyświetlenie.
  const track = useSessionTrack(uuid);

  const day = session?.claimedAt == null ? '' : dateUtcShort(session.claimedAt);
  const engine =
    session == null
      ? ''
      : `${timeUtc(session.engineStartAt)} → ${timeUtc(session.engineStopAt)} UTC`;

  return (
    <>
      <PageHead
        title={reg.toUpperCase()}
        sub={session == null ? undefined : `${day} · silnik ${engine}`}
        actions={
          <>
            {session?.manualEntry === true ? <Pill tone="dim">ręcznie</Pill> : null}
            {session?.status === 'voided' ? <Pill tone="red">unieważniona</Pill> : null}
            {session?.status === 'active' ? <Pill tone="amber">w toku</Pill> : null}
            <LinkButton to={back} variant="ghost">
              ← Dziennik {reg.toUpperCase()}
            </LinkButton>
          </>
        }
      />

      {detail.error == null ? null : <Banner tone="danger">{errorMessage(detail.error)}</Banner>}

      <Loadable
        pending={detail.isPending}
        skeleton={
          <Card title="Log zdarzeń">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <span key={row} className="skeleton cell" style={{ width: 320, marginBottom: 10 }} />
            ))}
          </Card>
        }
      >
        {session == null ? null : (
          <>
            <Card title="Log zdarzeń">
              <div className="table-wrap plain">
                <table>
                  <caption className="visually-hidden">Zdarzenia sesji</caption>
                  <thead>
                    <tr>
                      <th>Czas</th>
                      <th>Zdarzenie</th>
                      <th>Szczegół</th>
                      <th>Zapis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.uuid} className={row.voided ? 'voided' : undefined}>
                        <td className="num">
                          <span className={row.correctedTime == null ? undefined : 'clock-val struck'}>
                            {row.time}
                          </span>
                          {row.correctedTime == null ? null : (
                            <span className="cell-sub">{row.correctedTime}</span>
                          )}
                        </td>
                        <td className="cell-strong">
                          {row.name}
                          {row.adminCorrected ? (
                            <span className="cell-sub">poprawił administrator</span>
                          ) : null}
                        </td>
                        <td className="cell-sub">{row.detail ?? ''}</td>
                        <td className="cell-sub">{row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Szczegóły">
              <Detail label="Pilot" value={session.picName ?? session.picCode ?? '—'} />
              <Detail label="Drugi pilot" value={session.dualName ?? '—'} />
              <Detail label="Zadanie" value={operationLabel(session.operation)} />
              <Detail label="Klient" value={session.client ?? '—'} />
              <Detail
                label="Trasa"
                value={
                  session.departureIcao == null
                    ? '—'
                    : session.arrivalIcao == null || session.arrivalIcao === session.departureIcao
                      ? session.departureIcao
                      : `${session.departureIcao} → ${session.arrivalIcao}`
                }
              />
              <Detail label="Loty" value={String(session.flightsCount)} />
              <Detail
                label="Starty i lądowania"
                value={`${session.takeoffCount ?? '—'} / ${session.landingCount ?? '—'}`}
              />
              <Detail
                label="Paliwo"
                value={`${litres(session.fuelStartL)} → ${litres(session.fuelEndL)}`}
              />
              <Detail label="Dolano paliwa" value={litres(session.fuelAddedL)} />
              <Detail
                label="Motogodziny"
                value={`${motoHours(session.mhStart, session.mhFormat)} → ${motoHours(session.mhEnd, session.mhFormat)}`}
              />
              <Detail
                label="Olej przed lotem"
                value={oilLitres(session.oilLevelL)}
              />
              <Detail label="Dolano oleju" value={oilLitres(session.oilAddedL)} />
              <Detail label="Olej do lotu" value={oilLitres(session.oilAfterL)} />
            </Card>

            <TrackCard
              track={track.data}
              pending={track.isPending}
              manualEntry={session.manualEntry === true}
              departureIcao={session.departureIcao}
              flights={detail.data?.state.flights ?? []}
            />
          </>
        )}
      </Loadable>
    </>
  );
}

/** Płótno mapy i profilu w JEDNOSTKACH RYSUNKU - CSS rozciąga je na szerokość karty. */
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 430;
const PROFILE_WIDTH = 940;
const PROFILE_HEIGHT = 220;

interface TrackCardProps {
  track: SessionTrackDto | undefined;
  pending: boolean;
  manualEntry: boolean;
  departureIcao: string | null;
  flights: readonly { index: number; takeoffAt: number; landingAt: number | null }[];
}

/**
 * Ślad CAŁEJ sesji: od uruchomienia do wyłączenia silnika (issue #38). Kołowanie jest
 * częścią rysunku, a loty jego odcinkami - stąd znaczniki z numerami lotów zamiast
 * czterech osobnych map.
 */
function TrackCard({ track, pending, manualEntry, departureIcao, flights }: TrackCardProps) {
  if (pending) {
    return (
      <Card title="Ślad GPS">
        <span className="skeleton" style={{ display: 'block', height: MAP_HEIGHT / 2 }} />
      </Card>
    );
  }

  // Brak rysunku ma POWÓD i wariantów jest kilka - „brak śladu" pokazane przy locie
  // z kartki byłoby kłamstwem o tym locie.
  if (!hasTrack(track)) {
    return (
      <Card title="Ślad GPS">
        <EmptyState
          icon={<PlaneIcon size={20} />}
          title="Bez mapy"
          note={noTrackReason(manualEntry)}
        />
      </Card>
    );
  }

  const plot = mapPlot(
    track.line,
    trackMarkers(track, flights),
    MAP_WIDTH,
    MAP_HEIGHT,
    departureIcao,
  );
  const profile = profilePlot(track.profile, PROFILE_WIDTH, PROFILE_HEIGHT);

  return (
    <Card title="Ślad GPS">
      {plot == null ? null : <TrackMap plot={plot} width={MAP_WIDTH} height={MAP_HEIGHT} />}

      <div className="track-facts">
        {trackFacts(track).map((fact) => (
          <div className="track-fact" key={fact.label}>
            <span className="track-fact-k">{fact.label}</span>
            <span className="track-fact-v">{fact.value}</span>
          </div>
        ))}
      </div>

      {profile == null || track.startedAt == null || track.endedAt == null ? null : (
        <>
          <VerticalProfile
            plot={profile}
            width={PROFILE_WIDTH}
            height={PROFILE_HEIGHT}
            startAt={track.startedAt}
            endAt={track.endedAt}
            peakLabel={peakLabel(track.profile)}
          />
          <p className="profile-foot">
            Wysokość z GPS - potrafi różnić się od wysokościomierza o kilkaset stóp.
            Przerwa w wykresie to czas na ziemi między lotami.
          </p>
        </>
      )}
    </Card>
  );
}

/** Wiersz klucz-wartość karty szczegółów. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span className="kv-k">{label}</span>
      <span className="kv-v">{value}</span>
    </div>
  );
}
