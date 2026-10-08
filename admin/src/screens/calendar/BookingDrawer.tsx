/**
 * Ninerdeck - panel: szuflada JEDNEJ zajętości (`#/kalendarz/:id`, issue #160 D3).
 *
 * Adres własny, bo szuflada opisuje osobny byt - tak jak w module Piloci. Dzięki temu
 * link do konkretnej rezerwacji da się wkleić w rozmowie („zobacz, co stoi we wtorek").
 *
 * ══ TRZY WIDOKI: CUDZA, WYŁĄCZENIE Z UŻYTKU I WŁASNA (K2b, issue #233) ══
 * Odkąd każdy członek rezerwuje z panelu, własny termin ma tu te same akcje, co karta 23
 * w telefonie: „Przesuń i popraw" (przed początkiem) i „Odwołaj" (także trwający) - BEZ
 * pola powodu, bo przy własnym planie nie ma komu tłumaczyć. Zamknięta ma jedno wyjście.
 * Karty „Decyzja za krok" przy własnej sprawie NIE MA: własnej sprawy nie rozstrzyga się
 * samemu, nawet z uprawnieniem.
 *
 * ══ ZAJĘTOŚĆ ZE ZLECENIEM (K2c, 4.0.0) ══
 * Zlecenie JEST rezerwacją z pustym fotelem, więc jego pasek otwiera tę samą szufladę -
 * w kształcie zależnym od widza (`orderBooking.ts`). Szuflada nie powtarza karty zlecenia,
 * tylko prowadzi do niej: „Otwórz zlecenie". Odwołanie z kalendarza jest odwołaniem
 * ZLECENIA (powód opcjonalny), a osoba w fotelu zamiast odwołania ma „Rezygnuję".
 *
 * ══ ODWOŁANIE CUDZEJ WYMAGA POWODU, ALE NIE ZAWSZE ══
 * Pilot czyta powód w aplikacji, więc zdjęcie CUDZEGO planu bez słowa byłoby samym
 * zniknięciem wiersza. Zdjęcie wyłączenia z użytku powodu nie potrzebuje - nie ma komu
 * tłumaczyć. Rozstrzyga to domena serwera; tutaj rozstrzyga, czy pole w ogóle stoi.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { BookingDto } from '../../api/dto';
import { useBooking, useCancelBooking, useCancelOwnBooking } from '../../queries/useCalendar';
import { useCancelOrder, useOrder, useWithdrawOrder } from '../../queries/useOrders';
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  LinkButton,
  Loadable,
  Pill,
  TextInput,
  type PillTone,
} from '../../ui/components';
import { BookIcon, PreviewIcon } from '../../ui/components/icons';
import { loadErrorMessage } from '../common/apiMessage';
import { leaderCard } from '../orders/leaderCard';
import { SEAT_LABEL, seekingLabel } from '../orders/orderLabels';
import { orderPath, threadPath } from '../orders/orderPaths';
import { orderErrorMessage } from '../orders/orderRefusal';
import { recipientPill } from '../orders/recipientCard';
import { ApprovalCard } from './ApprovalCard';
import { bookingErrorMessage } from './bookingRefusal';
import { cancelNote } from './cancelNote';
import type { CalendarAircraft } from './calendarGrid';
import { NONE } from '../common/values';
import {
  blockReasonLabel,
  drawerHeading,
  operationLabel,
  originLabel,
  stempel,
  plannedLabel,
  type PersonLookup,
} from './bookingLabels';
import {
  leaderPill,
  leaderRows,
  orderBookingRole,
  orderPeriodOf,
  resignNote,
  seatedRows,
  seekingWho,
  type OrderRowVm,
} from './orderBooking';
import { ownBookingState } from './ownBookingForm';
import { sessionPath } from '../logbook/logbookPaths';

interface Props {
  booking: BookingDto;
  reg: string;
  timezone: string;
  person: PersonLookup;
  canManage: boolean;
  /** „Podgląd klubu" - operacja z karty „Realizacja" otwiera się w dzienniku. */
  canSeeLog: boolean;
  /** Zalogowany - jego rezerwacja dostaje widok własny (K2b). */
  viewerId: string | null;
  /** Flota klubu - znak i typ maszyny do skrótu zlecenia (K2c). */
  aircraft: readonly CalendarAircraft[];
  /** „Przesuń i popraw" - szuflada własnej rezerwacji w trybie poprawki. */
  onEdit: (booking: BookingDto) => void;
  /** „Zarezerwuj inny termin" po rezerwacji zamkniętej. */
  onRebook: (booking: BookingDto) => void;
  onClose: () => void;
}

export function BookingDrawer({
  booking: fromGrid,
  reg,
  timezone,
  person,
  canManage,
  canSeeLog,
  viewerId,
  aircraft,
  onEdit,
  onRebook,
  onClose,
}: Props) {
  const [reason, setReason] = useState('');
  const cancel = useCancelBooking();
  const cancelOwn = useCancelOwnBooking();

  const isBlock = fromGrid.kind === 'block';

  // Stan ścieżki akceptacji (3.1.0) jedzie OSOBNYM odczytem, nie w oknie kalendarza:
  // siatka o kroki nie pyta. Wyłączenie z użytku ścieżki nie ma - nie pytamy.
  const detail = useBooking(isBlock ? null : fromGrid.id);
  // Wiersz z tego odczytu jest świeższy o decyzje sprzed chwili - stan (czeka, odrzucona)
  // bierze się stąd, gdy już przyszedł.
  const booking = detail.data?.booking ?? fromGrid;
  const naglowek = drawerHeading(booking, reg, timezone);

  // Zlecenie za tą rezerwacją (K2c) - kto patrzy, rozstrzyga sama rezerwacja.
  const role = orderBookingRole(booking, viewerId, canManage);
  const orderId = booking.order?.id ?? null;
  const seeking = booking.order?.seeking ?? [];
  // Karta zlecenia - skrót prowadzącego i plakietka adresata. Członek spoza adresatów jej
  // nie dostaje (serwer nie daje mu identyfikatora), osoba w fotelu jej nie potrzebuje.
  const orderCard = useOrder(role === 'leader' || role === 'recipient' ? orderId : null);

  const own = role === 'seated' || (role == null && !isBlock && viewerId != null && booking.pilotId === viewerId);
  const state = ownBookingState(booking, Date.now());
  const live = state !== 'closed';

  // Powód wymagany WYŁĄCZNIE przy cudzej rezerwacji - zdjęcie wyłączenia z użytku
  // idzie bez niego, bo nie ma komu tłumaczyć.
  const needsReason = !isBlock;
  const blocked = needsReason && reason.trim() === '';

  // Fotele i stan - z nich zdanie o skutku odwołania mówi, kto dostanie wiadomość.
  const seats = {
    kind: booking.kind,
    status: booking.status,
    pilotId: booking.pilotId,
    dualId: booking.dualId ?? null,
  };

  const pill = role === 'leader' ? leaderPill(booking) : null;
  // Prowadzący, do którego to zlecenie TEŻ trafiło - autor adresatem nie bywa.
  const asked = role === 'leader' && orderCard.data != null ? recipientPill(orderCard.data, 'Czeka na Twoją odpowiedź') : null;
  const period = orderPeriodOf(booking, Date.now());

  return (
    <Drawer
      title={naglowek.title}
      sub={
        pill == null ? (
          naglowek.sub
        ) : (
          <>
            <Pill tone={pill.tone}>{pill.text}</Pill> {naglowek.sub}
          </>
        )
      }
      onClose={onClose}
    >
      {role === 'leader' && orderId != null ? (
        <Card
          title="Zlecenie"
          // Koordynator z „Cudzymi rezerwacjami" bywa też ADRESATEM cudzego zlecenia - wtedy
          // skrót zostaje, ale plakietka mówi, że zlecenie czeka na niego, a drzwi otwierają
          // kartę jego oczami (`orderView`: z „Do mnie" - adresat).
          actions={asked == null ? undefined : <Pill tone={asked.tone}>{asked.text}</Pill>}
        >
          <Loadable
            pending={orderCard.isPending}
            loaded={orderCard.data != null}
            skeleton={<span className="skeleton" style={{ width: '100%', height: 132 }} />}
          >
            {orderCard.data == null ? null : (
              <LeaderRows card={orderCard.data} aircraft={aircraft} person={person} viewerId={viewerId} />
            )}
          </Loadable>
          {orderCard.error == null ? null : <p className="card-note danger">{loadErrorMessage(orderCard.error)}</p>}
          <LinkButton to={orderPath(orderId, asked == null ? 'zlecone' : 'do-mnie', period)}>Otwórz zlecenie</LinkButton>
        </Card>
      ) : role === 'recipient' || role === 'outsider' ? (
        <SeekingCard
          booking={booking}
          person={person}
          pill={
            role === 'recipient'
              ? orderCard.data == null
                ? null
                : recipientPill(orderCard.data, 'Czeka na Twoją odpowiedź')
              : { text: seekingLabel(seeking) ?? 'Szuka załogi', tone: 'blue' }
          }
          open={role === 'recipient' && orderId != null ? orderPath(orderId, 'do-mnie', period) : null}
        />
      ) : (
        <Card title={isBlock ? 'Wyłączenie z użytku' : 'Rezerwacja'}>
          {isBlock ? (
            <Row label="Powód">{blockReasonLabel(booking.blockReason)}</Row>
          ) : (
            <>
              <CrewRows booking={booking} person={person} viewerId={viewerId} own={own} fromOrder={role === 'seated'} />
              {/* CUDZA rezerwacja bez „Podglądu klubu" (issue #216) zadania nie niesie -
                  wiersza wtedy NIE MA: kreska mówiłaby „nikt nie wpisał", a wpisano. */}
              {booking.operation === undefined ? null : (
                <Row label="Zadanie">{operationLabel(booking.operation)}</Row>
              )}
              {booking.fromIcao == null && booking.toIcao == null ? null : (
                <Row label="Trasa">
                  <span className="mono">
                    {[booking.fromIcao, booking.toIcao].filter((x) => x != null).join(' → ')}
                  </span>
                </Row>
              )}
              {booking.plannedAirMin == null && booking.plannedFuelL == null ? null : (
                <Row label="Plan lotu">{plannedLabel(booking)}</Row>
              )}
            </>
          )}
          {booking.note == null || booking.note === '' ? null : (
            <Row label="Notatka">{booking.note}</Row>
          )}
          {/* Rezerwacja ze zlecenia mówi, SKĄD jest - i prowadzi do rozmowy z osobą
              zlecającą, bo tam uzgadnia się zmianę terminu (§14.3). „Założona" byłaby
              zdaniem o zleceniu, nie o mnie. */}
          {role === 'seated' && orderId != null && viewerId != null ? (
            <FromOrderRow
              creatorId={booking.order?.createdBy ?? null}
              person={person}
              to={threadPath(orderId, viewerId, 'do-mnie', period)}
            />
          ) : booking.createdAt == null ? null : (
            <Row label="Założona">
              {stempel(new Date(booking.createdAt), timezone)}{' '}
              <span className="cell-sub">{originLabel(booking, person, viewerId)}</span>
            </Row>
          )}
        </Card>
      )}

      {/* Ścieżka akceptacji (K2a): historia decyzji i - dla „Cudzych rezerwacji" -
          decyzja za utknięty krok. Karta istnieje wyłącznie, gdy klub ma ścieżkę;
          rozstrzyga to `ApprovalCard`. Stan wiersza bierze się z TEGO odczytu, nie
          z okna kalendarza - jest świeższy o decyzje sprzed chwili. */}
      {/* Cudza sprawa bez „Podglądu klubu" (issue #216) przychodzi z `approval: null`:
          historia kroków i powody odmowy są treścią tej samej klasy, co notatka.
          Zlecenie ścieżki nie ma - nie pyta jej nikt (§2.1). */}
      {isBlock || role != null ? null : detail.error != null ? (
        <p className="card-note danger">{loadErrorMessage(detail.error)}</p>
      ) : detail.data?.approval == null ? null : (
        <ApprovalCard
          bookingId={booking.id}
          view={detail.data.approval}
          person={person}
          timezone={detail.data.timezone === '' ? timezone : detail.data.timezone}
          canDecide={canManage && !own && booking.status === 'pending'}
        />
      )}

      {/* Operacja, która ją zrealizowała - pojawia się DOPIERO po locie, bo wiąże je
          zdarzenie z rejestru. Do tego czasu wiersza nie ma: pusty byłby zdaniem
          o przyszłości. Zlecenie bez kompletu załogi tej karty nie ma: lot bez załogi
          nie ma czego realizować. */}
      {isBlock || (own && state === 'closed') || seeking.length > 0 ? null : (
        <Card title="Realizacja">
          {booking.sessionUuid == null ? (
            <EmptyState
              icon={<BookIcon />}
              title="Lot jeszcze się nie odbył"
              note="Po zdaniu samolotu stanie tu operacja z dziennika."
            />
          ) : (
            // Operacja jako DRZWI do dziennika, nie identyfikator - do 4.0.0 stał tu surowy
            // uuid (przegląd treści 2026-10-08). Bez „Podglądu klubu" dziennika nie ma.
            <Row label="Operacja">
              {canSeeLog ? (
                <Link className="cell-link" to={sessionPath(reg, booking.sessionUuid, { from: '', to: '' })}>
                  Pokaż w dzienniku
                </Link>
              ) : (
                'zapisana w dzienniku klubu'
              )}
            </Row>
          )}
        </Card>
      )}

      {role === 'leader' && orderId != null ? (
        live ? (
          <CancelOrderCard orderId={orderId} timezone={timezone} person={person} onDone={onClose} />
        ) : null
      ) : role === 'seated' && orderId != null ? (
        live ? (
          <ResignCard
            orderId={orderId}
            note={resignNote(booking, person)}
            timezone={timezone}
            person={person}
            onDone={onClose}
          />
        ) : null
      ) : role != null ? null : own ? (
        <>
          {state !== 'movable' ? null : (
            <Card title="Zmiana terminu">
              {booking.status === 'pending' ? (
                <p className="card-note">
                  <b>Zmiana terminu wyczyści dotychczasowe zgody</b> - ścieżka zacznie od nowa. Zadanie,
                  trasę i notatkę możesz poprawić bez tego.
                </p>
              ) : (
                <p className="card-note">
                  Poprawka wraca do formularza z Twoim wpisem. Inna maszyna to nowa rezerwacja.
                </p>
              )}
              <Button onClick={() => onEdit(booking)}>Przesuń i popraw</Button>
            </Card>
          )}
          {state === 'closed' ? (
            <Card title="Co dalej">
              <p className="card-note">Termin wrócił do puli. Zadanie i trasa przejdą do nowej rezerwacji.</p>
              <Button onClick={() => onRebook(booking)}>Zarezerwuj inny termin</Button>
            </Card>
          ) : (
            <Card title="Odwołanie rezerwacji" tone="danger">
              {/* Czekająca sprawa miała prośbę o zgodę - jej osoby dostaną wiadomość
                  (decyzja właściciela 2026-09-27), a drugi pilot - że lotu nie będzie
                  (§12.9). Powodu nie ma: to własny plan. */}
              <p className="card-note">{cancelNote({ ...seats, viewerId })}</p>
              {cancelOwn.error == null ? null : (
                <p className="card-note danger">{bookingErrorMessage(cancelOwn.error, timezone, person)}</p>
              )}
              <Button
                variant="danger"
                disabled={cancelOwn.isPending}
                onClick={() => cancelOwn.mutate(booking.id, { onSuccess: onClose })}
              >
                Odwołaj rezerwację
              </Button>
            </Card>
          )}
        </>
      ) : canManage && (booking.status === 'confirmed' || booking.status === 'pending') ? (
        /* Zamkniętej zajętości nie odwołuje się drugi raz, a bez uprawnienia nie ma
           przycisku - nie ma przycisku wyszarzonego (`panel-2.0.md` §3.3). */
        <Card title={isBlock ? 'Zdjęcie wyłączenia' : 'Odwołanie rezerwacji'} tone="danger">
          {/* Skutek PRZED kliknięciem (§12.9): osoby w fotelach dostają powód w aplikacji -
              poza odwołującym, który bywa drugim pilotem. */}
          <p className="card-note">{cancelNote({ ...seats, viewerId })}</p>
          {needsReason ? (
            <Field htmlFor="cancel-reason" label="Powód">
              <TextInput
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Np. przegląd przesunięty na piątek"
              />
            </Field>
          ) : null}
          {cancel.error == null ? null : (
            <p className="card-note danger">{bookingErrorMessage(cancel.error, timezone, person)}</p>
          )}
          <Button
            variant="danger"
            disabled={blocked || cancel.isPending}
            onClick={() =>
              cancel.mutate(
                { id: booking.id, reason: reason.trim() === '' ? null : reason.trim() },
                { onSuccess: onClose },
              )
            }
          >
            {isBlock ? 'Zdejmij wyłączenie' : 'Odwołaj rezerwację'}
          </Button>
        </Card>
      ) : null}
    </Drawer>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="kv-k">{label}</span>
      <span className="kv-v">{children}</span>
    </div>
  );
}

/** Wiersz gotowego skrótu - wartość i przypis po niej (`.cell-sub`). */
function VmRow({ row }: { row: OrderRowVm }) {
  return (
    <Row label={row.label}>
      {row.value}
      {row.sub == null ? null : <span className="cell-sub">{row.sub}</span>}
    </Row>
  );
}

/** Skrót prowadzącego: treść, fotel po fotelu, kto zleca - liczony z karty zlecenia. */
function LeaderRows({
  card,
  aircraft,
  person,
  viewerId,
}: {
  card: NonNullable<ReturnType<typeof useOrder>['data']>;
  aircraft: readonly CalendarAircraft[];
  person: PersonLookup;
  viewerId: string | null;
}) {
  const vm = leaderCard({
    card,
    now: Date.now(),
    viewerId,
    person,
    aircraft: (id) => {
      const plane = aircraft.find((a) => a.id === id);
      return plane == null ? null : { reg: plane.reg, type: plane.type };
    },
  });
  if (vm == null) return null;
  return (
    <>
      {leaderRows(vm, card, person, viewerId).map((row) => (
        <VmRow key={row.label} row={row} />
      ))}
    </>
  );
}

/**
 * Adresat i członek spoza adresatów: kto już leci, kogo brakuje - i dla adresata drzwi do
 * karty zlecenia. Treści zlecenia tu nie ma (adresat czyta ją na karcie, obcy wcale).
 */
function SeekingCard({
  booking,
  person,
  pill,
  open,
}: {
  booking: BookingDto;
  person: PersonLookup;
  pill: { text: string; tone: PillTone } | null;
  open: string | null;
}) {
  const who = seekingWho(booking.order?.seeking ?? []);
  return (
    <Card title="Zlecenie" actions={pill == null ? undefined : <Pill tone={pill.tone}>{pill.text}</Pill>}>
      {seatedRows(booking, person).map((row) => (
        <VmRow key={row.label} row={row} />
      ))}
      {who == null ? null : <Row label="Szuka">{who}</Row>}
      {open == null ? null : <LinkButton to={open}>Otwórz zlecenie</LinkButton>}
    </Card>
  );
}

/**
 * Fotele rezerwacji. Przy rezerwacji ZE ZLECENIA (decyzja 23) drugi pilot widzi tę samą
 * szufladę, co dowódca - wtedy wiersz dowódcy nazywa się „Dowódca", a „Ty" stoi przy
 * drugim pilocie; fotel, którego zlecenie jeszcze szuka, mówi „szukany".
 */
function CrewRows({
  booking,
  person,
  viewerId,
  own,
  fromOrder,
}: {
  booking: BookingDto;
  person: PersonLookup;
  viewerId: string | null;
  own: boolean;
  fromOrder: boolean;
}) {
  const sought = booking.order?.seeking ?? [];
  const dualIsMe = viewerId != null && booking.dualId === viewerId;
  const label = (id: string | null) =>
    id != null && id === viewerId && own ? ownLabel(id, person) : personLabel(id, person);
  return (
    <>
      <Row label={fromOrder && dualIsMe ? SEAT_LABEL.pic : 'Pilot'}>
        {booking.pilotId == null && sought.includes('pic') ? 'szukany' : label(booking.pilotId)}
      </Row>
      {booking.dualId == null ? (
        fromOrder && sought.includes('dual') ? <Row label={SEAT_LABEL.dual}>szukany</Row> : null
      ) : (
        <Row label={SEAT_LABEL.dual}>{label(booking.dualId)}</Row>
      )}
    </>
  );
}

/** „Ze zlecenia · Marta Zięba MZI" - drzwi do rozmowy, w której uzgadnia się termin. */
function FromOrderRow({ creatorId, person, to }: { creatorId: string | null; person: PersonLookup; to: string }) {
  const who = creatorId == null ? null : person(creatorId);
  return (
    <Row label="Ze zlecenia">
      <Link className="go" to={to} aria-label={`Rozmowa · ${who?.name ?? 'osoba zlecająca'}`}>
        {who?.name ?? NONE} {who == null ? null : <span className="cell-sub mono">{who.code}</span>}
        <PreviewIcon />
      </Link>
      <span className="cell-sub">termin uzgodnisz w rozmowie</span>
    </Row>
  );
}

/**
 * Odwołanie z kalendarza przez prowadzącego to odwołanie ZLECENIA (§16 pkt 9) - te same
 * wiadomości, co z karty zlecenia, i powód OPCJONALNY (decyzja 16).
 */
function CancelOrderCard({
  orderId,
  timezone,
  person,
  onDone,
}: {
  orderId: string;
  timezone: string;
  person: PersonLookup;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const cancel = useCancelOrder(orderId);
  return (
    <Card title="Odwołanie zlecenia" tone="danger">
      <p className="card-note">Termin wróci do puli, a adresaci bez odmowy dostaną wiadomość „Zlecenie odwołane".</p>
      <Field htmlFor="k2c-reason" label="Powód" action={<span className="pill dim">opcjonalne</span>}>
        <TextInput
          id="k2c-reason"
          value={reason}
          maxLength={500}
          placeholder="Np. prognoza - front od zachodu"
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {cancel.error == null ? null : <p className="card-note danger">{orderErrorMessage(cancel.error, timezone, person)}</p>}
      <Button
        variant="danger"
        disabled={cancel.isPending}
        onClick={() => cancel.mutate(reason.trim() === '' ? null : reason.trim(), { onSuccess: onDone })}
      >
        {cancel.isPending ? 'Odwołuję…' : 'Odwołaj zlecenie'}
      </Button>
    </Card>
  );
}

/**
 * „Rezygnuję" osoby w fotelu (§5.3): fotel wraca do szukania, termin zostaje zajęty,
 * zlecający dostaje „Rezygnacja z lotu". Powód opcjonalny (decyzja 16).
 */
function ResignCard({
  orderId,
  note,
  timezone,
  person,
  onDone,
}: {
  orderId: string;
  note: string;
  timezone: string;
  person: PersonLookup;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const withdraw = useWithdrawOrder(orderId);
  return (
    <Card title="Rezygnacja z lotu" tone="danger">
      <p className="card-note">{note}</p>
      <Field htmlFor="k2c-resign" label="Powód" action={<span className="pill dim">opcjonalne</span>}>
        <TextInput
          id="k2c-resign"
          value={reason}
          maxLength={500}
          placeholder="Np. w sobotę jednak nie dam rady"
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {withdraw.error == null ? null : (
        <p className="card-note danger">{orderErrorMessage(withdraw.error, timezone, person)}</p>
      )}
      <Button
        variant="danger"
        disabled={withdraw.isPending}
        onClick={() => withdraw.mutate(reason.trim() === '' ? null : reason.trim(), { onSuccess: onDone })}
      >
        {withdraw.isPending ? 'Rezygnuję…' : 'Rezygnuję'}
      </Button>
    </Card>
  );
}

function personLabel(id: string | null, person: PersonLookup): React.ReactNode {
  if (id == null) return NONE;
  const who = person(id);
  // Nazwisko czyta się bez zaglądania do listy członków, kod odróżnia dwóch Nowaków.
  // Brak w cache daje kreskę, nigdy surowego identyfikatora: `7c1e5a9b-…` nie mówi
  // nic nikomu, a w produkcji piloci mają uuid z panelu.
  if (who == null) return NONE;
  return (
    <>
      {who.name} <span className="cell-sub mono">{who.code}</span>
    </>
  );
}

/** „Ty · Michał Wilk MWI" - nazwisko własne czytałoby się jak cudze (makieta K2b). */
function ownLabel(id: string | null, person: PersonLookup): React.ReactNode {
  const who = id == null ? null : person(id);
  if (who == null) return 'Ty';
  return (
    <>
      Ty{' '}
      <span className="cell-sub">
        · {who.name} <span className="mono">{who.code}</span>
      </span>
    </>
  );
}
