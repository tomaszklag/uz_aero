/**
 * Ninerdeck - panel: SZUFLADA ZLECENIA (`#/zlecenia/:id`; makieta `zlecenia-szczegoly`;
 * 4.0.0, epik Z-D #248) - pobiera kartę i wybiera, czyimi oczami ją pokazać.
 *
 * ══ KTÓRE OCZY ══
 * Kształt karty zależy od widza (§13.1), a osoba bywa prowadzącym i adresatem naraz
 * (koordynator, do którego trafiło cudze zlecenie). Rozstrzyga połowa listy, z której
 * przyszła (`orderView.ts`) - ta sama reguła, co w telefonie (`orderCardMode`).
 *
 * Szuflada adresata dochodzi w kolejnym etapie epiku; do tego czasu adresat szuflady
 * nie dostaje, a wiersz „Do mnie" nigdzie jej nie otwiera.
 */

import type { DirectoryDto } from '../../api/dto';
import { useOrder } from '../../queries/useOrders';
import { Drawer } from '../../ui/components';
import { loadErrorMessage } from '../common/apiMessage';
import { LeaderDrawer } from './LeaderDrawer';
import { orderLookups } from './orderLookups';
import { orderView } from './orderView';
import type { OrderView } from './orderPaths';

interface Props {
  orderId: string;
  /** Połowa listy pod szufladą - mówi, czy wchodzi się jako prowadzący, czy adresat. */
  from: OrderView | null;
  viewerId: string | null;
  directory: DirectoryDto | undefined;
  onClose: () => void;
}

export function OrderDrawer({ orderId, from, viewerId, directory, onClose }: Props) {
  const card = useOrder(orderId);
  const lookups = orderLookups(directory);

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
  if (view !== 'leader') return null;
  return (
    <LeaderDrawer
      card={card.data}
      orderId={orderId}
      viewerId={viewerId}
      person={lookups.person}
      aircraft={lookups.aircraft}
      onClose={onClose}
    />
  );
}
