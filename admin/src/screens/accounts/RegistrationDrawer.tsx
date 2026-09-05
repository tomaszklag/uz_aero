/**
 * UZ Aero - panel 2.0: karta ZGŁOSZENIA rejestracyjnego (`#/piloci/zgloszenia/:subject`).
 *
 * Trzy sekcje i decyzja: kim jest u Google, kim będzie w klubie (kod, imię), co mu
 * wolno (rola) - i dwa przyciski, z których żaden nie jest domyślny. Zatwierdzenie
 * ZAKŁADA konto, więc formularz jest formularzem konta bez e-maila: adres to tożsamość
 * Google i administrator go nie wpisuje (`docs/logowanie-google.md` §8).
 *
 * == ODRZUCENIE WYMAGA POWODU I MOWI, KTO GO PRZECZYTA ==
 * Powód trafia na ekran telefonu tej osoby (`00d`) - stąd pole jest obowiązkowe,
 * a podpowiedź mówi wprost, że pisze się do zgłaszającego, nie do dziennika.
 *
 * == PO DECYZJI KARTA ZAMIENIA SIĘ W PODSUMOWANIE ==
 * Formularz pod spodem obiecywałby drugą decyzję, a ta odbiłaby się o `already_decided`.
 * Zostaje jedno zdanie i wyjście - jak przy założeniu konta w `AccountDrawer`.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { RegistrationDto } from '../../api/dto';
import { useApproveRegistration, useRejectRegistration } from '../../queries/useRegistrationCommands';
import { Banner, Button, Card, Drawer, Field, OptionButton, Pill, TextInput } from '../../ui/components';
import { conflictField, errorMessage } from '../common/apiMessage';
import { normalizeCode } from './accountForm';
import { roleLabel, roleNote, ROLE_ORDER } from './accountRows';
import {
  approveBodyOf,
  registrationDraftOf,
  registrationVerdictOf,
  type RegistrationDraft,
} from './registrationForm';
import { registrationRefusalMessage, registrationRow } from './registrationRows';

interface RegistrationDrawerProps {
  subject: string;
  /** `null` = kolejka jeszcze nie przyszła; pusta tablica = przyszła i jest pusta. */
  registrations: RegistrationDto[] | null;
  listPending: boolean;
  onClose: () => void;
}

const EMPTY_DRAFT: RegistrationDraft = { code: '', name: '', role: 'pilot' };

export function RegistrationDrawer({
  subject,
  registrations,
  listPending,
  onClose,
}: RegistrationDrawerProps) {
  const registration = registrations?.find((item) => item.subject === subject) ?? null;

  const [draft, setDraft] = useState<RegistrationDraft>(EMPTY_DRAFT);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  /** Decyzja zapadła: karta pokazuje wyłącznie jej skutek i wyjście. */
  const [decided, setDecided] = useState<string | null>(null);

  // Szkic przestawia się DOKŁADNIE wtedy, gdy zmienia się tożsamość zgłoszenia -
  // także przy PIERWSZYM pojawieniu się (wejście z linku montuje kartę przed listą).
  // Odświeżenie kolejki po decyzji klucza nie zmienia, więc nie kasuje wpisanego kodu.
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (registration == null || synced.current === registration.subject) return;
    synced.current = registration.subject;
    setDraft(registrationDraftOf(registration));
    setRejecting(false);
    setReason('');
    setDecided(null);
  }, [registration]);

  const approve = useApproveRegistration();
  const reject = useRejectRegistration();
  const pending = approve.isPending || reject.isPending;
  const error = approve.error ?? reject.error;

  const verdict = registrationVerdictOf(draft);
  const field = conflictField(error);
  const refusal = registrationRefusalMessage(error);
  // Odmowa ze znanym powodem ma SWOJE zdanie, więc zdanie ogólne zostaje dla reszty -
  // inaczej karta mówiłaby to samo dwa razy.
  const generalError = error == null || refusal != null ? null : errorMessage(error);

  const row = registration == null ? null : registrationRow(registration);
  const title = (registration?.name ?? 'ZGŁOSZENIE').toUpperCase();

  if (decided != null) {
    return (
      <Drawer
        title={title}
        sub={row?.email ?? ''}
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose}>
            Zamknij
          </Button>
        }
      >
        <Banner tone="ok" live>
          {decided}
        </Banner>
      </Drawer>
    );
  }

  const doApprove = (): void => {
    if (registration == null) return;
    approve.mutate(
      { provider: registration.provider, subject: registration.subject, body: approveBodyOf(draft) },
      {
        onSuccess: (result) =>
          setDecided(
            `Konto ${result.pilot.code} założone. ${result.pilot.name} wchodzi do aplikacji kontem Google ${registration.email}.`,
          ),
      },
    );
  };

  const doReject = (): void => {
    if (registration == null) return;
    reject.mutate(
      { provider: registration.provider, subject: registration.subject, reason: reason.trim() },
      { onSuccess: () => setDecided('Zgłoszenie odrzucone. Zgłaszający zobaczy podany powód.') },
    );
  };

  return (
    <Drawer
      title={title}
      sub={
        row == null ? (
          ''
        ) : (
          <>
            {row.email}
            <Pill tone="amber">czeka od {row.sinceLabel}</Pill>
          </>
        )
      }
      onClose={onClose}
      footer={
        registration == null ? undefined : rejecting ? (
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Wróć
            </Button>
            <Button
              variant="danger"
              onClick={doReject}
              disabled={pending || reason.trim() === ''}
            >
              {reject.isPending ? 'Odrzucam…' : 'Odrzuć zgłoszenie'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Anuluj
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => setRejecting(true)}>
              Odrzuć
            </Button>
            <Button
              variant="primary"
              onClick={doApprove}
              disabled={pending || !verdict.complete}
            >
              {approve.isPending ? 'Zakładam konto…' : 'Zatwierdź i załóż konto'}
            </Button>
          </>
        )
      }
    >
      {/* Zgłoszenie spoza kolejki: wklejony link do czegoś, co ma już decyzję. */}
      {registration == null && !listPending ? (
        <Card title="Nie ma go w kolejce">
          <p className="hint">
            To zgłoszenie ma już decyzję albo nie istnieje.{' '}
            <Link to="/piloci">Wróć do listy</Link>
          </p>
        </Card>
      ) : null}

      {generalError == null ? null : (
        <Banner tone="danger" live>
          {generalError}
        </Banner>
      )}
      {refusal == null ? null : (
        <Banner tone="warn" live>
          {refusal}
        </Banner>
      )}

      {row == null ? null : (
        <Card title="Konto Google">
          <div className="access-row">
            <span className="kv-k">Imię u Google</span>
            <span>{row.name}</span>
          </div>
          <div className="access-row">
            <span className="kv-k">E-mail</span>
            <span className="mono">{row.email}</span>
          </div>
          <div className="access-row">
            <span className="kv-k">Zgłoszono</span>
            <span className="mono">{row.sinceLabel}</span>
          </div>
        </Card>
      )}

      {registration == null ? null : rejecting ? (
        <Card title="Powód odrzucenia">
          <Field
            htmlFor="reason"
            label="Powód"
            hint="Ten tekst zobaczy zgłaszający na swoim telefonie - napisz, co ma zrobić dalej."
          >
            <TextInput
              id="reason"
              value={reason}
              autoFocus
              placeholder="np. zgłoś się adresem klubowym podanym przy zapisie na kurs"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </Card>
      ) : (
        <>
          <Card title="Dane pilota">
            <Field htmlFor="name" label="Imię i nazwisko">
              <TextInput
                id="name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>

            <Field
              htmlFor="code"
              label="Kod pilota"
              hint="Krótki skrót przy każdym locie, np. TMK. Podpowiedziany z inicjałów."
            >
              <TextInput
                id="code"
                mono
                value={draft.code}
                invalid={verdict.invalid.includes('code') || field === 'code'}
                onChange={(event) => setDraft({ ...draft, code: normalizeCode(event.target.value) })}
              />
            </Field>
          </Card>

          <Card title="Rola">
            <div className="opt-list" role="radiogroup" aria-label="Rola konta">
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
    </Drawer>
  );
}
