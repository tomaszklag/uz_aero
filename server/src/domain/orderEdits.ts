/**
 * Ninerdeck (serwer) - EDYCJA ZLECENIA: co zmieniła i jak pogodzić zapisanych adresatów
 * z nowym adresowaniem (4.0.0, issue #245; `docs/zlecenia.md` §5.1, §5.2, §6.2).
 *
 * ══ ZMIANA ≠ PONOWNE WYSŁANIE ══
 * Dopisanie adresatów wysyła zlecenie WYŁĄCZNIE dopisanym (§5.2), a grupy rozwijają się
 * od nowa tylko przy „Wyślij ponownie" (pkt 41). Plan liczy się więc z całej definicji
 * adresowania (tylko wtedy wiadomo, kto jest jedynym adresatem fotela, a kto ma termin do
 * potwierdzenia), ale do zapisu wchodzi wyłącznie ten, kogo zmiana DOPUSZCZA - nowy
 * członek grupy wysłanej wczoraj czeka na „Wyślij ponownie".
 *
 * ══ WIERSZ ADRESATA JEST ZAPISEM (§5.2) ══
 * Osoba, której plan zniknął (wypadła z grupy, odeszła z klubu), zostaje w zapisie bez
 * zmian - zlecenie do niej poszło i to jest fakt. Sama zmiana NIKOGO nie odbiera: odebranie
 * jest osobną, jawną czynnością prowadzącego (pkt 29).
 *
 * ══ FOTEL NA „JA" ALBO „BRAK" USYPIA JEGO ADRESATÓW (decyzja właściciela 2026-09-29) ══
 * Adresaci fotela, którego zlecenie przestało szukać, dostają „Zlecenie nieaktualne · fotel
 * już niepotrzebny", ale ZOSTAJĄ adresatami: ich wiersz, fotel i zgłoszenie nie zmieniają
 * się wcale. Gdy prowadzący przestawi fotel z powrotem na „szukam", wracają do gry bez
 * ponownego dopisywania, a zgłoszenie sprzed uśpienia dalej się liczy.
 */

import type { PlannedRecipient } from './orderAddressing.ts';
import type { OrderSeats, Seat } from './orders.ts';

/** Wiersz adresata w postaci potrzebnej do pogodzenia planu z zapisem. */
export interface ExistingRecipient {
  pilotId: string;
  seat: Seat | null;
  namedSeat: Seat | null;
  direct: boolean;
  viaGroupId: string | null;
  removed: boolean;
}

export interface RecipientReconcile {
  /** Nowi adresaci - wyłącznie dopuszczeni przez tę zmianę; dostają „Zlecenie lotu". */
  added: PlannedRecipient[];
  /** Żywi adresaci, którym zmienił się plan (fotel, wskazanie imienne, „imiennie", grupa). */
  updated: PlannedRecipient[];
  /**
   * Odebrani (pkt 29), których prowadzący JAWNIE dopisał z powrotem - zlecenie wraca do
   * nich jak nowe (decyzja właściciela 2026-09-29).
   */
  restored: PlannedRecipient[];
}

/**
 * Plan po zmianie wobec zapisu.
 *
 * `admits` mówi, kogo wolno dopisać: osoby i członków grup z list dopisanych w tej zmianie
 * albo - przy „Wyślij ponownie" - każdego z planu. Wiersz ODEBRANY wraca WYŁĄCZNIE wtedy,
 * gdy `restores` go wskazuje: prowadzący dopisał tę osobę z powrotem jawnie, imiennie.
 * Ani „Wyślij ponownie", ani grupa, w której ta osoba jest, zlecenia jej nie przywracają.
 *
 * Adresata, którego w planie nie ma, funkcja nie rusza wcale - także adresata fotela
 * uśpionego (plan liczy się z samych szukanych foteli): jego wiersz czeka na powrót fotela.
 */
export function reconcileRecipients(
  existing: readonly ExistingRecipient[],
  plan: readonly PlannedRecipient[],
  admits: (pilotId: string) => boolean,
  restores: (pilotId: string) => boolean = () => false,
): RecipientReconcile {
  const rows = new Map(existing.map((row) => [row.pilotId, row]));
  const added: PlannedRecipient[] = [];
  const updated: PlannedRecipient[] = [];
  const restored: PlannedRecipient[] = [];

  for (const p of plan) {
    const row = rows.get(p.pilotId);
    if (row == null) {
      if (admits(p.pilotId)) added.push(p);
      continue;
    }
    if (row.removed) {
      if (restores(p.pilotId)) restored.push(p);
      continue;
    }
    const changed =
      row.seat !== p.seat ||
      row.namedSeat !== p.namedSeat ||
      row.direct !== p.direct ||
      row.viaGroupId !== p.viaGroupId;
    if (changed) updated.push(p);
  }

  return { added, updated, restored };
}

/** Pola zlecenia, o których zmianie mówi historia i wiadomość „edytowane" (§5.2, §10.3). */
export interface OrderFields {
  aircraftId: string;
  startsAt: number;
  endsAt: number;
  operation: string | null;
  fromIcao: string | null;
  toIcao: string | null;
  plannedAirMin: number | null;
  plannedFuelL: number | null;
  note: string | null;
  seats: OrderSeats;
}

/** Zmiana jednego pola: przed → po. Czasy jako napisy ISO, jak w reszcie wiadomości. */
export interface OrderFieldChange {
  from: unknown;
  to: unknown;
}

/**
 * Klucze zmian - surowe, jak kody odmowy. Karta adresata pisze z nich „Edytowane 15:10 ·
 * maszyna SP-AXA → SP-KLM", a nazwy po polsku są sprawą aplikacji i panelu.
 */
export type OrderFieldKey =
  | 'term'
  | 'aircraft'
  | 'operation'
  | 'route'
  | 'plannedAirMin'
  | 'plannedFuelL'
  | 'note'
  | 'seats';

export type OrderFieldChanges = Partial<Record<OrderFieldKey, OrderFieldChange>>;

/** Co zmieniła edycja; pusty obiekt = nic. Stała kolejność kluczy - historia porównuje się testem. */
export function fieldChanges(before: OrderFields, after: OrderFields): OrderFieldChanges {
  const out: OrderFieldChanges = {};
  if (before.startsAt !== after.startsAt || before.endsAt !== after.endsAt) {
    out.term = { from: term(before), to: term(after) };
  }
  if (before.aircraftId !== after.aircraftId) out.aircraft = { from: before.aircraftId, to: after.aircraftId };
  if (before.operation !== after.operation) out.operation = { from: before.operation, to: after.operation };
  if (before.fromIcao !== after.fromIcao || before.toIcao !== after.toIcao) {
    out.route = {
      from: { fromIcao: before.fromIcao, toIcao: before.toIcao },
      to: { fromIcao: after.fromIcao, toIcao: after.toIcao },
    };
  }
  if (before.plannedAirMin !== after.plannedAirMin) {
    out.plannedAirMin = { from: before.plannedAirMin, to: after.plannedAirMin };
  }
  if (before.plannedFuelL !== after.plannedFuelL) {
    out.plannedFuelL = { from: before.plannedFuelL, to: after.plannedFuelL };
  }
  if (before.note !== after.note) out.note = { from: before.note, to: after.note };
  if (before.seats.pic !== after.seats.pic || before.seats.dual !== after.seats.dual) {
    out.seats = { from: { ...before.seats }, to: { ...after.seats } };
  }
  return out;
}

const term = (fields: Pick<OrderFields, 'startsAt' | 'endsAt'>): { startsAt: string; endsAt: string } => ({
  startsAt: new Date(fields.startsAt).toISOString(),
  endsAt: new Date(fields.endsAt).toISOString(),
});
