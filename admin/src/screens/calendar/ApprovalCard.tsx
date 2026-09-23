/**
 * Ninerdeck - panel: KARTA „ŚCIEŻKA AKCEPTACJI" w szufladzie zajętości - historia decyzji
 * i decyzja za utknięty krok (makieta `kalendarz-wpis` K2a; issue #165, H5).
 *
 * Decyzja właściciela 2026-09-23: historia decyzji i wyjście awaryjne administratora
 * mieszkają TUTAJ, nie w kolejce. Kolejka pokazuje wyłącznie sprawy na MOIM kroku, więc
 * rezerwacja utknięta na kroku bez obsady (K4c) nigdy by się w niej nie pojawiła -
 * a szuflada opisuje KAŻDĄ zajętość, także tę, którą trzeba odblokować.
 *
 * ══ DECYZJA ADMINISTRATORA JEST JAWNYM AKTEM ══
 * „Cudze rezerwacje" (`reservations.manage`) odblokowują KAŻDY krok - druga zapora przed
 * zakleszczeniem ścieżki (§11.2). Karta mówi, ZA KTÓRY krok administrator decyduje, a zapis
 * w historii jest jego. Bez tej zdolności karty decyzji nie ma wcale.
 *
 * Klub bez ścieżki karty NIE MA (`steps` puste): „potwierdzona od razu" jest stanem
 * domyślnym i nie dostaje zdania.
 */

import { useState } from 'react';

import type { ApprovalViewDto } from '../../api/dto';
import { useDecideBooking } from '../../queries/useApprovals';
import { Button, Card, Pill } from '../../ui/components';
import { currentStepLabel, historyRows, pathPill } from './approvalHistory';
import { decisionErrorMessage } from './approvalRefusal';
import type { PersonLookup } from './bookingLabels';

interface Props {
  bookingId: string;
  view: ApprovalViewDto;
  person: PersonLookup;
  timezone: string;
  /** `reservations.manage` - decyzja za krok. Bez niej sama historia. */
  canDecide: boolean;
}

export function ApprovalCard({ bookingId, view, person, timezone, canDecide }: Props) {
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const decide = useDecideBooking();

  const pill = pathPill(view);
  if (pill == null) return null;

  const rows = historyRows(view, person, timezone);
  const step = currentStepLabel(view);

  const settle = (decision: 'approved' | 'rejected'): void => {
    decide.mutate(
      { id: bookingId, body: { decision, reason: decision === 'rejected' ? reason.trim() : null } },
      {
        onSuccess: () => {
          setRefusing(false);
          setReason('');
        },
      },
    );
  };

  return (
    <>
      <Card title="Ścieżka akceptacji" actions={<Pill tone={pill.tone}>{pill.label}</Pill>}>
        {rows.map((row) => (
          <div className="kv" key={row.id}>
            <span className="kv-k">{row.label}</span>
            <span className={row.tone === 'amber' ? 'kv-v amber' : 'kv-v'}>
              {row.value}
              {row.who == null ? null : (
                <>
                  {' · '}
                  {row.who.name}
                  {row.who.code == null ? null : (
                    <>
                      {' '}
                      <span className="cell-sub mono">{row.who.code}</span>
                    </>
                  )}
                </>
              )}
              {row.when == null ? null : (
                <>
                  {' '}
                  <span className="cell-sub">· {row.when}</span>
                </>
              )}
              {row.note == null ? null : (
                <>
                  <br />
                  <span className="cell-sub">{row.note}</span>
                </>
              )}
            </span>
          </div>
        ))}
      </Card>

      {canDecide && step != null ? (
        <Card title={`Decyzja za krok „${step}"`}>
          {refusing ? (
            <>
              <div className="field">
                <label className="label" htmlFor="step-refusal">
                  Powód odmowy
                </label>
                <textarea
                  id="step-refusal"
                  className="input area"
                  rows={3}
                  value={reason}
                  placeholder="Np. maszyna po przeglądzie dopiero w poniedziałek."
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <p className="hint">
                Pilot zobaczy ten powód w telefonie. Odmowa jest ostateczna: rezerwacja zostaje
                odrzucona, a termin wraca do puli.
              </p>
              <div className="drawer-foot">
                <Button variant="ghost" disabled={decide.isPending} onClick={() => setRefusing(false)}>
                  Wróć
                </Button>
                <Button
                  variant="danger"
                  disabled={reason.trim() === '' || decide.isPending}
                  onClick={() => settle('rejected')}
                >
                  {decide.isPending ? 'Zapisuję…' : 'Odmów'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="card-note">
                Ten krok czeka na osoby z jego listy. Możesz rozstrzygnąć go za nie - w historii
                stanie Twoje nazwisko. Odmowa jest ostateczna i wymaga powodu.
              </p>
              <div className="drawer-foot">
                <Button variant="ghost" disabled={decide.isPending} onClick={() => setRefusing(true)}>
                  Odmów
                </Button>
                <Button variant="primary" disabled={decide.isPending} onClick={() => settle('approved')}>
                  {decide.isPending ? 'Zapisuję…' : 'Zatwierdź'}
                </Button>
              </div>
            </>
          )}
          {decide.error == null ? null : (
            <p className="card-note danger">{decisionErrorMessage(decide.error)}</p>
          )}
        </Card>
      ) : null}
    </>
  );
}
