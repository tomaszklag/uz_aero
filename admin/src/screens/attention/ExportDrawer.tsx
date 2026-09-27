/**
 * Ninerdeck - panel 3.2: SZUFLADA KARTY DNIA (`#/do-sprawdzenia/karty/:uuid`;
 * makieta `sprawdzenie-karty`, kanwy „Karta w arkuszu" i „Wyniki ponowienia").
 *
 * Tytułem jest NAZWA KARTY (do przeczytania skarbnikowi), podtytuł - doba, maszyna,
 * pilot, chwila zdania. Baner mówi CO się stało i CO ZROBIĆ, nie jak działa eksporter.
 * Trzy karty istnieją WYŁĄCZNIE przy karcie w arkuszu: REWIZJE (dziennik wysyłek - po
 * nim, i tylko po nim, wiadomo, co widział skarbnik zamykając miesiąc), TREŚĆ (dosłowne
 * wiersze dokumentu, nie liczby panelu) i ADRES - ten, który działa DZIŚ (bieżący host,
 * slug i sekret klubu), pokazany świadomie z jednym zdaniem o tym, komu go dawać.
 *
 * Ponowienie wymaga `fleet.manage` - bez zdolności stopka jest pusta, nie wyszarzona.
 * Nieudane ponowienie to ODPOWIEDŹ z powodem, nie błąd (`retryNotice`).
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { ExportListItemDto } from '../../api/dto';
import { useExportHistory, useRetryExport, useSheetPreview } from '../../queries/useAttention';
import { useAircraftSessions } from '../../queries/useLog';
import { Banner, Button, Card, Drawer, LinkButton, Pill } from '../../ui/components';
import { errorMessage } from '../common/apiMessage';
import { NONE, timeUtc } from '../common/values';
import { sessionPath } from '../logbook/logbookPaths';
import { operationLabel } from '../logbook/sessionRows';
import { flagPath } from './attentionPaths';
import { exportDrawerSub, exportStateLabel, exportStateTone, retryNotice, revisionLabel, type Notice } from './exportRows';

interface ExportDrawerProps {
  sessionUuid: string;
  /** `null` = lista jeszcze nie przyszła; pusta tablica = przyszła i jest pusta. */
  items: ExportListItemDto[] | null;
  listPending: boolean;
  canRetry: boolean;
  onClose: () => void;
}

const EMPTY_RANGE = { from: '', to: '' };
const NO_FLAG = { resolved: false, kind: null };

const stamp = (iso: string): string => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

export function ExportDrawer({ sessionUuid, items, listPending, canRetry, onClose }: ExportDrawerProps) {
  const item = items?.find((row) => row.sessionUuid === sessionUuid) ?? null;
  const history = useExportHistory(item == null ? undefined : sessionUuid);
  const hasSheet = history.data?.address != null;
  const sheet = useSheetPreview(item == null ? undefined : sessionUuid, hasSheet);
  // Operacje TEJ DOBY tej maszyny - z listy operacji dziennika, w zakresie jednego dnia.
  const sessions = useAircraftSessions({
    aircraftId: item?.aircraftId ?? '',
    from: item?.day ?? undefined,
    to: item?.day ?? undefined,
  });

  const retry = useRetryExport();
  const [result, setResult] = useState<Notice | null>(null);
  const [copied, setCopied] = useState(false);

  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (item == null || synced.current === item.sessionUuid) return;
    synced.current = item.sessionUuid;
    setResult(null);
    setCopied(false);
    retry.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (item == null) {
    return (
      <Drawer
        title="Karta dnia"
        sub={sessionUuid}
        onClose={onClose}
        footer={
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
        }
      >
        {listPending ? null : (
          <Banner tone="warn">Nie ma takiej operacji w bieżącym zakresie. Zmień zakres dat albo chip stanu.</Banner>
        )}
      </Drawer>
    );
  }

  const retryable = canRetry && (item.state === 'missing' || item.state === 'current');
  const blockingFlag = item.blockingFlagIds[0] ?? null;
  const address = history.data?.address ?? null;
  const dayRows = sessions.data?.items ?? [];

  const submit = (): void => {
    retry.mutate(sessionUuid, { onSuccess: (response) => setResult(retryNotice(response.retry)) });
  };

  const copy = (): void => {
    if (address == null) return;
    void navigator.clipboard?.writeText(address).then(() => setCopied(true));
  };

  return (
    <Drawer
      title={item.tab ?? NONE}
      sub={
        <>
          {exportDrawerSub(item)} · <Pill tone={exportStateTone(item.state)}>{exportStateLabel(item.state)}</Pill>
        </>
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
          {item.state === 'blocked' && blockingFlag != null ? (
            <LinkButton to={flagPath(blockingFlag, NO_FLAG)} variant="primary">
              Do rozjazdu
            </LinkButton>
          ) : retryable ? (
            <Button variant={item.state === 'missing' ? 'primary' : 'default'} onClick={submit} disabled={retry.isPending}>
              Ponów eksport
            </Button>
          ) : null}
        </>
      }
    >
      {result == null ? null : (
        <Banner tone={result.tone} live>
          {result.text}
        </Banner>
      )}
      {retry.error == null ? null : (
        <Banner tone="danger" live>
          {errorMessage(retry.error)}
        </Banner>
      )}

      {item.state === 'missing' ? (
        <Banner tone="danger">
          <b>Karta nie powstała.</b> Samolot zdano{item.closeTime == null ? '' : ` ${timeUtc(item.closeTime)} UTC`}, a eksport
          się nie zapisał - w arkuszu nie ma tej doby. Ponów, żeby zbudować kartę jeszcze raz.
        </Banner>
      ) : null}
      {item.state === 'blocked' ? (
        <Banner tone="warn">
          <b>Kartę trzyma otwarty rozjazd.</b>{' '}
          {`Dopóki sprawa „Dwie operacje naraz · ${item.reg ?? item.aircraftId}" jest otwarta, ta operacja nie wchodzi do karty ${item.tab ?? NONE}. Zamknięcie sprawy wyśle kartę do arkusza.`}
        </Banner>
      ) : null}
      {item.state === 'waiting' ? (
        <Banner tone="status">Karta doby powstaje po zdaniu samolotu. Ta operacja jeszcze trwa.</Banner>
      ) : null}
      {item.state === 'impossible' ? (
        <Banner tone="status">
          {item.sessionStatus === 'voided'
            ? 'Wpis unieważniony - nie wchodzi do karty doby.'
            : 'Operacja bez chwili przejęcia - karty nie da się nazwać ani zbudować.'}
        </Banner>
      ) : null}
      {item.overwrittenBy == null ? null : (
        <Banner tone="status">
          Treść pod tą nazwą zapisała później operacja{' '}
          <Link className="cell-link" to={sessionPath(item.reg ?? item.aircraftId, item.overwrittenBy.sessionUuid, EMPTY_RANGE)}>
            {item.overwrittenBy.sessionUuid}
          </Link>{' '}
          ({stamp(item.overwrittenBy.exportedAt)}). Podgląd niżej pokazuje tamten zapis.
        </Banner>
      )}

      <Card title="Operacje w tej dobie">
        {dayRows.length === 0 ? (
          <p className="hint">{sessions.isPending ? 'Wczytywanie…' : 'Brak operacji w tej dobie.'}</p>
        ) : (
          dayRows.map((session) => (
            <div className="kv" key={session.sessionUuid}>
              <span className="kv-k">
                {timeUtc(session.engineStartAt)} → {session.status === 'active' ? 'w toku' : timeUtc(session.engineStopAt)}
              </span>
              <span className="kv-v">
                {session.status === 'voided' ? (
                  <>
                    <span className="was">wpis unieważniony</span> <small>nie wchodzi do karty</small>
                  </>
                ) : (
                  <>
                    <Link className="cell-link" to={sessionPath(session.reg ?? session.aircraftId, session.sessionUuid, EMPTY_RANGE)}>
                      {session.signature ?? session.reg ?? NONE}
                    </Link>{' '}
                    <small>
                      {operationLabel(session.operation).toLowerCase()} · {session.flightsCount}{' '}
                      {session.flightsCount === 1 ? 'lot' : session.flightsCount >= 2 && session.flightsCount <= 4 ? 'loty' : 'lotów'}
                    </small>
                  </>
                )}
              </span>
            </div>
          ))
        )}
        <div className="kv">
          <span className="kv-k">Ostatni zapis z telefonu</span>
          <span className="kv-v">{stamp(item.updatedAt)}</span>
        </div>
      </Card>

      {history.data == null || history.data.revisions.length === 0 ? null : (
        <Card
          title={
            <>
              Rewizje <span className="card-count">· {history.data.revisions.length}</span>
            </>
          }
        >
          {[...history.data.revisions].reverse().map((revision) => (
            <div className="kv" key={revision.revision}>
              <span className="kv-k">{revisionLabel(revision.revision, revision.exportedAt)}</span>
              <span className="kv-v">
                <small>{revision.revision === 1 ? 'pierwsza wysyłka' : 'wysłana ponownie'}</small>
              </span>
            </div>
          ))}
        </Card>
      )}

      {sheet.data == null ? null : (
        <Card title="Treść karty">
          <div className="table-wrap plain">
            <table>
              <caption className="visually-hidden">Wiersze karty {sheet.data.tab}</caption>
              {sheet.data.rows.length === 0 ? null : (
                <thead>
                  <tr>
                    {sheet.data.rows[0]!.map((cell, index) => (
                      <th key={index}>{cell}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {sheet.data.rows.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, index) => (
                      <td key={index} className="mono">
                        {cell === '' ? NONE : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="hint">Tak leży w arkuszu od {stamp(sheet.data.updatedAt)}.</span>
        </Card>
      )}

      {address == null ? null : (
        <Card title="Adres karty">
          <div className="field-row">
            <input className="input mono" value={address} readOnly aria-label="Adres karty" />
            <Button onClick={copy}>{copied ? 'Skopiowano' : 'Kopiuj'}</Button>
          </div>
          <span className="hint">Otwiera się bez logowania - jak dokument klubu. Podaj go skarbnikowi, nie publikuj.</span>
        </Card>
      )}
    </Drawer>
  );
}
