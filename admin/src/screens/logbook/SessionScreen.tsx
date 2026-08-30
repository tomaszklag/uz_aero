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

import { useSessionDetail } from '../../queries/useLog';
import { Banner, Card, LinkButton, Loadable, PageHead, Pill } from '../../ui/components';
import { errorMessage } from '../common/apiMessage';
import { operationLabel } from './sessionRows';
import { timelineRow } from './timelineRows';

export function SessionScreen() {
  const { reg = '', uuid } = useParams();
  const [params] = useSearchParams();
  const back = `/dziennik/${reg}?od=${params.get('od') ?? ''}&do=${params.get('do') ?? ''}`;

  const detail = useSessionDetail(uuid);
  const session = detail.data?.session;
  const rows = (detail.data?.timeline ?? []).map(timelineRow);

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
          </>
        )}
      </Loadable>
    </>
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
