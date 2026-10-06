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
 * ══ ODWOŁANIE CUDZEJ WYMAGA POWODU, ALE NIE ZAWSZE ══
 * Pilot czyta powód w aplikacji, więc zdjęcie CUDZEGO planu bez słowa byłoby samym
 * zniknięciem wiersza. Zdjęcie wyłączenia z użytku powodu nie potrzebuje - nie ma komu
 * tłumaczyć. Rozstrzyga to domena serwera; tutaj rozstrzyga, czy pole w ogóle stoi.
 */

import { useState } from 'react';

import type { BookingDto } from '../../api/dto';
import { useBooking, useCancelBooking, useCancelOwnBooking } from '../../queries/useCalendar';
import { Button, Card, Drawer, EmptyState, Field, TextInput } from '../../ui/components';
import { BookIcon } from '../../ui/components/icons';
import { loadErrorMessage } from '../common/apiMessage';
import { ApprovalCard } from './ApprovalCard';
import { bookingErrorMessage } from './bookingRefusal';
import { cancelNote } from './cancelNote';
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
import { ownBookingState } from './ownBookingForm';

interface Props {
  booking: BookingDto;
  reg: string;
  timezone: string;
  person: PersonLookup;
  canManage: boolean;
  /** Zalogowany - jego rezerwacja dostaje widok własny (K2b). */
  viewerId: string | null;
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
  viewerId,
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

  const own = !isBlock && viewerId != null && booking.pilotId === viewerId;
  const state = ownBookingState(booking, Date.now());

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

  return (
    <Drawer title={naglowek.title} sub={naglowek.sub} onClose={onClose}>
      <Card title={isBlock ? 'Wyłączenie z użytku' : 'Rezerwacja'}>
        {isBlock ? (
          <Row label="Powód">{blockReasonLabel(booking.blockReason)}</Row>
        ) : (
          <>
            <Row label="Pilot">{own ? ownLabel(booking.pilotId, person) : personLabel(booking.pilotId, person)}</Row>
            {booking.dualId == null ? null : (
              <Row label="Drugi pilot">{personLabel(booking.dualId, person)}</Row>
            )}
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
        {booking.createdAt == null ? null : (
          <Row label="Założona">
            {stempel(new Date(booking.createdAt), timezone)}{' '}
            <span className="cell-sub">{originLabel(booking, person, viewerId)}</span>
          </Row>
        )}
      </Card>

      {/* Ścieżka akceptacji (K2a): historia decyzji i - dla „Cudzych rezerwacji" -
          decyzja za utknięty krok. Karta istnieje wyłącznie, gdy klub ma ścieżkę;
          rozstrzyga to `ApprovalCard`. Stan wiersza bierze się z TEGO odczytu, nie
          z okna kalendarza - jest świeższy o decyzje sprzed chwili. */}
      {/* Cudza sprawa bez „Podglądu klubu" (issue #216) przychodzi z `approval: null`:
          historia kroków i powody odmowy są treścią tej samej klasy, co notatka. */}
      {isBlock ? null : detail.error != null ? (
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
          o przyszłości. */}
      {isBlock || (own && state === 'closed') ? null : (
        <Card title="Realizacja">
          {booking.sessionUuid == null ? (
            <EmptyState
              icon={<BookIcon />}
              title="Lot jeszcze się nie odbył"
              note="Po zdaniu samolotu stanie tu operacja z dziennika."
            />
          ) : (
            <Row label="Operacja">
              <span className="mono">{booking.sessionUuid}</span>
            </Row>
          )}
        </Card>
      )}

      {own ? (
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
