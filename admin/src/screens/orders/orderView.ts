/**
 * Ninerdeck - panel: CZYIMI OCZAMI pokazać kartę zlecenia (4.0.0, epik Z-D #248;
 * `docs/zlecenia.md` §13.1).
 *
 * Osoba bywa prowadzącym i adresatem naraz - koordynator z „Cudzymi rezerwacjami", do
 * którego trafiło cudze zlecenie. Rozstrzyga połowa listy, z której przyszła: z „Zlecone"
 * - prowadzący, z „Do mnie" (albo z linku bez połowy) - adresat, bo zlecenie pyta wtedy
 * JEGO. Ta sama reguła, co `orderCardMode` w telefonie.
 *
 * Moduł czysty - test obok.
 */

import type { OrderCardDto } from '../../api/dto';
import type { OrderView } from './orderPaths';

export type OrderCardView = 'leader' | 'recipient' | 'none';

export function orderView(viewer: OrderCardDto['viewer'], from: OrderView | null): OrderCardView {
  if (from === 'zlecone' && viewer.leads) return 'leader';
  if (viewer.recipient != null) return 'recipient';
  return viewer.leads ? 'leader' : 'none';
}
