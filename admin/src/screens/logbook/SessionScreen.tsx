/**
 * UZ Aero - panel 2.0: DZIENNIK, poziom 3 - jedna operacja (`#/dziennik/SP-KLM/<uuid>`).
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
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import type { SessionListItemDto, SessionTrackDto } from '../../api/dto';
import { can } from '../../auth/can';
import { useVoidSession } from '../../queries/useLogCommands';
import { useSessionDetail, useSessionTrack } from '../../queries/useLog';
import { useSession } from '../../queries/useSession';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  LinkButton,
  Loadable,
  PageHead,
  Pill,
  TextInput,
  TrackMap,
  VerticalProfile,
} from '../../ui/components';
import { PlaneIcon } from '../../ui/components/icons';
import { errorMessage, ruleViolationMessage } from '../common/apiMessage';
import { operationLabel } from './sessionRows';
import { voidFacts } from './sessionVoid';
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

  // Pisanie w cudzym rejestrze to `events.correct` - ta sama zdolność, co przy korekcie.
  // Serwer egzekwuje ją niezależnie; tu decyduje wyłącznie o tym, czy przycisk ISTNIEJE.
  const me = useSession();
  const voidable = can(me.data?.capabilities, 'events.correct');

  const day = session?.claimedAt == null ? '' : dateUtcShort(session.claimedAt);
  const engine =
    session == null
      ? ''
      : `${timeUtc(session.engineStartAt)} → ${timeUtc(session.engineStopAt)} UTC`;

  /* NAZWA OPERACJI W PODTYTULE (issue #68). Wypiera datę, bo ją zawiera - para
     „01.09 · SP-AXA/2026-09-01/…" powtarzałaby ten sam fakt w jednej linii. Link do
     operacji bywa wklejony komuś, kto listy nigdy nie widział, więc identyfikacja
     musi stać na stronie, a nie tylko w pasku adresu (gdzie stoi uuid). */
  const identity = session?.signature ?? day;

  return (
    <>
      <PageHead
        title={reg.toUpperCase()}
        sub={session == null ? undefined : `${identity} · silnik ${engine}`}
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
            {session.status === 'voided' ? (
              // Plakietka w nagłówku mówi CO, ten baner mówi CO Z TEGO WYNIKA. Bez niego
              // czerwony pill nad wypełnioną kartą czyta się jak ostrzeżenie o danych,
              // a nie jak informacja, że tych liczb nikt już nie liczy.
              <Banner tone="status">
                Wpis wycofany - nie liczy się do nalotu pilota, do sum dziennika ani do
                karty arkusza. Powód stoi na osi zdarzeń.
              </Banner>
            ) : null}

            <Card title="Log zdarzeń">
              <div className="table-wrap plain">
                <table>
                  <caption className="visually-hidden">Zdarzenia operacji</caption>
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

            {/* Na samym DOLE i za wszystkim: do operacji wchodzi się, żeby ją przeczytać,
                a wycofanie wpisu jest wyjściem awaryjnym. Bez zdolności `events.correct`
                karty NIE MA (§3.3: brak uprawnień = brak przycisku), a przy wpisie już
                wycofanym nie ma czego wycofywać - mówi to baner na górze. */}
            {voidable && session.status !== 'voided' ? <VoidCard session={session} /> : null}
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

/**
 * UNIEWAŻNIENIE CAŁEGO WPISU (2026-08-31).
 *
 * ══ PYTANIE STOI PRZY PRZYCISKU, KTÓREGO DOTYCZY ══
 * Nie `window.confirm` i nie okno nad stroną - ta sama konstrukcja, co przy trwałym
 * usunięciu konta (`.confirm` w `AccountDrawer`). Różnica jest jedna i wymuszona
 * treścią: potwierdzenie NAZYWA konkretny wpis, bo dwie sesje tej samej maszyny
 * w jednej dobie różnią się wyłącznie godzinami.
 *
 * Powód jest WYMAGANY (serwer odrzuca puste) i nie dostaje zdania przy przycisku:
 * puste pole widać w kontrolce tuż nad nim. Zdanie należy się blokadzie, której
 * z ekranu nie widać - a tej widać.
 */
function VoidCard({ session }: { session: SessionListItemDto }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const withdraw = useVoidSession();

  // Odmowa REGUŁ ma zdanie od domeny („Ta sesja jest już unieważniona"); wszystko
  // inne - od panelu. Wyścig jest realny: ktoś mógł wycofać ten wpis w drugim oknie.
  const failure =
    withdraw.error == null
      ? null
      : (ruleViolationMessage(withdraw.error) ?? errorMessage(withdraw.error));

  return (
    <Card title="Unieważnienie wpisu">
      <p className="hint">
        Wycofany wpis wypada z nalotu pilota, z sum dziennika i z karty arkusza. Sam zapis
        zostaje razem z powodem - widać, że lot był i że go wycofano.
      </p>

      {asking ? null : (
        <Button variant="danger" size="sm" onClick={() => setAsking(true)}>
          Unieważnij wpis
        </Button>
      )}

      {asking ? (
        <div className="confirm">
          <p className="confirm-q">Unieważnić ten wpis?</p>

          {voidFacts(session).map((fact) => (
            <div className="kv" key={fact.label}>
              <span className="kv-k">{fact.label}</span>
              <span className="kv-v">{fact.value}</span>
            </div>
          ))}

          <Field
            htmlFor="void-reason"
            label="Powód"
            hint="Zobaczy go pilot na telefonie; zostaje w dzienniku."
          >
            <TextInput
              id="void-reason"
              value={reason}
              placeholder="np. wpis otwarty przez pomyłkę na tej maszynie"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          {failure == null ? null : (
            <Banner tone="danger" live>
              {failure}
            </Banner>
          )}

          <div className="confirm-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAsking(false);
                // Odmowa sprzed chwili nie ma prawa czekać na następne otwarcie -
                // opisywałaby próbę, o której nikt już nie pamięta.
                withdraw.reset();
              }}
            >
              Anuluj
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={withdraw.isPending || reason.trim() === ''}
              onClick={() =>
                withdraw.mutate(
                  { uuid: session.sessionUuid, reason: reason.trim() },
                  // Po udanym wycofaniu karta i tak znika (wpis ma status `voided`),
                  // ale zamykamy pytanie jawnie: odświeżenie listy jest asynchroniczne.
                  { onSuccess: () => setAsking(false) },
                )
              }
            >
              Unieważnij wpis
            </Button>
          </div>
        </div>
      ) : null}
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
