/**
 * Ninerdeck - panel: SZUFLADA ZLECENIA - widok prowadzącego (makieta `zlecenia-szczegoly`,
 * ZL3, ZL3c; 4.0.0, epik Z-D #248).
 *
 * Treść liczy `leaderCard.ts`; ten plik ją rysuje i wysyła trzy czynności: przydział
 * („Wybierz", „Na dowódcę"), „Wyślij ponownie" i odwołanie. Każda oddaje świeżą kartę,
 * a sygnał `order:<id>` kanału klubu odświeża szufladę także po cudzych zmianach.
 *
 * ══ FOTEL = KARTA, ADRESACI = JEJ WIERSZE ══
 * Tytuł karty mówi, JAK fotel zaadresowano (imiennie / nazwą grupy), a plakietka po prawej -
 * ile osób MOŻE, czyli liczbę, na którą prowadzący czeka. „Wybierz" stoi WYŁĄCZNIE przy
 * „Może lecieć" - przy innych odpowiedziach nie ma kogo wybierać, a wyszarzony przycisk
 * obiecywałby akcję, której reguły nie dopuszczą. Obramowany zielenią (`.btn.ok`), nie
 * wypełniony: w karcie stoi ich kilka naraz, a akcja główna jest jedna.
 *
 * ══ ODWOŁANIE NA KOŃCU, CZERWONĄ KARTĄ ══
 * Jedyna czynność, która coś niszczy - stoi osobno, jak odwołanie rezerwacji (K2), z powodem
 * opcjonalnym (decyzja 16): przycisk działa od razu, a zdanie, jeśli jest, adresaci
 * przeczytają w wiadomości.
 */

import { useState } from 'react';

import type { OrderCardDto } from '../../api/dto';
import { useAssignOrder, useCancelOrder, useResendOrder } from '../../queries/useOrders';
import { Button, Card, Drawer, Field, Pill, TextInput } from '../../ui/components';
import type { PersonLookup } from '../calendar/bookingLabels';
import { leaderCard, type CrewSeatVm, type LeaderRowVm, type StatusPart } from './leaderCard';
import type { HistoryRowVm } from './orderHistory';
import { orderErrorMessage } from './orderRefusal';

interface Props {
  card: OrderCardDto;
  orderId: string;
  viewerId: string | null;
  person: PersonLookup;
  aircraft: (aircraftId: string) => { reg: string; type: string } | null;
  onClose: () => void;
}

export function LeaderDrawer({ card, orderId, viewerId, person, aircraft, onClose }: Props) {
  const vm = leaderCard({ card, now: Date.now(), viewerId, person, aircraft });
  const assign = useAssignOrder(orderId);
  const resend = useResendOrder(orderId);
  const cancel = useCancelOrder(orderId);
  const [reason, setReason] = useState('');
  const [othersOpen, setOthersOpen] = useState(false);
  const busy = assign.isPending || resend.isPending || cancel.isPending;
  const failure = assign.error ?? resend.error;

  if (vm == null) return null;

  const pick = (pilotId: string, seat: LeaderRowVm['picks'][number]['seat']): void => {
    assign.mutate({ pilotId, seat });
  };

  return (
    <Drawer
      title={vm.title}
      sub={
        <>
          <Pill tone={vm.pill.tone}>{vm.pill.text}</Pill> {vm.sub}
        </>
      }
      onClose={onClose}
      footer={
        vm.resend == null ? undefined : (
          <>
            {vm.resend.note == null ? null : <span className="drawer-note">{vm.resend.note}</span>}
            <Button variant="ghost" onClick={() => resend.mutate(undefined)} disabled={busy}>
              {resend.isPending ? 'Wysyłam…' : 'Wyślij ponownie'}
            </Button>
          </>
        )
      }
    >
      {failure == null ? null : <p className="card-note danger">{orderErrorMessage(failure, card.timezone, person)}</p>}

      {vm.crew == null ? null : (
        <Card title="Załoga">
          <div className="rcp-list">
            {vm.crew.map((seat) => (
              <CrewRow key={seat.seat} seat={seat} />
            ))}
          </div>
        </Card>
      )}

      {vm.blocks.map((block) => (
        <Card key={block.key} title={block.title} actions={block.count == null ? undefined : <Pill tone="green">{block.count}</Pill>}>
          <div className="rcp-list">
            {block.rows.map((row) => (
              <RecipientRow key={`${block.key}-${row.pilotId}`} row={row} busy={busy} onPick={(seat) => pick(row.pilotId, seat)} />
            ))}
          </div>
        </Card>
      ))}

      {vm.others == null ? null : (
        <Card>
          <button type="button" className="fold-btn" aria-expanded={othersOpen} onClick={() => setOthersOpen((open) => !open)}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            {othersOpen ? vm.others.openLabel : vm.others.label}
          </button>
          {othersOpen ? (
            <div className="rcp-list">
              {vm.others.rows.map((row) => (
                <RecipientRow key={`others-${row.pilotId}`} row={row} busy={busy} onPick={() => undefined} />
              ))}
            </div>
          ) : null}
        </Card>
      )}

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
      </Card>

      {vm.history.length === 0 ? null : (
        <Card title="Historia zmian">
          <div className="hist">
            {vm.history.map((row) => (
              <HistoryItem key={row.id} row={row} />
            ))}
          </div>
        </Card>
      )}

      {!vm.cancellable ? null : (
        <Card title="Odwołanie zlecenia" tone="danger">
          <p className="card-note">Termin wróci do puli, a adresaci bez odmowy dostaną wiadomość „Zlecenie odwołane".</p>
          <Field htmlFor="order-cancel-reason" label="Powód" action={<span className="pill dim">opcjonalne</span>}>
            <TextInput
              id="order-cancel-reason"
              value={reason}
              maxLength={500}
              placeholder="Np. prognoza - front od zachodu"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {cancel.error == null ? null : (
            <p className="card-note danger">{orderErrorMessage(cancel.error, card.timezone, person)}</p>
          )}
          <Button variant="danger" onClick={() => cancel.mutate(reason.trim() === '' ? null : reason.trim())} disabled={busy}>
            {cancel.isPending ? 'Odwołuję…' : 'Odwołaj zlecenie'}
          </Button>
        </Card>
      )}
    </Drawer>
  );
}

function StatusLine({ part }: { part: StatusPart }) {
  return <span className={part.tone == null ? 'rcp-status' : `rcp-status ${part.tone}`}>{part.text}</span>;
}

function RecipientRow({ row, busy, onPick }: { row: LeaderRowVm; busy: boolean; onPick: (seat: LeaderRowVm['picks'][number]['seat']) => void }) {
  return (
    <div className={row.muted ? 'rcp muted' : 'rcp'}>
      <span className="rcp-body">
        <span className="rcp-name">
          {row.name}
          {row.code == null ? null : <span className="rcp-code">{row.code}</span>}
        </span>
        {row.status.map((part) => (
          <StatusLine key={part.text} part={part} />
        ))}
        {row.warn.map((text) => (
          <span key={text} className="rcp-status warn">
            {text}
          </span>
        ))}
        {row.also == null ? null : <span className="rcp-status blue">{row.also}</span>}
        {row.reason == null ? null : <span className="rcp-reason">{row.reason}</span>}
      </span>
      {row.picks.length === 0 ? null : (
        <span className="rcp-actions">
          {row.picks.map((p) => (
            <Button key={p.seat} variant="ok" size="sm" onClick={() => onPick(p.seat)} disabled={busy}>
              {p.label}
            </Button>
          ))}
        </span>
      )}
    </div>
  );
}

function CrewRow({ seat }: { seat: CrewSeatVm }) {
  return (
    <div className={seat.asking ? 'rcp open' : 'rcp'}>
      <span className="rcp-seat">{seat.label}</span>
      <span className="rcp-body">
        <span className="rcp-name">
          {seat.name == null ? (
            <Pill tone={seat.asking ? 'blue' : 'dim'}>Szukany</Pill>
          ) : (
            <>
              {seat.name}
              {seat.code == null ? null : <span className="rcp-code">{seat.code}</span>}
            </>
          )}
        </span>
        {seat.status.map((part) => (
          <StatusLine key={part.text} part={part} />
        ))}
      </span>
    </div>
  );
}

function HistoryItem({ row }: { row: HistoryRowVm }) {
  const dot = row.void ? 'hist-dot void' : row.origin ? 'hist-dot origin' : 'hist-dot';
  return (
    <div className="hist-item">
      <span className="hist-rail">
        <span className={dot} />
      </span>
      <div className="hist-body">
        <span className="hist-when">{row.when}</span>
        {row.verdict == null ? null : <span className={row.void ? 'hist-verdict void' : 'hist-verdict'}>{row.verdict}</span>}
        {row.changes.map((change) => (
          <span key={change.field} className="hist-change">
            <span className="hist-field">{change.field}</span>
            {change.from == null || change.to == null ? (
              <span>zmieniony</span>
            ) : (
              <>
                <span className="hist-from">{change.from}</span>
                <span className="hist-arrow">→</span>
                <span>{change.to}</span>
              </>
            )}
          </span>
        ))}
        {row.who == null ? null : <span className="hist-who">{row.who}</span>}
        {row.reason == null ? null : <span className="hist-reason">„{row.reason}"</span>}
      </div>
    </div>
  );
}
