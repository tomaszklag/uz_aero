/**
 * Ninerdeck - panel: szuflada JEDNEJ zajętości (`#/kalendarz/:id`, issue #160 D3).
 *
 * Adres własny, bo szuflada opisuje osobny byt - tak jak w module Piloci. Dzięki temu
 * link do konkretnej rezerwacji da się wkleić w rozmowie („zobacz, co stoi we wtorek").
 *
 * ══ ODWOŁANIE WYMAGA POWODU, ALE NIE ZAWSZE ══
 * Pilot czyta powód w aplikacji, więc zdjęcie CUDZEGO planu bez słowa byłoby samym
 * zniknięciem wiersza. Zdjęcie wyłączenia z użytku powodu nie potrzebuje - nie ma komu
 * tłumaczyć. Rozstrzyga to domena serwera; tutaj rozstrzyga, czy pole w ogóle stoi.
 */

import { useState } from 'react';

import type { BookingDto } from '../../api/dto';
import { useCancelBooking } from '../../queries/useCalendar';
import { Button, Card, Drawer, EmptyState, Field, TextInput } from '../../ui/components';
import { BookIcon } from '../../ui/components/icons';
import { bookingErrorMessage } from './bookingRefusal';
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

interface Props {
  booking: BookingDto;
  reg: string;
  timezone: string;
  person: PersonLookup;
  canManage: boolean;
  onClose: () => void;
}

export function BookingDrawer({ booking, reg, timezone, person, canManage, onClose }: Props) {
  const [reason, setReason] = useState('');
  const cancel = useCancelBooking();

  const isBlock = booking.kind === 'block';
  const naglowek = drawerHeading(booking, reg, timezone);

  // Powód wymagany WYŁĄCZNIE przy cudzej rezerwacji - zdjęcie wyłączenia z użytku
  // idzie bez niego, bo nie ma komu tłumaczyć.
  const needsReason = !isBlock;
  const blocked = needsReason && reason.trim() === '';

  return (
    <Drawer
      title={naglowek.title}
      sub={naglowek.sub}
      onClose={onClose}
    >
      <Card title={isBlock ? 'Wyłączenie z użytku' : 'Rezerwacja'}>
        {isBlock ? (
          <Row label="Powód">{blockReasonLabel(booking.blockReason)}</Row>
        ) : (
          <>
            <Row label="Pilot">{personLabel(booking.pilotId, person)}</Row>
            {booking.dualId == null ? null : (
              <Row label="Drugi pilot">{personLabel(booking.dualId, person)}</Row>
            )}
            <Row label="Zadanie">{operationLabel(booking.operation)}</Row>
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
        <Row label="Założona">
          {stempel(new Date(booking.createdAt), timezone)}{' '}
          <span className="cell-sub">{originLabel(booking, person)}</span>
        </Row>
      </Card>

      {/* Operacja, która ją zrealizowała - pojawia się DOPIERO po locie, bo wiąże je
          zdarzenie z rejestru. Do tego czasu wiersza nie ma: pusty byłby zdaniem
          o przyszłości. */}
      {isBlock ? null : (
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

      {/* Zamkniętej zajętości nie odwołuje się drugi raz, a bez uprawnienia nie ma
          przycisku - nie ma przycisku wyszarzonego (`panel-2.0.md` §3.3). */}
      {canManage && (booking.status === 'confirmed' || booking.status === 'pending') ? (
        <Card title={isBlock ? 'Zdjęcie wyłączenia' : 'Odwołanie rezerwacji'} tone="danger">
          <p className="card-note">
            {isBlock
              ? 'Termin zwolni się natychmiast i maszyna wróci do kalendarza.'
              : 'Pilot zobaczy powód w aplikacji. Termin zwolni się natychmiast.'}
          </p>
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
