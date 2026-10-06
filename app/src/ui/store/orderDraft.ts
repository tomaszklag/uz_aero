/**
 * Ninerdeck - szkic zlecenia (stan UI, nie domena; 4.0.0, epik Z-C #247).
 *
 * Trzy kroki (31 → 31A → 31B) budują JEDNO żądanie `POST /orders`. Dopóki prowadzący nie
 * tapnie „WYŚLIJ ZLECENIE", nie ma niczego - ani na serwerze, ani w rejestrze - więc szkic
 * żyje w pamięci UI, jak szkic rezerwacji. Zlecenie nie jest zdarzeniem rejestru (§2.3):
 * rozstrzyga je serwer, a nie kolejka wysyłki.
 *
 * Reguły szkicu (fotele, sposoby adresowania, wspólna lista) mieszkają w czystym
 * `screens/logic/orderForm.ts` - magazyn tylko je wykonuje.
 */

import { create } from 'zustand';

import { emptyOrderDraft, type OrderDraft } from '../screens/logic/orderForm';
import { withRouteShape } from '../screens/logic/routeShape';

interface OrderDraftStore extends OrderDraft {
  /** Otwarcie formularza: pusty szkic plus to, co podała nawigacja albo „Powiel". */
  start(seed: Partial<OrderDraft>): void;
  set<K extends keyof OrderDraft>(key: K, value: OrderDraft[K]): void;
  /** Kilka pól jednym ruchem - slot z sugestii ustawia oba końce terminu naraz. */
  patch(change: Partial<OrderDraft>): void;
  /** Zmiana policzona czystą regułą szkicu (`orderForm.ts`). */
  update(change: (draft: OrderDraft) => OrderDraft): void;
  reset(): void;
}

/** Sam szkic, bez metod magazynu - wejście reguł `orderForm.ts`. */
export function draftOf(state: OrderDraft): OrderDraft {
  const empty = emptyOrderDraft();
  return Object.fromEntries((Object.keys(empty) as (keyof OrderDraft)[]).map((key) => [key, state[key]])) as unknown as OrderDraft;
}

export const useOrderDraft = create<OrderDraftStore>((set) => ({
  ...emptyOrderDraft(),

  start(seed) {
    // Formularz zaczyna się ZAWSZE od pustego szkicu plus tego, co podano - porzucony
    // formularz wracający z wyborami sprzed godziny czyta się jak podpowiedź (issue #55).
    set(withRouteShape({ ...emptyOrderDraft(), ...seed }));
  },

  set(key, value) {
    set((state) => withRouteShape({ ...draftOf(state), [key]: value }));
  },

  patch(change) {
    set((state) => withRouteShape({ ...draftOf(state), ...change }));
  },

  update(change) {
    set((state) => withRouteShape(change(draftOf(state))));
  },

  reset() {
    set(emptyOrderDraft());
  },
}));
