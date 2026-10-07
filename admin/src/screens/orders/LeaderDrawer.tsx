/**
 * Ninerdeck - panel: SZUFLADA ZLECENIA - widok prowadzącego (makieta `zlecenia-szczegoly`,
 * ZL3, ZL3c; 4.0.0, epik Z-D #248).
 *
 * Treść liczy `leaderCard.ts`; ten plik ją rysuje i wysyła czynności: przydział („Wybierz",
 * „Na dowódcę"), menu ⋯ przy adresacie (zamiana osoby, odebranie zlecenia, cofnięcie
 * przydziału - ZL3b), „Wyślij ponownie" i odwołanie. Każda oddaje świeżą kartę, a sygnał
 * `order:<id>` kanału klubu odświeża szufladę także po cudzych zmianach.
 *
 * ══ CZYNNOŚĆ Z MENU PYTA W MIEJSCU WIERSZA ══
 * Wybór z „⋯" niczego nie zapisuje: pod wierszem staje pytanie (odebranie, cofnięcie) albo
 * formularz zamiany, ze skutkiem PRZED kliknięciem i opcjonalnym powodem. Otwarte jest
 * jedno naraz - kolejny wybór zastępuje poprzedni, a udany zapis je zamyka. Ta sama osoba
 * bywa przy dwóch fotelach (termin do potwierdzenia), więc pytanie przypina się do WIERSZA
 * (fotel + osoba), nie do osoby.
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

import { Fragment, useState, type ReactNode } from 'react';

import type { DirectoryMemberDto, OrderCardDto } from '../../api/dto';
import {
  useAssignOrder,
  useCancelOrder,
  useRemoveRecipient,
  useResendOrder,
  useSwapRecipient,
  useUnassignOrder,
} from '../../queries/useOrders';
import { Button, Card, Drawer, Field, Pill, TextInput } from '../../ui/components';
import type { PersonLookup } from '../calendar/bookingLabels';
import { leaderCard, type CrewSeatVm, type LeaderRowVm, type StatusPart } from './leaderCard';
import type { HistoryRowVm } from './orderHistory';
import { orderErrorMessage } from './orderRefusal';
import { RecipientConfirm } from './RecipientConfirm';
import { confirmCopy, crewMenu, rowMenu, swapHint, swapOptions, type RecipientAction } from './recipientMenu';
import { RowMenu } from './RowMenu';
import { SwapForm } from './SwapForm';

interface Props {
  card: OrderCardDto;
  orderId: string;
  viewerId: string | null;
  person: PersonLookup;
  aircraft: (aircraftId: string) => { reg: string; type: string } | null;
  /** Członkowie klubu ze słownika - kandydaci do zamiany osoby. */
  members: readonly DirectoryMemberDto[];
  onClose: () => void;
}

/** Czynność z menu ⋯ otwarta pod wierszem `at` (fotel albo lista + osoba). */
interface Pending {
  at: string;
  name: string;
  action: RecipientAction;
}

export function LeaderDrawer({ card, orderId, viewerId, person, aircraft, members, onClose }: Props) {
  const vm = leaderCard({ card, now: Date.now(), viewerId, person, aircraft });
  const assign = useAssignOrder(orderId);
  const resend = useResendOrder(orderId);
  const cancel = useCancelOrder(orderId);
  const remove = useRemoveRecipient(orderId);
  const swap = useSwapRecipient(orderId);
  const unassign = useUnassignOrder(orderId);
  const [reason, setReason] = useState('');
  const [othersOpen, setOthersOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [swapPick, setSwapPick] = useState('');
  const busy = assign.isPending || resend.isPending || cancel.isPending || remove.isPending || swap.isPending || unassign.isPending;
  const failure = assign.error ?? resend.error;
  const actionError = remove.error ?? swap.error ?? unassign.error;

  if (vm == null) return null;

  const pick = (pilotId: string, seat: LeaderRowVm['picks'][number]['seat']): void => {
    assign.mutate({ pilotId, seat });
  };

  const startAction = (at: string, name: string, action: RecipientAction): void => {
    remove.reset();
    swap.reset();
    unassign.reset();
    setActionReason('');
    setSwapPick('');
    setPending({ at, name, action });
  };

  const runAction = (action: RecipientAction): void => {
    const why = actionReason.trim() === '' ? null : actionReason.trim();
    const done = { onSuccess: () => setPending(null) };
    if (action.kind === 'remove') remove.mutate({ pilotId: action.pilotId, reason: why }, done);
    else if (action.kind === 'unassign') unassign.mutate({ seat: action.seat, reason: why }, done);
    else if (swapPick !== '') swap.mutate({ seat: action.seat, outgoing: action.pilotId, incoming: swapPick, reason: why }, done);
  };

  /** Pytanie albo formularz zamiany pod wierszem `at` - albo nic. */
  const actionPanel = (at: string): ReactNode => {
    if (pending?.at !== at) return null;
    const { action, name } = pending;
    const id = `order-action-${at}`;
    const error = actionError == null ? null : orderErrorMessage(actionError, card.timezone, person);
    if (action.kind === 'swap') {
      const options = swapOptions({ card, seat: action.seat, outgoing: action.pilotId, members });
      const picked = options.find((o) => o.value === swapPick);
      const pickedName = picked == null ? null : (person(picked.value)?.name ?? null);
      return (
        <SwapForm
          id={id}
          options={options}
          pick={swapPick}
          reason={actionReason}
          hint={swapHint(name, picked == null || pickedName == null ? null : { name: pickedName, bothSeats: picked.bothSeats }, action.seat)}
          busy={busy}
          error={error}
          onPick={setSwapPick}
          onReason={setActionReason}
          onCancel={() => setPending(null)}
          onConfirm={() => runAction(action)}
        />
      );
    }
    return (
      <RecipientConfirm
        id={id}
        copy={confirmCopy(action, name)}
        reason={actionReason}
        busy={busy}
        error={error}
        onReason={setActionReason}
        onCancel={() => setPending(null)}
        onConfirm={() => runAction(action)}
      />
    );
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
            {vm.crew.map((seat) => {
              const at = `crew-${seat.seat}`;
              return (
                <Fragment key={seat.seat}>
                  <CrewRow
                    seat={seat}
                    menu={
                      <RowMenu
                        name={seat.name ?? ''}
                        entries={crewMenu(seat)}
                        disabled={busy}
                        onSelect={(action) => startAction(at, seat.name ?? '', action)}
                      />
                    }
                  />
                  {actionPanel(at)}
                </Fragment>
              );
            })}
          </div>
        </Card>
      )}

      {vm.blocks.map((block) => (
        <Card key={block.key} title={block.title} actions={block.count == null ? undefined : <Pill tone="green">{block.count}</Pill>}>
          <div className="rcp-list">
            {block.rows.map((row) => {
              const at = `${block.key}-${row.pilotId}`;
              return (
                <Fragment key={at}>
                  <RecipientRow
                    row={row}
                    busy={busy}
                    onPick={(seat) => pick(row.pilotId, seat)}
                    menu={
                      <RowMenu
                        name={row.name}
                        entries={rowMenu(row)}
                        disabled={busy}
                        onSelect={(action) => startAction(at, row.name, action)}
                      />
                    }
                  />
                  {actionPanel(at)}
                </Fragment>
              );
            })}
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

interface RecipientRowProps {
  row: LeaderRowVm;
  busy: boolean;
  onPick: (seat: LeaderRowVm['picks'][number]['seat']) => void;
  /** „⋯" w kolumnie akcji; zwinięci pozostali adresaci go nie mają. */
  menu?: ReactNode;
}

function RecipientRow({ row, busy, onPick, menu }: RecipientRowProps) {
  const withActions = row.picks.length > 0 || row.menu != null;
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
      {!withActions ? null : (
        <span className="rcp-actions">
          {row.picks.map((p) => (
            <Button key={p.seat} variant="ok" size="sm" onClick={() => onPick(p.seat)} disabled={busy}>
              {p.label}
            </Button>
          ))}
          {row.menu == null ? null : menu}
        </span>
      )}
    </div>
  );
}

function CrewRow({ seat, menu }: { seat: CrewSeatVm; menu: ReactNode }) {
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
      {!seat.unassignable ? null : <span className="rcp-actions">{menu}</span>}
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
