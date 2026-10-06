/**
 * Ninerdeck - KTÓRĄ KARTĘ ZLECENIA POKAZAĆ (4.0.0, epik Z-C #247; makiety 28, 32).
 *
 * Jedna trasa (`Order`) prowadzi do dwóch kart: adresata (28) i prowadzącego (32). Zwykle
 * rozstrzyga sam kształt odpowiedzi serwera - adresat nie prowadzi, prowadzący nie jest
 * adresatem. Wyjątkiem jest osoba z „Cudzymi rezerwacjami", która prowadzi zlecenia całego
 * klubu (pkt 20) i bywa przy tym adresatem: wtedy decyduje, SKĄD przyszła - z „Do mnie"
 * zlecenie pyta ją o odpowiedź, z „Zlecone" prowadzi je ona.
 *
 * Bez wskazania wygrywa adresat: zlecenie, które czeka na CZYJĄŚ odpowiedź, ma ją dostać,
 * a karta prowadzącego jest o jedno tapnięcie dalej - z listy „Zlecone".
 */

import type { RemoteOrderCard } from '../../../application';

export type OrderCardMode = 'recipient' | 'leader' | 'none';

/** Skąd przyszedł pilot - z „Do mnie" (`recipient`) albo z „Zlecone" (`leader`). */
export type OrderCardIntent = 'recipient' | 'leader';

export function orderCardMode(viewer: RemoteOrderCard['viewer'], intent?: OrderCardIntent): OrderCardMode {
  if (intent === 'leader' && viewer.leads) return 'leader';
  if (viewer.recipient != null) return 'recipient';
  return viewer.leads ? 'leader' : 'none';
}
