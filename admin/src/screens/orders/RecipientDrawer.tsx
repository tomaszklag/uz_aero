/**
 * Ninerdeck - panel: SZUFLADA ZLECENIA - widok adresata (makieta `zlecenia-szczegoly`, ZL3a,
 * ZL3d; 4.0.0, epik Z-D #248).
 *
 * Treść liczy `recipientCard.ts`; ten plik ją rysuje i wysyła odpowiedź. Otwarcie szuflady
 * zapisuje „Odczytane" u prowadzących (pkt 17) - ekran o tym nie mówi, bo to skutek patrzenia,
 * nie czynność.
 *
 * ══ STOPKA = ODPOWIEDŹ ══
 * „Przyjmuję" (imiennie - obsadza fotel od razu, zieleń, akcja główna) albo „Mogę lecieć"
 * (zgłoszenie) i „Nie mogę" - neutralne, nie czerwone: odmowa nikomu niczego nie zabiera.
 * Obie w pierwszej osobie, bez formy z płcią; zdanie obok mówi skutek przed kliknięciem.
 * „Nie mogę" zamienia stopkę na „Wróć" + „Nie mogę", a nad nią staje pole powodu -
 * opcjonalnego (pkt 16), więc przycisk działa od razu.
 *
 * ══ PO ODPOWIEDZI SZUFLADA SIĘ NIE ZAMYKA ══
 * Plakietka przechodzi na „Zgłoszone" albo „Nie mogę", a odpowiedź dostaje godzinę.
 * Wyjątkiem jest przyjęcie fotela imiennego: lot jest odtąd rezerwacją (§14.3), więc
 * szuflada przechodzi do kalendarza (`onBooking`).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { OrderCardDto } from '../../api/dto';
import { useAnswerOrder, useMarkOrderSeen } from '../../queries/useOrders';
import { Banner, Button, Card, Drawer, Field, Pill } from '../../ui/components';
import { ChatIcon } from '../../ui/components/icons';
import type { PersonLookup } from '../calendar/bookingLabels';
import { orderErrorMessage } from './orderRefusal';
import { recipientCard, type AnswerVm, type CrewLineVm, type EditedVm, type OutcomeVm } from './recipientCard';

interface Props {
  card: OrderCardDto;
  orderId: string;
  person: PersonLookup;
  aircraft: (aircraftId: string) => { reg: string; type: string } | null;
  /** Adres rozmowy z osobą zlecającą (szuflada nad tą samą listą). */
  threadHref: string;
  onClose: () => void;
  /** Przyjęcie obsadziło fotel - lot jest rezerwacją, szuflada przechodzi do kalendarza. */
  onBooking: (bookingId: string) => void;
}

const REASON_ID = 'order-decline-reason';

export function RecipientDrawer({ card, orderId, person, aircraft, threadHref, onClose, onBooking }: Props) {
  const vm = recipientCard({ card, now: Date.now(), person, aircraft });
  const answer = useAnswerOrder(orderId);
  const seen = useMarkOrderSeen(orderId);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const marked = useRef<string | null>(null);
  const inPlay = card.viewer.recipient?.inPlay === true;

  // Odczyt raz na otwarcie zlecenia - nie przy każdym odświeżeniu karty kanałem klubu.
  useEffect(() => {
    if (!inPlay || marked.current === orderId) return;
    marked.current = orderId;
    seen.mutate();
  }, [orderId, inPlay, seen]);

  useEffect(() => {
    if (declining) document.getElementById(REASON_ID)?.focus();
  }, [declining]);

  if (vm == null) return null;

  const respond = (value: 'yes' | 'no'): void => {
    const why = value === 'no' && reason.trim() !== '' ? reason.trim() : null;
    answer.mutate(
      { answer: value, reason: why },
      {
        onSuccess: (result) => {
          setDeclining(false);
          setReason('');
          if (result.outcome.kind === 'assigned') onBooking(card.booking.id);
        },
      },
    );
  };

  const busy = answer.isPending;
  const primaryLabel = vm.primary === 'accept' ? 'Przyjmuję' : 'Mogę lecieć';

  const footer =
    vm.note == null ? undefined : declining ? (
      <>
        <Button variant="ghost" onClick={() => setDeclining(false)} disabled={busy}>
          Wróć
        </Button>
        <Button onClick={() => respond('no')} disabled={busy}>
          Nie mogę
        </Button>
      </>
    ) : (
      <>
        <span className="drawer-note">{vm.note}</span>
        {vm.decline ? (
          <Button onClick={() => setDeclining(true)} disabled={busy}>
            Nie mogę
          </Button>
        ) : null}
        {vm.primary == null ? null : (
          <Button variant="primary" onClick={() => respond('yes')} disabled={busy}>
            {primaryLabel}
          </Button>
        )}
      </>
    );

  const clash =
    vm.clash == null ? null : (
      <p className="hint">
        <b>W tym czasie masz rezerwację</b> · <span className="mono">{vm.clash}</span>
      </p>
    );

  return (
    <Drawer
      title={vm.title}
      sub={
        <>
          <Pill tone={vm.pill.tone}>{vm.pill.text}</Pill> {vm.sub}
        </>
      }
      onClose={onClose}
      footer={footer}
    >
      {answer.error == null ? null : <p className="card-note danger">{orderErrorMessage(answer.error, card.timezone, person)}</p>}

      {vm.outcome == null ? null : <Outcome outcome={vm.outcome} />}

      {vm.crew == null ? null : (
        <Card title="Załoga">
          {vm.crew.map((line) => (
            <CrewLine key={line.label} line={line} />
          ))}
        </Card>
      )}

      {vm.answer == null ? clash : <AnswerCard answer={vm.answer}>{clash}</AnswerCard>}

      <Card title="Zlecenie">
        {vm.details.map((row) => (
          <div className="kv" key={row.label}>
            <span className="kv-k">{row.label}</span>
            <span className="kv-v">
              {row.value}
              {row.sub == null ? null : <span className="cell-sub">{row.sub}</span>}
            </span>
          </div>
        ))}
        {vm.edited == null ? null : <EditedLine edited={vm.edited} />}
      </Card>

      {vm.thread == null ? null : (
        // Rozmowa to wiersz prowadzący dalej, a nie trzeci przycisk w stopce: akcją główną
        // jest odpowiedź.
        <Card title="Rozmowa">
          <div className="todo-list">
            <Link className="todo-row" to={threadHref}>
              <span className={vm.thread.readOnly ? 'todo-icon' : 'todo-icon blue'} aria-hidden="true">
                <ChatIcon size={15} />
              </span>
              <span className="todo-body">
                <span className="todo-title">{vm.thread.title}</span>
                <span className="todo-meta">{vm.thread.sub}</span>
              </span>
              <span className="todo-go" aria-hidden="true">
                ›
              </span>
            </Link>
          </div>
        </Card>
      )}

      {!declining ? null : (
        <Card title="Odpowiedź">
          <Field htmlFor={REASON_ID} label="Powód" action={<span className="pill dim">opcjonalne</span>}>
            <textarea
              id={REASON_ID}
              className="input area"
              rows={2}
              maxLength={500}
              value={reason}
              placeholder="Np. w sobotę mam dyżur, ale w niedzielę mogę."
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </Card>
      )}
    </Drawer>
  );
}

function Outcome({ outcome }: { outcome: OutcomeVm }) {
  if (outcome.kind === 'cancelled') {
    // Odwołanie skasowało zlecenie - czerwony baner z powodem jako cytatem (pkt 16).
    return (
      <Banner tone="danger">
        <b>{outcome.title}</b>
        {outcome.meta == null ? null : ` · ${outcome.meta}`}
        {outcome.quote == null ? null : (
          <>
            <br />
            {outcome.quote}
          </>
        )}
      </Banner>
    );
  }
  const note = outcome.text ?? outcome.meta;
  return (
    <Card title={outcome.title}>
      {note == null ? null : <p className="card-note">{note}</p>}
      {outcome.quote == null ? null : <p className="rcp-reason">{outcome.quote}</p>}
    </Card>
  );
}

function CrewLine({ line }: { line: CrewLineVm }) {
  return (
    <div className={line.you ? 'kv you' : 'kv'}>
      <span className="kv-k">{line.label}</span>
      <span className="kv-v">
        {line.sought ? <span className="was">szukany</span> : line.value}
        {line.tag == null ? null : (
          <>
            {line.value == null ? null : ' '}
            <Pill tone="blue">{line.tag}</Pill>
          </>
        )}
      </span>
    </div>
  );
}

function AnswerCard({ answer, children }: { answer: AnswerVm; children: ReactNode }) {
  return (
    <Card>
      <div className="kv">
        <span className="kv-k">Twoja odpowiedź</span>
        <span className="kv-v">
          {answer.old ? <s className="was">{answer.value}</s> : answer.value}
          <span className="cell-sub">{answer.sub}</span>
        </span>
      </div>
      {answer.quote == null ? null : <p className="rcp-reason">{answer.quote}</p>}
      {children}
    </Card>
  );
}

function EditedLine({ edited }: { edited: EditedVm }) {
  // „Termin zmieniony" nazywa pole sam - przy parze godzin nazwy pola już nie powtarzamy.
  const named = edited.label === 'Edytowane';
  return (
    <div className="kv">
      <span className="kv-k">{edited.label}</span>
      <span className="kv-v">
        {edited.when} ·{' '}
        {edited.changes.map((change, i) => (
          <span key={change.field}>
            {i === 0 ? null : ', '}
            {named ? `${change.field}${change.from == null || change.to == null ? '' : ' '}` : null}
            {change.from == null || change.to == null ? null : (
              <>
                <span className="was">{change.from}</span> → {change.to}
              </>
            )}
          </span>
        ))}
      </span>
    </div>
  );
}
