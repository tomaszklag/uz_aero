/**
 * Ninerdeck - panel: SZUFLADA ZLECENIA (`#/zlecenia/:id`; makieta `zlecenia-szczegoly`;
 * 4.0.0, epik Z-D #248) - pobiera kartę i wybiera, czyimi oczami ją pokazać.
 *
 * ══ KTÓRE OCZY ══
 * Kształt karty zależy od widza (§13.1), a osoba bywa prowadzącym i adresatem naraz
 * (koordynator, do którego trafiło cudze zlecenie). Rozstrzyga połowa listy, z której
 * przyszła (`orderView.ts`) - ta sama reguła, co w telefonie (`orderCardMode`).
 *
 * ══ LOT JUŻ MÓJ = REZERWACJA ══
 * Karta zlecenia nie ma stanu „przyjęte" (§14.3): adresat, który siedzi w fotelu - po
 * przyjęciu, przydziale albo z linku w wiadomości „Lot przydzielony" - trafia do szuflady
 * rezerwacji w kalendarzu.
 */

import { Navigate, useNavigate } from 'react-router-dom';

import type { DirectoryDto } from '../../api/dto';
import { useOrder } from '../../queries/useOrders';
import { Drawer } from '../../ui/components';
import { loadErrorMessage } from '../common/apiMessage';
import { LeaderDrawer } from './LeaderDrawer';
import { RecipientDrawer } from './RecipientDrawer';
import { orderLookups } from './orderLookups';
import { orderView } from './orderView';
import { threadPath, type OrderPeriod, type OrderView } from './orderPaths';

interface Props {
  orderId: string;
  /** Połowa listy pod szufladą - mówi, czy wchodzi się jako prowadzący, czy adresat. */
  from: OrderView | null;
  viewerId: string | null;
  /** Okres listy pod szufladą - rozmowa otwiera się nad tą samą listą. */
  period: OrderPeriod;
  directory: DirectoryDto | undefined;
  onClose: () => void;
}

export function OrderDrawer({ orderId, from, viewerId, period, directory, onClose }: Props) {
  const card = useOrder(orderId);
  const lookups = orderLookups(directory);
  const navigate = useNavigate();
  const toBooking = (bookingId: string): string => `/kalendarz/${encodeURIComponent(bookingId)}`;

  if (card.data == null) {
    // Plamki w geometrii szuflady (tytuł i dwie karty), a nie pusty panel - i nie spinner.
    return (
      <Drawer title="Zlecenie" onClose={onClose}>
        {card.error != null ? (
          <p className="card-note danger">{loadErrorMessage(card.error)}</p>
        ) : (
          <>
            <span className="skeleton" style={{ width: '100%', height: 120 }} />
            <span className="skeleton" style={{ width: '100%', height: 180 }} />
          </>
        )}
      </Drawer>
    );
  }

  const view = orderView(card.data.viewer, from);
  if (view === 'none') return null;
  if (view === 'recipient') {
    const me = card.data.viewer.recipient;
    if (me != null && me.inPlay && me.assignedSeat != null) return <Navigate to={toBooking(card.data.booking.id)} replace />;
    return (
      <RecipientDrawer
        card={card.data}
        orderId={orderId}
        person={lookups.person}
        aircraft={lookups.aircraft}
        threadHref={threadPath(orderId, viewerId ?? '', 'do-mnie', period)}
        onClose={onClose}
        onBooking={(bookingId) => navigate(toBooking(bookingId), { replace: true })}
      />
    );
  }
  return (
    <LeaderDrawer
      card={card.data}
      orderId={orderId}
      viewerId={viewerId}
      person={lookups.person}
      aircraft={lookups.aircraft}
      members={directory?.members ?? []}
      threadHref={(pilotId) => threadPath(orderId, pilotId, 'zlecone', period)}
      onClose={onClose}
    />
  );
}
