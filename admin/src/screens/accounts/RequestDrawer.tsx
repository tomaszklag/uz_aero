/**
 * UZ Aero - panel: decyzja o zgłoszeniu kodem klubu (`#/piloci/zgloszenia/:id`;
 * mockup `piloci-zgloszenie` - P3, P3a, P3b).
 *
 * TRZY STANY JEDNEJ SZUFLADY, bo to jedna decyzja oglądana na trzech etapach:
 *  • **P3** formularz przyjęcia - kod pilota W TYM klubie i rola. Bez e-maila: adres
 *    jest tożsamością Google i administrator go nie wpisuje. Dwa przyciski i ŻADEN
 *    domyślny - obie drogi są decyzją;
 *  • **P3a** odrzucenie - „Odrzuć" zamienia formularz na JEDNO pole powodu. Powód jedzie
 *    na ekran telefonu zgłaszającego, nie do dziennika panelu, i podpowiedź mówi to wprost;
 *  • **P3b** po decyzji - formularza NIE MA, zostaje jedno zdanie. Formularz pod spodem
 *    obiecywałby drugą decyzję, a ta odbiłaby się o `409 wrong_status`.
 *
 * ══ ZATWIERDZENIE NIE PRZYJMUJE ODRZUCONEGO ══
 * Zdjęcie cudzej odmowy jest OSOBNĄ decyzją i ma osobny przycisk („Cofnij odrzucenie"):
 * wpuszczenie odrzuconego jednym ruchem pomijałoby chwilę, w której ktoś świadomie
 * zdejmuje decyzję poprzednika - a każda połowa ma własny wpis w dzienniku.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { MembershipRequestDto } from '../../api/dto';
import {
  useApproveMembership,
  useRejectMembership,
  useReopenMembership,
} from '../../queries/useMemberships';
import { Banner, Button, Card, Drawer, Field, OptionButton, Pill, TextInput } from '../../ui/components';
import { conflictField, errorMessage } from '../common/apiMessage';
import { roleLabel, roleNote, ROLE_ORDER } from './accountRows';
import {
  approvalBodyOf,
  approveVerdict,
  EMPTY_REQUEST,
  normalizeCode,
  rejectVerdict,
  type RequestDraft,
  type RequestStep,
} from './requestForm';
import { requestRow } from './requestRows';

interface RequestDrawerProps {
  /** Identyfikator OSOBY - kandydat kodu pilota jeszcze nie ma. */
  pilotId: string;
  /** `null` = kolejka jeszcze nie przyszła; pusta tablica = przyszła i jest pusta. */
  queue: MembershipRequestDto[] | null;
  queuePending: boolean;
  onClose: () => void;
}

export function RequestDrawer({ pilotId, queue, queuePending, onClose }: RequestDrawerProps) {
  const request = queue?.find((item) => item.pilotId === pilotId) ?? null;

  const [draft, setDraft] = useState<RequestDraft>(EMPTY_REQUEST);
  const [step, setStep] = useState<RequestStep>('approve');
  const [outcome, setOutcome] = useState<string | null>(null);

  const approve = useApproveMembership();
  const reject = useRejectMembership();
  const reopen = useReopenMembership();

  const pending = approve.isPending || reject.isPending || reopen.isPending;
  const error = approve.error ?? reject.error ?? reopen.error;

  const verdict = step === 'reject' ? rejectVerdict(draft) : approveVerdict(draft);
  const field = conflictField(error);
  const conflict = field === 'code' ? 'Ten kod pilota jest już zajęty w tym klubie.' : null;
  const generalError = error == null || conflict != null ? null : errorMessage(error);

  const row = request == null ? null : requestRow(request);

  const decide = (): void => {
    if (request == null) return;
    if (step === 'reject') {
      reject.mutate(
        { pilotId: request.pilotId, reason: draft.reason.trim() },
        {
          onSuccess: () => {
            setStep('decided');
            setOutcome(`Zgłoszenie odrzucone. Powód: ${draft.reason.trim()}`);
          },
        },
      );
      return;
    }
    approve.mutate(
      { pilotId: request.pilotId, body: approvalBodyOf(draft) },
      {
        onSuccess: (change) => {
          setStep('decided');
          setOutcome(
            `${change.pilot.name} jest w klubie jako ${change.pilot.code} (${roleLabel(change.pilot.role).toLowerCase()}). Kod i rolę zmienisz na jego karcie.`,
          );
        },
      },
    );
  };

  return (
    <Drawer
      title={row?.name ?? 'Zgłoszenie'}
      sub={
        row == null ? (
          'Zgłoszenie spoza kolejki'
        ) : (
          <>
            {row.email}
            {step === 'decided' ? null : (
              <Pill tone="amber">Zgłosił się kodem klubu · czeka od {row.waiting}</Pill>
            )}
          </>
        )
      }
      onClose={onClose}
      footer={
        step === 'decided' ? (
          <Button variant="primary" onClick={onClose}>
            Zamknij
          </Button>
        ) : step === 'reject' ? (
          <>
            {/* „Wróć" prowadzi do formularza przyjęcia, nie zamyka szuflady: odrzucenie
                jest KROKIEM, a nie osobnym ekranem. */}
            <Button variant="ghost" onClick={() => setStep('approve')} disabled={pending}>
              Wróć
            </Button>
            <Button
              variant="danger"
              onClick={decide}
              disabled={pending || !verdict.complete || verdict.blocker != null}
              reason={verdict.blocker ?? undefined}
            >
              {pending ? 'Zapisuję…' : 'Odrzuć zgłoszenie'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" onClick={() => setStep('reject')} disabled={pending}>
              Odrzuć
            </Button>
            <Button
              variant="primary"
              onClick={decide}
              disabled={pending || !verdict.complete || verdict.blocker != null || request == null}
              reason={verdict.blocker ?? undefined}
            >
              {pending ? 'Zapisuję…' : 'Zatwierdź i przyjmij do klubu'}
            </Button>
          </>
        )
      }
    >
      {/* Zgłoszenie spoza kolejki: wklejony link do sprawy, którą ktoś już rozstrzygnął
          albo która nigdy nie istniała. */}
      {request == null && !queuePending ? (
        <Card title="Nie ma go w kolejce">
          <p className="hint">
            To zgłoszenie jest już rozstrzygnięte albo nigdy nie czekało.{' '}
            <Link to="/piloci">Wróć do listy</Link>
          </p>
        </Card>
      ) : null}

      {generalError == null ? null : (
        <Banner tone="danger" live>
          {generalError}
        </Banner>
      )}

      {step === 'decided' ? (
        <DecidedCard
          approved={approve.isSuccess}
          text={outcome}
          reopenPending={reopen.isPending}
          onReopen={
            reject.isSuccess && request != null
              ? () =>
                  reopen.mutate(request.pilotId, {
                    onSuccess: () => setOutcome('Zgłoszenie wróciło do kolejki i czeka na decyzję.'),
                  })
              : null
          }
        />
      ) : (
        <>
          {/* OSOBA jest do odczytu w całości: imię i adres podał Google, a osoba istnieje
              na serwerze od swojego pierwszego logowania. Decyzja dotyczy CZŁONKOSTWA. */}
          <Card title="Osoba">
            <div className="access-row">
              <span className="kv-k">Imię u Google</span>
              <span>{row?.name}</span>
            </div>
            <div className="access-row">
              <span className="kv-k">E-mail</span>
              <span className="mono">{row?.email}</span>
            </div>
            <div className="access-row">
              <span className="kv-k">Zgłoszono</span>
              <span className="mono">{row?.waiting}</span>
            </div>
          </Card>

          {step === 'reject' ? (
            <Card title="Powód odrzucenia">
              <Field
                htmlFor="reason"
                label="Powód"
                hint="Ten tekst zobaczy zgłaszający na swoim telefonie - napisz, co ma zrobić dalej."
              >
                <TextInput
                  id="reason"
                  value={draft.reason}
                  placeholder="np. zgłoś się adresem klubowym podanym przy zapisie na kurs"
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                />
              </Field>
            </Card>
          ) : (
            <>
              <Card title="W tym klubie">
                <Field
                  htmlFor="request-code"
                  label="Kod pilota"
                  hint="Krótki skrót przy każdym locie. Jedyny w tym klubie - w innym klubie ta osoba może mieć inny."
                >
                  <TextInput
                    id="request-code"
                    mono
                    value={draft.code}
                    placeholder="np. MSO"
                    invalid={verdict.invalidCode || field === 'code'}
                    onChange={(event) =>
                      setDraft({ ...draft, code: normalizeCode(event.target.value) })
                    }
                  />
                </Field>
                {conflict == null ? null : <p className="hint danger">{conflict}</p>}
              </Card>

              <Card title="Rola w klubie">
                <div className="opt-list" role="radiogroup" aria-label="Rola w klubie">
                  {ROLE_ORDER.map((role) => (
                    <OptionButton
                      key={role}
                      name={roleLabel(role)}
                      desc={roleNote(role)}
                      selected={draft.role === role}
                      onSelect={() => setDraft({ ...draft, role })}
                    />
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}

/**
 * Po decyzji: JEDNO zdanie i plakietka. Przy odrzuceniu dochodzi „Cofnij odrzucenie" -
 * osobna akcja, bo zdjęcie odmowy nie jest wpuszczeniem do klubu: zgłoszenie wraca do
 * kolejki, a kod i rolę nadaje się dopiero potem.
 */
function DecidedCard({
  approved,
  text,
  reopenPending,
  onReopen,
}: {
  approved: boolean;
  text: string | null;
  reopenPending: boolean;
  onReopen: (() => void) | null;
}) {
  return (
    <Card
      title="Decyzja"
      actions={
        approved ? (
          <Pill tone="green" dot>
            Przyjęty
          </Pill>
        ) : (
          <Pill tone="amber">Odrzucony</Pill>
        )
      }
    >
      <span className="hint">{text}</span>
      {onReopen == null ? null : (
        <div className="access-row">
          <span className="kv-k">Cofnięcie decyzji</span>
          <Button size="sm" disabled={reopenPending} onClick={onReopen}>
            Cofnij odrzucenie
          </Button>
        </div>
      )}
    </Card>
  );
}
